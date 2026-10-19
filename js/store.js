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
import { addDays, todayISO, toEpoch } from './dates.js';
import { paymentRecord } from './payments.js';
import { nextWaitOrder } from './waiting.js';
import { newConfirmToken } from './reminders.js';
import { ROSTER_DENIED_READ, isRosterDenied, rosterByPhone } from './roster.js';
import {
  ORGANIZERS_DENIED_READ, ORGANIZERS_DENIED_WRITE, cleanOrganizerName, isOrganizerDenied, organizerSlug, sameOrganizer,
} from './organizers.js';

export const DEMO_STORAGE_KEY = 'f7c-demo-db';

const FB_VERSION = '13.0.0';
const FB = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

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
  };
}

/* ───────────── Modo demo (localStorage) ───────────── */
class LocalStore {
  constructor() { this.key = DEMO_STORAGE_KEY; this.mode = 'demo'; this.listeners = new Set(); }
  _load() {
    try {
      const db = JSON.parse(localStorage.getItem(this.key)) || { matches: {}, players: {}, roster: {}, organizers: {} };
      db.matches ||= {}; db.players ||= {}; db.roster ||= {}; db.organizers ||= {};
      return db;
    } catch { return { matches: {}, players: {}, roster: {}, organizers: {} }; }
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
  _save(db) { localStorage.setItem(this.key, JSON.stringify(db)); this._emit(); }
  _emit() {
    const db = this._load();
    const matches = Object.entries(db.matches).map(([id, m]) => ({ id, ...m }));
    const players = Object.entries(db.players).map(([id, p]) => ({ id, ...p }));
    const roster = Object.entries(db.roster).map(([id, r]) => ({ id, ...r }));
    const organizers = Object.entries(db.organizers).map(([id, o]) => ({ id, ...o }));
    this.listeners.forEach((fn) => fn({ matches, players, roster, rosterError: null, organizers, organizersError: null }));
  }
  async init() {
    if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === this.key) this._emit(); });
    const db = this._load();
    if (this._seedOrganizers(db)) localStorage.setItem(this.key, JSON.stringify(db));
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
    Object.assign(m, data, { startsAt: toEpoch(data.date ?? m.date, data.time ?? m.time), updatedBy: who, updatedAt: Date.now() });
    if (data.date) for (const p of Object.values(db.players)) if (p.matchId === id) p.matchDate = data.date;
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
    db.players[id] = {
      matchId: match.id, matchDate: match.date, name: data.name.trim(), phone: data.phone || '',
      addedBy: who, createdAt: now, updatedAt: now,
      waiting, waitOrder: waiting ? nextWaitOrder(mates.filter((p) => p.waiting === true)) : null,
      rosterAt: waiting ? null : now,
      confirmToken: newConfirmToken(),
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
  constructor() { this.mode = 'firebase'; this.listeners = new Set(); this.state = { matches: [], players: [], roster: [], rosterError: null, organizers: [], organizersError: null }; this._organizerSeedTried = false; }
  async init(onError) {
    const [{ initializeApp }, fs] = await Promise.all([
      import(`${FB}/firebase-app.js`),
      import(`${FB}/firebase-firestore.js`),
    ]);
    this.fs = fs;
    const app = initializeApp(firebaseConfig);
    try {
      this.db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch {
      this.db = fs.getFirestore(app);
    }
    // Escuchar desde ayer en adelante (los listeners se actualizan en tiempo real)
    const from = addDays(todayISO(), -1);
    const { collection, query, where, onSnapshot } = fs;
    const err = (e) => { console.error(e); onError && onError(e); };
    this.serverOk = false;
    onSnapshot(query(collection(this.db, 'matches'), where('date', '>=', from)), { includeMetadataChanges: true }, (snap) => {
      if (!snap.metadata.fromCache) this.serverOk = true;
      this.state.matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this.state.pending = snap.metadata.hasPendingWrites;
      this._emit();
    }, err);
    // Si Firestore no existe o la API está deshabilitada, el SDK reintenta en silencio:
    // avisamos si en 15 s no llegó ninguna respuesta del servidor.
    setTimeout(() => {
      if (!this.serverOk && navigator.onLine !== false) err({ code: 'no-server', message: 'sin respuesta del servidor' });
    }, 15000);
    onSnapshot(query(collection(this.db, 'players'), where('matchDate', '>=', from)), (snap) => {
      this.state.players = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this._emit();
    }, err);
    onSnapshot(collection(this.db, 'roster'), (snap) => {
      this.state.roster = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this.state.rosterError = null;
      this._emit();
    }, (e) => {
      console.error(e);
      this.state.rosterError = isRosterDenied(e) ? ROSTER_DENIED_READ : ('No se pudo leer Jugadores: ' + (e?.message || e?.code || e));
      this._emit();
    });
    onSnapshot(collection(this.db, 'organizers'), (snap) => {
      this.state.organizers = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this.state.organizersError = null;
      this._emit();
      if (snap.empty && !snap.metadata.fromCache && !this._organizerSeedTried) {
        this._organizerSeedTried = true;
        this._seedOrganizers().catch((e) => {
          console.error(e);
          this.state.organizersError = isOrganizerDenied(e) ? ORGANIZERS_DENIED_WRITE : ('No se pudo guardar la lista de organizadores: ' + (e?.message || e?.code || e));
          this._emit();
        });
      }
    }, (e) => {
      console.error(e);
      this.state.organizersError = isOrganizerDenied(e) ? ORGANIZERS_DENIED_READ : ('No se pudo leer la lista de organizadores: ' + (e?.message || e?.code || e));
      this._emit();
    });
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
  _emit() { this.listeners.forEach((fn) => fn({ ...this.state })); }
  subscribe(fn) { this.listeners.add(fn); fn({ ...this.state }); return () => this.listeners.delete(fn); }
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
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'matches', id), { ...data, startsAt: toEpoch(data.date ?? cur.date, data.time ?? cur.time), updatedBy: who, updatedAt: Date.now() });
    if (data.date && data.date !== cur.date) {
      this.state.players.filter((p) => p.matchId === id).forEach((p) => batch.update(doc(this.db, 'players', p.id), { matchDate: data.date }));
    }
    await batch.commit();
  }
  async deleteMatch(id) {
    const { doc, writeBatch, collection, query, where, getDocs } = this.fs;
    const batch = writeBatch(this.db);
    const ps = await getDocs(query(collection(this.db, 'players'), where('matchId', '==', id)));
    ps.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(this.db, 'matches', id));
    await batch.commit();
  }
  async addPlayer(match, data, who, opts = {}) {
    const { collection, addDoc } = this.fs; const now = Date.now();
    const mates = this.state.players.filter((p) => p.matchId === match.id);
    const cap = match.capacity || 14;
    const mainCount = mates.filter((p) => p.waiting !== true).length;
    const waiting = opts.waiting === true || mainCount >= cap;
    const ref = await addDoc(collection(this.db, 'players'), {
      matchId: match.id, matchDate: match.date, name: data.name.trim(), phone: data.phone || '',
      addedBy: who, createdAt: now, updatedAt: now,
      waiting, waitOrder: waiting ? nextWaitOrder(mates.filter((p) => p.waiting === true)) : null,
      rosterAt: waiting ? null : now,
      confirmToken: newConfirmToken(),
    });
    return ref.id;
  }
  async updatePlayer(id, data) { const { doc, updateDoc } = this.fs; await updateDoc(doc(this.db, 'players', id), { ...data, updatedAt: Date.now() }); }
  async setPayment(id, input, who) {
    const rec = paymentRecord(input, who);
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
  async ensureConfirmToken(id) {
    const p = this.state.players.find((x) => x.id === id);
    if (!p) throw new Error('Jugador inexistente');
    if (p.confirmToken) return p.confirmToken;
    const token = newConfirmToken();
    await this.updatePlayer(id, { confirmToken: token });
    return token;
  }
  async markReminderSent(id) {
    await this.updatePlayer(id, { reminderSentAt: Date.now() });
  }
  async deletePlayer(id) { const { doc, deleteDoc } = this.fs; await deleteDoc(doc(this.db, 'players', id)); }
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
