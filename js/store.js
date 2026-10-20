// Capa de datos. Dos implementaciones con la misma interfaz:
//  - FirebaseStore: Firestore con listeners en tiempo real (onSnapshot)
//  - LocalStore: localStorage ("modo demo"), sincroniza entre pestañas
//
// Modelo de datos (pensado para que un importador automático escriba después):
//  matches/{matchId}
//    date: "YYYY-MM-DD"        (fecha local Buenos Aires)
//    time: "HH:MM"             (hora local Buenos Aires, 24 h)
//    startsAt: number          (epoch ms, calculado con offset -03:00)
//    note: string
//    capacity: 14
//    source: "manual" | "texto" | "whatsapp"
//    sourceRef: string|null    (id del mensaje de origen, para deduplicar)
//    sourceText: string|null   (texto original del que se importó)
//    createdBy, updatedBy: "Gustavo" | "Martín" | "bot"
//    createdAt, updatedAt: number (epoch ms)
//  players/{playerId}
//    matchId, matchDate ("YYYY-MM-DD", copia para consultar por fecha)
//    name, phone (solo dígitos, formato wa.me, ej 5491112345678)
//    addedBy: "Gustavo" | "Martín"
//    createdAt, updatedAt
//    paid: bool                         (opcional)
//    amount: number|null                (pesos; solo si paid)
//    method: "efectivo"|"transferencia"|null
//    receivedBy: string|null           (quién cobró; null o ausente = "Sin especificar")
//    paidUpdatedBy, paidUpdatedAt
//    waiting: bool                      (true = lista de espera)
//    waitOrder: number|null             (menor = más prioridad; null si es titular)
//    rosterAt: number|null              (cuándo entró a la lista principal)
//    confirmToken: string               (link de confirmar.html; se crea al anotar al jugador)
//    confirmed: "si"|"no"               (respuesta del jugador)
//    confirmedAt, reminderSentAt: number
//    tentative: bool|null               (lugar reservado, a confirmar; ocupa cupo)
//    tentativeAt: number|null
//  roster/{rosterId}
//    name, phone (dígitos wa.me, o vacío)
//    createdBy, createdAt, updatedAt
//    level: 1..10
//    positions: ["Arquero"|"Defensa"|"Mediocampo"|"Ataque"]
//    notes: [{ id, matchId, matchDate, matchTime, text, createdAt, updatedAt }]
//    Misma persona = mismo phone. La colección es nueva: las reglas publicadas
//    la niegan hasta que se republican.
//  organizers/{slug}
//    name, createdAt
//    Id determinístico (gustavo, martin, lucia). Si la colección está vacía se
//    siembran los de config.js. Las reglas publicadas la niegan hasta republicar;
//    mientras tanto el selector sigue mostrando Gustavo y Martín.
//  El pago y la espera viven en el mismo documento del jugador. Las reglas
//  publicadas (validPlayer) permiten campos extra, así que receivedBy se puede
//  escribir sin republicar. La colección organizers sí hay que republicarla.
//
// matchId determinístico: "YYYY-MM-DD_HHMM" (si ya existe se agrega un sufijo),
// así un importador puede hacer upsert sin duplicar.
import { ORGANIZERS, firebaseConfig } from '../config.js';
import { toEpoch } from './dates.js';
import { paymentRecord, receivePendingTransfer } from './payments.js';
import { PRICES_DENIED_READ, priceRecord } from './prices.js';
import { nextWaitOrder } from './waiting.js';
import { confirmationIdentity, confirmationRecord, newConfirmToken, overlayConfirmations } from './reminders.js';
import { EVERYONE, accessPatch, canView, playerAccess } from './access.js';
import { ROSTER_DENIED_READ, isRosterDenied, rosterByPhone } from './roster.js';
import {
  ORGANIZERS_DENIED_READ, ORGANIZERS_DENIED_WRITE, cleanOrganizerName, isOrganizerDenied, organizerSlug, sameOrganizer,
} from './organizers.js';

export const DEMO_STORAGE_KEY = 'f7c-demo-db';

const FB_VERSION = '13.0.0';
const FB = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

let firebaseBundle = null;

/** Una sola app de Firebase. La sesión y el store la comparten. */
export async function initFirebase() {
  if (firebaseBundle) return firebaseBundle;
  const [{ initializeApp, getApps, getApp }, fs] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-firestore.js`),
  ]);
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  let db;
  try {
    db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch {
    db = fs.getFirestore(app);
  }
  firebaseBundle = { app, db, fs };
  return firebaseBundle;
}

export function isFirebaseConfigured(cfg = firebaseConfig) {
  if (!cfg || !cfg.apiKey || !cfg.projectId || !cfg.appId) return false;
  return !Object.values(cfg).some((v) => typeof v === 'string' && /^TU_|TU_PROYECTO|^$/.test(v));
}

export function matchIdFor(date, time, existingIds = new Set()) {
  const base = `${date}_${(time || '0000').replace(':', '')}`;
  if (!existingIds.has(base)) return base;
  for (let i = 2; ; i++) if (!existingIds.has(`${base}-${i}`)) return `${base}-${i}`;
}

const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function matchDoc(data, who) {
  const now = Date.now();
  const access = data?.access ? accessPatch(data.access) : null;
  return {
    date: data.date,
    time: data.time,
    startsAt: toEpoch(data.date, data.time),
    note: (data.note || '').trim(),
    capacity: data.capacity || 14,
    source: data.source || 'manual',
    sourceRef: data.sourceRef || null,
    sourceText: data.sourceText || null,
    createdBy: who, updatedBy: who,
    createdAt: now, updatedAt: now,
    ...(access || {}),
  };
}

/* ───────────── Modo demo (localStorage) ───────────── */
class LocalStore {
  constructor() { this.key = DEMO_STORAGE_KEY; this.mode = 'demo'; this.listeners = new Set(); this.actor = null; }
  setActor(user) {
    this.actor = { uid: user?.uid || '', name: user?.name || '' };
    if (this.listeners.size) this._emit();
  }
  _load() {
    try {
      const db = JSON.parse(localStorage.getItem(this.key)) || { matches: {}, players: {}, roster: {}, organizers: {}, confirmations: {}, settings: {} };
      db.matches ||= {}; db.players ||= {}; db.roster ||= {}; db.organizers ||= {}; db.confirmations ||= {}; db.settings ||= {};
      return db;
    } catch { return { matches: {}, players: {}, roster: {}, organizers: {}, confirmations: {}, settings: {} }; }
  }
  _touchConfirmations(db) {
    db.confirmations ||= {};
    const live = new Set();
    for (const [pid, player] of Object.entries(db.players)) {
      if (!player.confirmToken) continue;
      live.add(player.confirmToken);
      const prev = db.confirmations[player.confirmToken] || {};
      const match = db.matches[player.matchId] || null;
      const next = confirmationRecord({
        playerId: pid,
        player: { ...player, confirmed: prev.confirmed != null ? prev.confirmed : player.confirmed, confirmedAt: prev.confirmedAt != null ? prev.confirmedAt : player.confirmedAt },
        match,
      });
      db.confirmations[player.confirmToken] = next;
    }
    for (const token of Object.keys(db.confirmations)) if (!live.has(token)) delete db.confirmations[token];
  }
  _seedOrganizers(db) {
    if (Object.keys(db.organizers).length) return false;
    const now = Date.now();
    for (const raw of ORGANIZERS) {
      const clean = cleanOrganizerName(raw);
      if (!clean.ok) continue;
      db.organizers[organizerSlug(clean.name)] = { name: clean.name, createdAt: now };
    }
    return Object.keys(db.organizers).length > 0;
  }
  _save(db) { this._touchConfirmations(db); localStorage.setItem(this.key, JSON.stringify(db)); this._emit(); }
  _visible(matches, players, cards) {
    const uid = this.actor?.uid;
    if (!uid) return { matches, players, cards };
    const visible = matches.filter((match) => canView(match, uid));
    const ids = new Set(visible.map((match) => match.id));
    return {
      matches: visible,
      players: players.filter((player) => ids.has(player.matchId)),
      cards: cards.filter((card) => ids.has(card.matchId)),
    };
  }
  _emit() {
    const db = this._load();
    const loadedMatches = Object.entries(db.matches).map(([id, m]) => ({ id, ...m }));
    const loadedCards = Object.entries(db.confirmations || {}).map(([id, card]) => ({ id, ...card }));
    const loadedPlayers = Object.entries(db.players).map(([id, p]) => ({ id, ...p }));
    const visible = this._visible(loadedMatches, loadedPlayers, loadedCards);
    const matches = visible.matches;
    const cards = visible.cards;
    const players = overlayConfirmations(visible.players, cards);
    const roster = Object.entries(db.roster).map(([id, r]) => ({ id, ...r }));
    const organizers = Object.entries(db.organizers).map(([id, o]) => ({ id, ...o }));
    const prices = db.settings?.prices || null;
    this.listeners.forEach((fn) => fn({ matches, players, roster, rosterError: null, organizers, organizersError: null, prices, pricesError: null }));
  }
  async init() {
    if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === this.key) this._emit(); });
    const db = this._load();
    this._seedOrganizers(db);
    this._touchConfirmations(db);
    localStorage.setItem(this.key, JSON.stringify(db));
  }
  subscribe(fn) { this.listeners.add(fn); setTimeout(() => this._emit()); return () => this.listeners.delete(fn); }
  async addMatch(data, who) {
    const db = this._load();
    const id = matchIdFor(data.date, data.time, new Set(Object.keys(db.matches)));
    db.matches[id] = matchDoc(data, who); this._save(db); return id;
  }
  async addMatches(list, who) {
    const db = this._load(); const ids = [];
    for (const data of list) {
      const id = matchIdFor(data.date, data.time, new Set(Object.keys(db.matches)));
      db.matches[id] = matchDoc(data, who); ids.push(id);
    }
    this._save(db); return ids;
  }
  async updateMatch(id, data, who) {
    const db = this._load(); const m = db.matches[id]; if (!m) return;
    const access = data.access ? accessPatch(data.access) : null;
    const { access: _drop, ...rest } = data;
    Object.assign(m, rest, access || {}, { startsAt: toEpoch(data.date ?? m.date, data.time ?? m.time), updatedBy: who, updatedAt: Date.now() });
    const copied = playerAccess(m);
    for (const p of Object.values(db.players)) if (p.matchId === id) {
      if (data.date) p.matchDate = data.date;
      if (access) Object.assign(p, copied);
    }
    this._save(db);
  }
  async deleteMatch(id) {
    const db = this._load(); delete db.matches[id];
    for (const [pid, p] of Object.entries(db.players)) if (p.matchId === id) delete db.players[pid];
    this._save(db);
  }
  async addPlayer(match, data, who, opts = {}) {
    const db = this._load(); const id = rid(); const now = Date.now();
    const mates = Object.values(db.players).filter((p) => p.matchId === match.id);
    const cap = match.capacity || 14;
    const mainCount = mates.filter((p) => p.waiting !== true).length;
    const waiting = opts.waiting === true || mainCount >= cap;
    const rosterId = String(data.rosterId || '').trim();
    const hold = opts.tentative === true && !waiting;
    db.players[id] = {
      matchId: match.id, matchDate: match.date, name: data.name.trim(), phone: data.phone || '',
      addedBy: who, addedByUid: this.actor?.uid || '', createdAt: now, updatedAt: now,
      waiting, waitOrder: waiting ? nextWaitOrder(mates.filter((p) => p.waiting === true)) : null,
      rosterAt: waiting ? null : now,
      confirmToken: newConfirmToken(),
      ...playerAccess(match),
      ...(rosterId ? { rosterId } : {}),
      ...(hold ? { tentative: true, tentativeAt: now } : {}),
    };
    this._save(db); return id;
  }
  async updatePlayer(id, data) {
    const db = this._load(); if (!db.players[id]) return;
    Object.assign(db.players[id], data, { updatedAt: Date.now() }); this._save(db);
  }
  async setPayment(id, input, who) {
    const rec = paymentRecord(input, who);
    if (!rec.ok) throw Object.assign(new Error(rec.error), { code: 'invalid-payment' });
    await this.updatePlayer(id, rec.patch);
  }
  async markTransferReceived(id, who) {
    const player = this._load().players[id];
    if (!player) throw new Error('Jugador inexistente');
    const rec = receivePendingTransfer(player, who);
    if (!rec.ok) throw Object.assign(new Error(rec.error), { code: 'invalid-payment' });
    await this.updatePlayer(id, rec.patch);
  }
  async setWaitOrders(updates) {
    const db = this._load(); const now = Date.now();
    for (const u of updates || []) {
      if (!db.players[u.id]) continue;
      db.players[u.id].waitOrder = u.waitOrder;
      db.players[u.id].updatedAt = now;
    }
    this._save(db);
  }
  async promoteFromWaiting(id) {
    await this.updatePlayer(id, { waiting: false, waitOrder: null, rosterAt: Date.now() });
  }
  async clearTentative(id) {
    await this.updatePlayer(id, { tentative: null, tentativeAt: null });
  }
  async ensureConfirmToken(id) {
    const p = this._load().players[id];
    if (!p) throw new Error('Jugador inexistente');
    if (p.confirmToken) return p.confirmToken;
    const token = newConfirmToken();
    await this.updatePlayer(id, { confirmToken: token });
    return token;
  }
  async markReminderSent(id) {
    await this.updatePlayer(id, { reminderSentAt: Date.now() });
  }
  async deletePlayer(id) { const db = this._load(); delete db.players[id]; this._save(db); }
  async addRoster(data, who) {
    const db = this._load();
    const phone = data.phone || '';
    const existing = phone ? Object.entries(db.roster).find(([, r]) => r.phone === phone) : null;
    if (existing) throw Object.assign(new Error(`${existing[1].name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    const id = rid(); const now = Date.now();
    db.roster[id] = { name: data.name.trim(), phone, createdBy: who || '', createdAt: now, updatedAt: now };
    this._save(db); return id;
  }
  async updateRoster(id, data) {
    const db = this._load(); const cur = db.roster[id]; if (!cur) return;
    const phone = data.phone ?? cur.phone;
    if (phone) {
      const dup = Object.entries(db.roster).find(([oid, r]) => oid !== id && r.phone === phone);
      if (dup) throw Object.assign(new Error(`${dup[1].name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    }
    Object.assign(cur, { name: data.name.trim(), phone, updatedAt: Date.now() });
    this._save(db);
  }
  async patchRoster(id, patch) {
    const db = this._load(); const cur = db.roster[id]; if (!cur) return;
    const next = {};
    if ('name' in patch) next.name = String(patch.name || '').trim();
    if ('phone' in patch) next.phone = patch.phone || '';
    if ('level' in patch) next.level = patch.level;
    if ('positions' in patch) next.positions = patch.positions || [];
    if ('notes' in patch) next.notes = patch.notes || [];
    const phone = 'phone' in next ? next.phone : cur.phone;
    if (phone) {
      const dup = Object.entries(db.roster).find(([oid, r]) => oid !== id && r.phone === phone);
      if (dup) throw Object.assign(new Error(`${dup[1].name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    }
    Object.assign(cur, next, { updatedAt: Date.now() });
    this._save(db);
  }
  async deleteRoster(id) { const db = this._load(); delete db.roster[id]; this._save(db); }
  async setPrices(input) {
    const rec = priceRecord(input);
    if (!rec.ok) throw Object.assign(new Error(rec.error), { code: 'invalid-price' });
    const db = this._load();
    db.settings.prices = rec.patch;
    this._save(db);
  }
  async addOrganizer(name) {
    const clean = cleanOrganizerName(name);
    if (!clean.ok) throw Object.assign(new Error(clean.error), { code: 'invalid-organizer' });
    const db = this._load();
    if (Object.values(db.organizers).some((item) => sameOrganizer(item.name, clean.name))) {
      throw Object.assign(new Error(`${clean.name} ya está en la lista`), { code: 'organizer-duplicate' });
    }
    let id = organizerSlug(clean.name);
    let n = 2;
    while (db.organizers[id] && !sameOrganizer(db.organizers[id].name, clean.name)) id = `${organizerSlug(clean.name)}-${n++}`;
    db.organizers[id] = { name: clean.name, createdAt: Date.now() };
    this._save(db);
    return id;
  }
  async clearAll() {
    localStorage.removeItem(this.key);
    const db = this._load();
    this._seedOrganizers(db);
    localStorage.setItem(this.key, JSON.stringify(db));
    this._emit();
  }
}

/* ───────────── Firebase / Firestore ───────────── */
class FirebaseStore {
  constructor() {
    this.mode = 'firebase';
    this.listeners = new Set();
    this.actor = null;
    this._buckets = { matches: {}, players: {}, confirmations: {} };
    this._backfilled = new Set();
    this.state = { matches: [], players: [], roster: [], rosterError: null, organizers: [], organizersError: null, confirmations: [], prices: null, pricesError: null };
  }
  setActor(user) {
    const next = { uid: user?.uid || '', name: user?.name || '' };
    if (this.actor?.uid === next.uid && this.actor?.name === next.name) return;
    this.actor = next;
    if (this.fs) this._listen();
  }
  async init(onError) {
    const ready = await initFirebase();
    this.fs = ready.fs;
    this.db = ready.db;
    this.app = ready.app;
    this._onError = onError;
    this.serverOk = false;
    this._deniedRetries = 0;
    // El token tiene que estar listo antes del primer snapshot. Si no, la
    // suscripción a confirmations muere con permission-denied y la lista
    // nunca se entera del «Sí, juego».
    await this._refreshIdToken();
    this._listen();
    // Si Firestore no existe o la API está deshabilitada, el SDK reintenta en silencio:
    // avisamos si en 15 s no llegó ninguna respuesta del servidor.
    setTimeout(() => {
      if (!this.serverOk && navigator.onLine !== false) this._fail({ code: 'no-server', message: 'sin respuesta del servidor' });
    }, 15000);
  }
  async _refreshIdToken(force = false) {
    try {
      const { getAuth } = await import(`${FB}/firebase-auth.js`);
      const auth = getAuth(this.app);
      await auth.authStateReady();
      if (auth.currentUser) await auth.currentUser.getIdToken(force);
      return !!auth.currentUser;
    } catch (e) {
      console.error(e);
      return false;
    }
  }
  _fail(e) {
    console.error(e);
    if (this._onError) this._onError(e);
  }
  _stop() {
    for (const un of this._unsubs || []) {
      try { un(); } catch { /* ya cerrado */ }
    }
    this._unsubs = [];
  }
  _rebuild(kind) {
    const byId = new Map();
    for (const list of Object.values(this._buckets[kind] || {})) for (const item of list || []) byId.set(item.id, item);
    this.state[kind] = [...byId.values()];
    this._emit();
  }
  async _backfillMatches(docs) {
    const { doc, updateDoc } = this.fs;
    for (const item of docs) {
      const data = item.data();
      if (Array.isArray(data.viewers) && data.viewers.length) continue;
      const key = `m:${item.id}`;
      if (this._backfilled.has(key)) continue;
      this._backfilled.add(key);
      try { await updateDoc(doc(this.db, 'matches', item.id), { viewers: [EVERYONE], adders: [EVERYONE], solo: false }); }
      catch (e) { this._backfilled.delete(key); console.error(e); }
    }
  }
  async _backfillPlayers(docs) {
    const { doc, updateDoc } = this.fs;
    for (const item of docs) {
      const data = item.data();
      if (Array.isArray(data.viewers) && data.viewers.length) continue;
      const key = `p:${item.id}`;
      if (this._backfilled.has(key)) continue;
      this._backfilled.add(key);
      const match = this.state.matches.find((row) => row.id === data.matchId);
      if (!match) { this._backfilled.delete(key); continue; }
      try { await updateDoc(doc(this.db, 'players', item.id), playerAccess(match)); }
      catch (e) { this._backfilled.delete(key); console.error(e); }
    }
  }
  async _backfillConfirmations(docs) {
    const { doc, updateDoc } = this.fs;
    for (const item of docs) {
      const data = item.data();
      if (Array.isArray(data.viewers) && data.viewers.length) continue;
      const key = `c:${item.id}`;
      if (this._backfilled.has(key)) continue;
      this._backfilled.add(key);
      const match = this.state.matches.find((row) => row.id === data.matchId);
      if (!match) { this._backfilled.delete(key); continue; }
      try { await updateDoc(doc(this.db, 'confirmations', item.id), { viewers: playerAccess(match).viewers }); }
      catch (e) { this._backfilled.delete(key); console.error(e); }
    }
  }
  _listen() {
    this._stop();
    this._buckets = { matches: {}, players: {}, confirmations: {} };
    // Sin ventana de fechas: un partido viejo, sus jugadores y las confirmaciones
    // se quedan. Nadie los borra solo. La lista ancha (sin viewers) la rechazan
    // las reglas y queda vacía; la consulta por viewers trae todas las fechas.
    const { collection, doc, query, where, onSnapshot } = this.fs;
    const watch = (ref, opts, onNext, onErr) => {
      const next = (snap) => { this._deniedRetries = 0; onNext(snap); };
      const un = opts
        ? onSnapshot(ref, opts, next, (e) => this._onListenError(e, onErr))
        : onSnapshot(ref, next, (e) => this._onListenError(e, onErr));
      this._unsubs.push(un);
    };
    const accessIds = [EVERYONE];
    if (this.actor?.uid) accessIds.unshift(this.actor.uid);
    const take = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const legacyDenied = (kind) => (e) => {
      if (e?.code === 'permission-denied') {
        this._buckets[kind].broad = [];
        this._rebuild(kind);
        return;
      }
      this._fail(e);
    };
    watch(collection(this.db, 'matches'), { includeMetadataChanges: true }, (snap) => {
      if (!snap.metadata.fromCache) this.serverOk = true;
      this.state.pending = snap.metadata.hasPendingWrites;
      this._buckets.matches.broad = take(snap);
      this._rebuild('matches');
      this._backfillMatches(snap.docs);
    }, legacyDenied('matches'));
    watch(query(collection(this.db, 'matches'), where('viewers', 'array-contains-any', accessIds)), { includeMetadataChanges: true }, (snap) => {
      if (!snap.metadata.fromCache) this.serverOk = true;
      this._buckets.matches.narrow = take(snap);
      this._rebuild('matches');
    });
    watch(collection(this.db, 'players'), null, (snap) => {
      this._buckets.players.broad = take(snap);
      this._rebuild('players');
      this._backfillPlayers(snap.docs);
    }, legacyDenied('players'));
    watch(query(collection(this.db, 'players'), where('viewers', 'array-contains-any', accessIds)), null, (snap) => {
      this._buckets.players.narrow = take(snap);
      this._rebuild('players');
    });
    watch(collection(this.db, 'roster'), null, (snap) => {
      this.state.roster = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this.state.rosterError = null;
      this._emit();
    }, (e) => {
      this.state.rosterError = isRosterDenied(e) ? ROSTER_DENIED_READ : ('No se pudo leer Jugadores: ' + (e?.message || e?.code || e));
      this._emit();
    });
    watch(collection(this.db, 'confirmations'), null, (snap) => {
      this._buckets.confirmations.broad = take(snap);
      this._rebuild('confirmations');
      this._backfillConfirmations(snap.docs);
    }, legacyDenied('confirmations'));
    watch(query(collection(this.db, 'confirmations'), where('viewers', 'array-contains-any', accessIds)), null, (snap) => {
      this._buckets.confirmations.narrow = take(snap);
      this._rebuild('confirmations');
    });
    watch(collection(this.db, 'organizers'), null, (snap) => {
      this.state.organizers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this.state.organizersError = null;
      this._emit();
    }, (e) => {
      this.state.organizersError = isOrganizerDenied(e) ? ORGANIZERS_DENIED_READ : ('No se pudo leer organizadores: ' + (e?.message || e?.code || e));
      this._emit();
    });
    watch(doc(this.db, 'settings', 'prices'), null, (snap) => {
      this.state.prices = snap.exists() ? snap.data() : null;
      this.state.pricesError = null;
      this._emit();
    }, (e) => {
      this.state.prices = null;
      this.state.pricesError = e?.code === 'permission-denied' ? PRICES_DENIED_READ : ('No se pudieron leer los precios: ' + (e?.message || e?.code || e));
      this._emit();
    });
  }
  _onListenError(e, extra) {
    if (e?.code === 'permission-denied' && !this._retrying && (this._deniedRetries || 0) < 2) {
      this._deniedRetries += 1;
      this._retrying = true;
      this._stop();
      this._retryListen();
      return;
    }
    console.error(e);
    if (extra) extra(e);
    else this._fail(e);
  }
  async _retryListen() {
    try { await this._refreshIdToken(true); }
    finally {
      this._retrying = false;
      this._listen();
    }
  }
  async _seedOrganizers() {
    const { doc, getDoc, setDoc } = this.fs;
    const now = Date.now();
    for (const raw of ORGANIZERS) {
      const clean = cleanOrganizerName(raw);
      if (!clean.ok) continue;
      const ref = doc(this.db, 'organizers', organizerSlug(clean.name));
      const cur = await getDoc(ref);
      if (!cur.exists()) await setDoc(ref, { name: clean.name, createdAt: now });
    }
  }
  _view() {
    let { matches, players, confirmations } = this.state;
    const uid = this.actor?.uid;
    if (uid) {
      matches = matches.filter((match) => canView(match, uid));
      const ids = new Set(matches.map((match) => match.id));
      const known = new Set(this.state.matches.map((match) => match.id));
      players = players.filter((player) => ids.has(player.matchId) || (!known.has(player.matchId) && canView({ viewers: player.viewers }, uid)));
      confirmations = confirmations.filter((card) => ids.has(card.matchId) || (!known.has(card.matchId) && canView({ viewers: card.viewers }, uid)));
    }
    return {
      ...this.state,
      matches,
      confirmations,
      players: overlayConfirmations(players, confirmations),
    };
  }
  _emit() {
    const view = this._view();
    this.listeners.forEach((fn) => fn(view));
  }
  async _writeConfirmation(token, playerId, player, match) {
    if (!token) return;
    const { doc, setDoc } = this.fs;
    const body = confirmationIdentity({ playerId, player, match });
    await setDoc(doc(this.db, 'confirmations', token), body, { merge: true });
  }
  subscribe(fn) { this.listeners.add(fn); fn(this._view()); return () => this.listeners.delete(fn); }
  _ids() { return new Set(this.state.matches.map((m) => m.id)); }
  async addMatch(data, who) {
    const { doc, setDoc } = this.fs;
    const id = matchIdFor(data.date, data.time, this._ids());
    await setDoc(doc(this.db, 'matches', id), matchDoc(data, who)); return id;
  }
  async addMatches(list, who) {
    const { doc, writeBatch } = this.fs;
    const batch = writeBatch(this.db); const ids = this._ids(); const out = [];
    for (const data of list) {
      const id = matchIdFor(data.date, data.time, ids); ids.add(id); out.push(id);
      batch.set(doc(this.db, 'matches', id), matchDoc(data, who));
    }
    await batch.commit(); return out;
  }
  async updateMatch(id, data, who) {
    const { doc, writeBatch } = this.fs;
    const cur = this.state.matches.find((m) => m.id === id) || {};
    const access = data.access ? accessPatch(data.access) : null;
    const { access: _drop, ...rest } = data;
    const patch = { ...rest, ...(access || {}), startsAt: toEpoch(data.date ?? cur.date, data.time ?? cur.time), updatedBy: who, updatedAt: Date.now() };
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'matches', id), patch);
    const next = { ...cur, ...patch, id };
    const copied = playerAccess(next);
    const playerPatches = [];
    this.state.players.filter((p) => p.matchId === id).forEach((p) => {
      const playerPatch = {};
      if (data.date && data.date !== cur.date) playerPatch.matchDate = data.date;
      if (access) Object.assign(playerPatch, copied);
      if (Object.keys(playerPatch).length) playerPatches.push([p.id, playerPatch]);
    });
    // El partido primero: la regla del jugador compara con el partido ya guardado.
    await batch.commit();
    if (playerPatches.length) {
      const playersBatch = writeBatch(this.db);
      for (const [playerId, playerPatch] of playerPatches) playersBatch.update(doc(this.db, 'players', playerId), playerPatch);
      await playersBatch.commit();
    }
    for (const player of this.state.players.filter((p) => p.matchId === id && p.confirmToken)) {
      await this._writeConfirmation(player.confirmToken, player.id, { ...player, ...copied }, next);
    }
  }
  async deleteMatch(id) {
    const { doc, writeBatch } = this.fs;
    const batch = writeBatch(this.db);
    this.state.players.filter((p) => p.matchId === id).forEach((p) => {
      batch.delete(doc(this.db, 'players', p.id));
      if (p.confirmToken) batch.delete(doc(this.db, 'confirmations', p.confirmToken));
    });
    batch.delete(doc(this.db, 'matches', id));
    await batch.commit();
  }
  async addPlayer(match, data, who, opts = {}) {
    const { collection, addDoc } = this.fs; const now = Date.now();
    const mates = this.state.players.filter((p) => p.matchId === match.id);
    const cap = match.capacity || 14;
    const mainCount = mates.filter((p) => p.waiting !== true).length;
    const waiting = opts.waiting === true || mainCount >= cap;
    const token = newConfirmToken();
    const rosterId = String(data.rosterId || '').trim();
    const hold = opts.tentative === true && !waiting;
    const player = {
      matchId: match.id, matchDate: match.date, name: data.name.trim(), phone: data.phone || '',
      addedBy: who, addedByUid: this.actor?.uid || '', createdAt: now, updatedAt: now,
      waiting, waitOrder: waiting ? nextWaitOrder(mates.filter((p) => p.waiting === true)) : null,
      rosterAt: waiting ? null : now,
      confirmToken: token,
      ...playerAccess(match),
      ...(rosterId ? { rosterId } : {}),
      ...(hold ? { tentative: true, tentativeAt: now } : {}),
    };
    const ref = await addDoc(collection(this.db, 'players'), player);
    await this._writeConfirmation(token, ref.id, player, match);
    return ref.id;
  }
  async updatePlayer(id, data) {
    const { doc, updateDoc } = this.fs;
    await updateDoc(doc(this.db, 'players', id), { ...data, updatedAt: Date.now() });
    const cur = this.state.players.find((player) => player.id === id);
    const token = data.confirmToken || cur?.confirmToken;
    if (!token) return;
    const match = this.state.matches.find((item) => item.id === (cur?.matchId));
    await this._writeConfirmation(token, id, { ...cur, ...data }, match);
  }
  async setPayment(id, input, who) {
    const rec = paymentRecord(input, who);
    if (!rec.ok) throw Object.assign(new Error(rec.error), { code: 'invalid-payment' });
    await this.updatePlayer(id, rec.patch);
  }
  async markTransferReceived(id, who) {
    const player = this.state.players.find((item) => item.id === id);
    if (!player) throw new Error('Jugador inexistente');
    const rec = receivePendingTransfer(player, who);
    if (!rec.ok) throw Object.assign(new Error(rec.error), { code: 'invalid-payment' });
    await this.updatePlayer(id, rec.patch);
  }
  async setWaitOrders(updates) {
    const { doc, writeBatch } = this.fs;
    const batch = writeBatch(this.db); const now = Date.now();
    for (const u of updates || []) batch.update(doc(this.db, 'players', u.id), { waitOrder: u.waitOrder, updatedAt: now });
    await batch.commit();
  }
  async promoteFromWaiting(id) {
    await this.updatePlayer(id, { waiting: false, waitOrder: null, rosterAt: Date.now() });
  }
  async clearTentative(id) {
    await this.updatePlayer(id, { tentative: null, tentativeAt: null });
  }
  async ensureConfirmToken(id) {
    const p = this.state.players.find((x) => x.id === id);
    if (!p) throw new Error('Jugador inexistente');
    const token = p.confirmToken || newConfirmToken();
    if (!p.confirmToken) await this.updatePlayer(id, { confirmToken: token });
    const fresh = this.state.players.find((x) => x.id === id) || p;
    const match = this.state.matches.find((item) => item.id === fresh.matchId);
    // Aunque el token ya exista: crea la ficha si falta y no toca la respuesta.
    await this._writeConfirmation(token, id, { ...fresh, confirmToken: token }, match);
    return token;
  }
  async markReminderSent(id) {
    await this.updatePlayer(id, { reminderSentAt: Date.now() });
  }
  async deletePlayer(id) {
    const { doc, deleteDoc } = this.fs;
    const player = this.state.players.find((item) => item.id === id);
    await deleteDoc(doc(this.db, 'players', id));
    if (player?.confirmToken) await deleteDoc(doc(this.db, 'confirmations', player.confirmToken));
  }
  async addRoster(data, who) {
    const phone = data.phone || '';
    const existing = rosterByPhone(this.state.roster, phone);
    if (existing) throw Object.assign(new Error(`${existing.name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    const { collection, addDoc } = this.fs; const now = Date.now();
    const ref = await addDoc(collection(this.db, 'roster'), {
      name: data.name.trim(), phone, createdBy: who || '', createdAt: now, updatedAt: now,
    });
    return ref.id;
  }
  async updateRoster(id, data) {
    const phone = data.phone || '';
    const dup = phone && this.state.roster.find((r) => r.id !== id && r.phone === phone);
    if (dup) throw Object.assign(new Error(`${dup.name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    const { doc, updateDoc } = this.fs;
    await updateDoc(doc(this.db, 'roster', id), { name: data.name.trim(), phone, updatedAt: Date.now() });
  }
  async patchRoster(id, patch) {
    const cur = this.state.roster.find((r) => r.id === id);
    if (!cur) throw new Error('Jugador inexistente');
    const next = { updatedAt: Date.now() };
    if ('name' in patch) next.name = String(patch.name || '').trim();
    if ('phone' in patch) next.phone = patch.phone || '';
    if ('level' in patch) next.level = patch.level;
    if ('positions' in patch) next.positions = patch.positions || [];
    if ('notes' in patch) next.notes = patch.notes || [];
    const phone = 'phone' in next ? next.phone : cur.phone;
    if (phone) {
      const dup = this.state.roster.find((r) => r.id !== id && r.phone === phone);
      if (dup) throw Object.assign(new Error(`${dup.name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    }
    const { doc, updateDoc } = this.fs;
    await updateDoc(doc(this.db, 'roster', id), next);
  }
  async deleteRoster(id) { const { doc, deleteDoc } = this.fs; await deleteDoc(doc(this.db, 'roster', id)); }
  async setPrices(input) {
    const rec = priceRecord(input);
    if (!rec.ok) throw Object.assign(new Error(rec.error), { code: 'invalid-price' });
    const { doc, setDoc } = this.fs;
    await setDoc(doc(this.db, 'settings', 'prices'), rec.patch);
  }
  async addOrganizer(name) {
    const clean = cleanOrganizerName(name);
    if (!clean.ok) throw Object.assign(new Error(clean.error), { code: 'invalid-organizer' });
    if ((this.state.organizers || []).some((item) => sameOrganizer(item.name, clean.name))) {
      throw Object.assign(new Error(`${clean.name} ya está en la lista`), { code: 'organizer-duplicate' });
    }
    const id = organizerSlug(clean.name);
    const { doc, setDoc } = this.fs;
    await setDoc(doc(this.db, 'organizers', id), { name: clean.name, createdAt: Date.now() });
    return id;
  }
}

/** Store de localStorage, sin Firebase. Lo usa el modo demo y las pruebas. */
export function createDemoStore() {
  return new LocalStore();
}

export async function createStore(onError) {
  if (isFirebaseConfigured()) {
    const s = new FirebaseStore();
    try { await s.init(onError); return s; }
    catch (e) { console.error('No se pudo iniciar Firebase, usando modo demo', e); onError && onError(e); }
  }
  const s = new LocalStore(); await s.init(); return s;
}
