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
//    name
//    phoneKey (SHA-256 del teléfono canónico; no es el número)
//    hasPhone, phoneOwnerUid, phoneShared
//    El número está en playerContacts/{playerId}, no acá.
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
//    confirmToken: string               (link largo de confirmar.html; se crea al anotar)
//    shortCode: string                  (8 caracteres; el mensaje usa /c/?k=shortCode)
//  links/{code}
//    m: matchId, p: playerId, t: confirmToken
//    El código es el id. Se lee sin cuenta, igual que confirmations. No se lista.
//    confirmed: "si"|"no"               (respuesta del jugador)
//    confirmedAt, reminderSentAt: number
//    tentative: bool|null               (lugar reservado, a confirmar; ocupa cupo)
//    tentativeAt: number|null
//  matches.teams (opcional)
//    { bib: [playerId], plain: [playerId] }
//    bib = con pechera, plain = sin pechera. Solo titulares.
//    Se guarda en el mismo partido: quien puede anotar lo edita y el resto lo ve.
//  matches.cancelled (opcional, bool), cancelledAt, cancelledBy
//  matches.notes (texto libre, hasta 2000). Distinto de note (la nota corta de la tarjeta).
//  matches.playerCount (int). Lo actualiza el cliente al anotar o quitar.
//    La regla de borrado lo exige en 0. Si falta, se toma 0.
//  playerContacts/{playerId}
//    phone, ownerUid, visibleToAll (default false), phoneKey, viewers
//    Lo lee el dueño, o cualquiera que pueda ver el partido si visibleToAll.
//    El admin no es excepción.
//  rosterContacts/{rosterId}
//    phone, ownerUid, visibleToAll (default false), phoneKey
//  roster/{rosterId}
//    name (el teléfono está en rosterContacts)
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
import { toEpoch, todayISO } from './dates.js';
import { historyBounds, historyCaption, historyWindow, matchQueryPlan } from './profile.js';
import { paymentRecord, receivePendingTransfer } from './payments.js';
import { PRICES_DENIED_READ, priceRecord } from './prices.js';
import { nextWaitOrder } from './waiting.js';
import { dropPlayer, teamsRecord } from './teams.js';
import { confirmationIdentity, confirmationRecord, newConfirmToken, overlayConfirmations } from './reminders.js';
import { isShortCode, newShortCode } from './short.js';
import { EVERYONE, accessPatch, canAdd, canView, playerAccess } from './access.js';
import { ROSTER_DENIED_READ, isRosterDenied, phoneIdentity } from './roster.js';
import { PRIVATE_WA_TEXT, attachPhone, canonicalWa, phoneKey } from './privacy.js';
import {
  ORGANIZERS_DENIED_READ, ORGANIZERS_DENIED_WRITE, cleanOrganizerName, isOrganizerDenied, organizerSlug, sameOrganizer,
} from './organizers.js';
import { canEditPlayer, canEditRoster, editLockedError, playerPatchEditsIdentity } from './edit-lock.js';

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
    playerCount: 0,
    ...(access || {}),
  };
}

function cleanMatchPatch(data) {
  const access = data?.access ? accessPatch(data.access) : null;
  const { access: _access, playerCount: _count, ...rest } = data || {};
  if ('notes' in rest) rest.notes = String(rest.notes ?? '').slice(0, 2000);
  if ('cancelled' in rest) rest.cancelled = rest.cancelled === true;
  if (rest.cancelled === false) {
    rest.cancelledAt = null;
    rest.cancelledBy = null;
  }
  return { rest, access };
}

function ensureContacts(db) {
  db.contacts ||= { players: {}, roster: {} };
  db.contacts.players ||= {};
  db.contacts.roster ||= {};
  return db.contacts;
}

function phoneDup(db, kind, id, phone) {
  const key = phoneKey(canonicalWa(phone));
  if (!key) return null;
  const contacts = ensureContacts(db)[kind];
  for (const [oid, row] of Object.entries(db[kind] || {})) {
    if (oid === id) continue;
    const raw = row.phone || contacts[oid]?.phone || '';
    const rowKey = row.phoneKey || contacts[oid]?.phoneKey || phoneKey(canonicalWa(raw));
    if (rowKey && rowKey === key) return row;
  }
  return null;
}

function writeContact(db, kind, id, phone, entity, ownerUid, visibleToAll) {
  const contacts = ensureContacts(db);
  const canon = canonicalWa(phone);
  if (!canon) {
    delete contacts[kind][id];
    entity.hasPhone = false;
    entity.phoneKey = '';
    entity.phoneShared = false;
    entity.phoneOwnerUid = '';
    delete entity.phone;
    return;
  }
  const key = phoneKey(canon);
  const prev = contacts[kind][id];
  const owner = prev?.ownerUid || entity.phoneOwnerUid || ownerUid || '';
  const visible = typeof visibleToAll === 'boolean' ? visibleToAll : (prev ? prev.visibleToAll === true : false);
  const contact = { phone: canon, ownerUid: owner, visibleToAll: visible, phoneKey: key };
  if (kind === 'players') contact.viewers = Array.isArray(entity.viewers) && entity.viewers.length ? [...entity.viewers] : ['*'];
  contacts[kind][id] = contact;
  entity.phoneKey = key;
  entity.hasPhone = true;
  entity.phoneOwnerUid = owner;
  entity.phoneShared = visible;
  delete entity.phone;
}

function migratePhones(db) {
  const contacts = ensureContacts(db);
  let changed = false;
  for (const [id, player] of Object.entries(db.players || {})) {
    const raw = String(player?.phone || '').trim();
    if (!raw) {
      if (player && 'phone' in player) { delete player.phone; changed = true; }
      continue;
    }
    writeContact(db, 'players', id, raw, player, player.addedByUid || player.phoneOwnerUid || '');
    changed = true;
  }
  for (const [id, person] of Object.entries(db.roster || {})) {
    const raw = String(person?.phone || '').trim();
    if (!raw) {
      if (person && 'phone' in person) { delete person.phone; changed = true; }
      continue;
    }
    writeContact(db, 'roster', id, raw, person, person.createdByUid || person.phoneOwnerUid || '');
    changed = true;
  }
  return changed;
}

function presentRows(rows, contacts, uid) {
  return rows.map(([id, entity]) => attachPhone({ id, ...entity }, contacts?.[id], uid));
}

/** Suma o resta el contador. Si todavía no es un entero, escribe el total. */
function countPatch(fs, match, delta, localCount) {
  const current = match?.playerCount;
  const fallback = Math.max(0, (Number(localCount) || 0) + delta);
  if (typeof current === 'number' && Number.isInteger(current) && current + delta >= 0 && typeof fs?.increment === 'function') {
    return { playerCount: fs.increment(delta) };
  }
  return { playerCount: fallback };
}

/* ───────────── Modo demo (localStorage) ───────────── */
class LocalStore {
  constructor() { this.key = DEMO_STORAGE_KEY; this.mode = 'demo'; this.listeners = new Set(); this.actor = null; this._historyFilter = null; }
  setActor(user) {
    this.actor = { uid: user?.uid || '', name: user?.name || '' };
    if (this.listeners.size) this._emit();
  }
  setHistoryFilter(filter) {
    this._historyFilter = filter && (filter.day || filter.from || filter.to) ? filter : null;
    this._emit();
  }
  syncDay() { this._emit(); }
  async ensureMatch() {}
  _load() {
    try {
      const db = JSON.parse(localStorage.getItem(this.key)) || { matches: {}, players: {}, roster: {}, organizers: {}, confirmations: {}, settings: {}, contacts: { players: {}, roster: {} } };
      db.matches ||= {}; db.players ||= {}; db.roster ||= {}; db.organizers ||= {}; db.confirmations ||= {}; db.settings ||= {};
      ensureContacts(db);
      migratePhones(db);
      return db;
    } catch { return { matches: {}, players: {}, roster: {}, organizers: {}, confirmations: {}, settings: {}, contacts: { players: {}, roster: {} } }; }
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
  _touchLinks(db) {
    db.links ||= {};
    const live = new Set();
    for (const [pid, player] of Object.entries(db.players)) {
      if (!player?.confirmToken) continue;
      let code = player.shortCode;
      const current = code && db.links[code];
      if (!isShortCode(code) || (current && current.t && current.t !== player.confirmToken)) {
        code = newShortCode();
        while (db.links[code]) code = newShortCode();
        player.shortCode = code;
      }
      db.links[code] = { m: player.matchId, p: pid, t: player.confirmToken };
      live.add(code);
    }
    for (const code of Object.keys(db.links)) if (!live.has(code)) delete db.links[code];
  }
  async ensureShortLink(id) {
    const db = this._load();
    const player = db.players[id];
    if (!player?.confirmToken) return '';
    if (isShortCode(player.shortCode) && db.links?.[player.shortCode]?.t === player.confirmToken) return player.shortCode;
    this._save(db);
    return this._load().players[id]?.shortCode || '';
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
  _syncPlayerCounts(db) {
    const counts = {};
    for (const player of Object.values(db.players)) {
      if (!player?.matchId || !db.matches[player.matchId]) continue;
      counts[player.matchId] = (counts[player.matchId] || 0) + 1;
    }
    for (const [id, match] of Object.entries(db.matches)) match.playerCount = counts[id] || 0;
  }
  _save(db) {
    ensureContacts(db);
    migratePhones(db);
    this._syncPlayerCounts(db);
    this._touchConfirmations(db);
    this._touchLinks(db);
    localStorage.setItem(this.key, JSON.stringify(db));
    this._emit();
  }
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
    const uid = this.actor?.uid || '';
    const matches = visible.matches;
    const cards = visible.cards;
    const players = overlayConfirmations(presentRows(visible.players.map((p) => [p.id, p]), db.contacts.players, uid).map(({ id, ...rest }) => ({ id, ...rest })), cards);
    const roster = presentRows(Object.entries(db.roster), db.contacts.roster, uid);
    const organizers = Object.entries(db.organizers).map(([id, o]) => ({ id, ...o }));
    const prices = db.settings?.prices || null;
    const windowed = historyWindow(matches, this._historyFilter);
    const history = windowed.matches;
    const { matches: _rows, ...historyMeta } = windowed;
    this.listeners.forEach((fn) => fn({
      matches, history, historyMeta, historyError: '',
      players, roster, rosterError: null, organizers, organizersError: null, prices, pricesError: null,
    }));
  }
  async init() {
    if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === this.key) this._emit(); });
    const db = this._load();
    this._seedOrganizers(db);
    this._touchConfirmations(db);
    this._touchLinks(db);
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
    const { rest, access } = cleanMatchPatch(data);
    Object.assign(m, rest, access || {}, { startsAt: toEpoch(data.date ?? m.date, data.time ?? m.time), updatedBy: who, updatedAt: Date.now() });
    const copied = playerAccess(m);
    ensureContacts(db);
    for (const [pid, p] of Object.entries(db.players)) if (p.matchId === id) {
      if (data.date) p.matchDate = data.date;
      if (access) {
        Object.assign(p, copied);
        if (db.contacts.players[pid]) db.contacts.players[pid].viewers = copied.viewers;
      }
    }
    this._save(db);
  }
  async deleteMatch(id) {
    const db = this._load();
    const n = Object.values(db.players).filter((p) => p.matchId === id).length;
    if (n > 0) throw Object.assign(new Error('Este partido tiene jugadores. Cancelalo en lugar de borrarlo.'), { code: 'has-players' });
    delete db.matches[id];
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
    const player = {
      matchId: match.id, matchDate: match.date, name: data.name.trim(),
      addedBy: who, addedByUid: this.actor?.uid || '', createdAt: now, updatedAt: now,
      waiting, waitOrder: waiting ? nextWaitOrder(mates.filter((p) => p.waiting === true)) : null,
      rosterAt: waiting ? null : now,
      confirmToken: newConfirmToken(),
      hasPhone: false, phoneKey: '', phoneOwnerUid: this.actor?.uid || '', phoneShared: false,
      ...playerAccess(match),
      ...(rosterId ? { rosterId } : {}),
      ...(hold ? { tentative: true, tentativeAt: now } : {}),
    };
    db.players[id] = player;
    if (data.phone) writeContact(db, 'players', id, data.phone, player, this.actor?.uid || '', data.phoneShared === true);
    else if (data.hasPhone && /^[0-9a-f]{64}$/.test(String(data.phoneKey || ''))) {
      player.phoneKey = data.phoneKey;
      player.hasPhone = true;
      player.phoneOwnerUid = '';
      player.phoneShared = false;
    }
    this._save(db); return id;
  }
  _dropFromTeams(db, matchId, playerId) {
    const match = db.matches[matchId];
    if (!match?.teams || !playerId) return;
    const next = dropPlayer(match.teams, playerId);
    if (next.changed) match.teams = next.teams;
  }
  async setTeams(id, teams, who) {
    const rec = teamsRecord(teams);
    if (!rec.ok) throw Object.assign(new Error(rec.error), { code: 'invalid-teams' });
    const db = this._load();
    const match = db.matches[id];
    if (!match) return;
    match.teams = rec.teams;
    match.updatedBy = who || match.updatedBy;
    match.updatedAt = Date.now();
    this._save(db);
  }
  async updatePlayer(id, data) {
    const db = this._load(); if (!db.players[id]) return;
    const player = db.players[id];
    if (playerPatchEditsIdentity(data, player) && !canEditPlayer(player, this.actor)) throw editLockedError();
    const { phone, ...rest } = data || {};
    Object.assign(player, rest, { updatedAt: Date.now() });
    delete player.phone;
    if ('phone' in (data || {})) writeContact(db, 'players', id, phone, player, player.addedByUid || this.actor?.uid || '');
    if (data?.waiting === true) this._dropFromTeams(db, player.matchId, id);
    this._save(db);
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
  async deletePlayer(id) {
    const db = this._load();
    if (db.players[id]) this._dropFromTeams(db, db.players[id].matchId, id);
    delete db.players[id];
    ensureContacts(db);
    delete db.contacts.players[id];
    this._save(db);
  }
  _rosterPhone(db, id) {
    return db.contacts?.roster?.[id]?.phone || db.roster?.[id]?.phone || '';
  }
  async addRoster(data, who) {
    const db = this._load();
    const phone = data.phone || '';
    const existing = phoneDup(db, 'roster', '', phone);
    if (existing) throw Object.assign(new Error(`${existing.name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    const id = rid(); const now = Date.now();
    const person = { name: data.name.trim(), createdBy: who || '', createdByUid: this.actor?.uid || '', createdAt: now, updatedAt: now, hasPhone: false, phoneKey: '', phoneOwnerUid: this.actor?.uid || '', phoneShared: false };
    db.roster[id] = person;
    if (phone) writeContact(db, 'roster', id, phone, person, this.actor?.uid || '', data.phoneShared === true);
    this._save(db); return id;
  }
  async updateRoster(id, data) {
    const db = this._load(); const cur = db.roster[id]; if (!cur) return;
    if (!canEditRoster(cur, this.actor)) throw editLockedError();
    const phone = 'phone' in (data || {}) ? (data.phone || '') : this._rosterPhone(db, id);
    if (phone) {
      const dup = phoneDup(db, 'roster', id, phone);
      if (dup) throw Object.assign(new Error(`${dup.name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    }
    Object.assign(cur, { name: data.name.trim(), updatedAt: Date.now() });
    delete cur.phone;
    if ('phone' in (data || {})) writeContact(db, 'roster', id, phone, cur, cur.createdByUid || this.actor?.uid || '');
    this._save(db);
  }
  async patchRoster(id, patch) {
    const db = this._load(); const cur = db.roster[id]; if (!cur) return;
    if (!canEditRoster(cur, this.actor)) throw editLockedError();
    const next = {};
    if ('name' in patch) next.name = String(patch.name || '').trim();
    if ('level' in patch) next.level = patch.level;
    if ('positions' in patch) next.positions = patch.positions || [];
    if ('notes' in patch) next.notes = patch.notes || [];
    const phone = 'phone' in patch ? (patch.phone || '') : this._rosterPhone(db, id);
    if ('phone' in patch && phone) {
      const dup = phoneDup(db, 'roster', id, phone);
      if (dup) throw Object.assign(new Error(`${dup.name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    }
    Object.assign(cur, next, { updatedAt: Date.now() });
    delete cur.phone;
    if ('phone' in patch) writeContact(db, 'roster', id, phone, cur, cur.createdByUid || this.actor?.uid || '');
    this._save(db);
  }
  async deleteRoster(id) {
    const db = this._load();
    delete db.roster[id];
    ensureContacts(db);
    delete db.contacts.roster[id];
    this._save(db);
  }
  async setPhoneShared(target, visible) {
    const db = this._load();
    const uid = this.actor?.uid || '';
    if (!uid) throw Object.assign(new Error('No hay sesión'), { code: 'permission-denied' });
    ensureContacts(db);
    const want = visible === true;
    const rosterId = target?.rosterId || '';
    const playerId = target?.playerId || '';
    const contact = rosterId ? db.contacts.roster[rosterId] : db.contacts.players[playerId];
    if (!contact || contact.ownerUid !== uid) throw Object.assign(new Error('El WhatsApp de este jugador es privado'), { code: 'permission-denied' });
    const key = contact.phoneKey;
    for (const [id, item] of Object.entries(db.contacts.roster)) {
      if (item.ownerUid === uid && item.phoneKey === key) {
        item.visibleToAll = want;
        if (db.roster[id]) db.roster[id].phoneShared = want;
      }
    }
    for (const [id, item] of Object.entries(db.contacts.players)) {
      if (item.ownerUid === uid && item.phoneKey === key) {
        item.visibleToAll = want;
        if (db.players[id]) db.players[id].phoneShared = want;
      }
    }
    this._save(db);
  }
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
    this._contactBuckets = { playerOwner: [], playerShared: [], rosterOwner: [], rosterShared: [] };
    this._backfilled = new Set();
    this._countTried = new Set();
    this._migrated = new Set();
    this._migrating = false;
    this._contactsLive = false;
    this._linksLive = false;
    this._shortCodes = new Map();
    this._historyFilter = null;
    this._queryDay = '';
    this._named = {};
    this.state = { matches: [], players: [], roster: [], rosterError: null, organizers: [], organizersError: null, confirmations: [], prices: null, pricesError: null, playerContacts: {}, rosterContacts: {}, historyError: '' };
  }
  setHistoryFilter(filter) {
    this._historyFilter = filter && (filter.day || filter.from || filter.to) ? filter : null;
    if (this.fs) this._listenHistory();
    else this._emit();
  }
  syncDay(now = Date.now()) {
    const today = todayISO(new Date(now));
    if (today === this._queryDay) return;
    this._queryDay = today;
    if (this.fs) {
      this._listenUpcoming();
      this._listenHistory();
    }
  }
  async ensureMatch(id) {
    if (!id || !this.fs) return;
    if (this.state.matches.some((match) => match.id === id)) return;
    const { doc, getDoc } = this.fs;
    try {
      const snap = await getDoc(doc(this.db, 'matches', id));
      if (!snap.exists()) return;
      const match = { id: snap.id, ...snap.data() };
      if (this.actor?.uid && !canView(match, this.actor.uid)) return;
      const opened = (this._buckets.matches.opened || []).filter((row) => row.id !== match.id);
      opened.push(match);
      this._buckets.matches.opened = opened;
      this._rebuild('matches');
    } catch (e) {
      if (e?.code !== 'permission-denied') console.error(e);
    }
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
    this._named = {};
  }
  _swap(name, un) {
    const prev = this._named?.[name];
    if (prev) {
      try { prev(); } catch { /* ya cerrado */ }
      this._unsubs = (this._unsubs || []).filter((fn) => fn !== prev);
    }
    this._named = this._named || {};
    this._named[name] = un || null;
    if (un) this._unsubs.push(un);
  }
  _accessIds() {
    const ids = [EVERYONE];
    if (this.actor?.uid) ids.unshift(this.actor.uid);
    return ids;
  }
  _applyMatchPlan(plan) {
    const { collection, query, where, orderBy, limit } = this.fs;
    if (!plan || plan.empty) return null;
    const accessIds = this._accessIds();
    const parts = [];
    for (const filter of plan.filters) {
      if (filter.op === 'array-contains-any') parts.push(where(filter.field, filter.op, accessIds));
      else parts.push(where(filter.field, filter.op, filter.value));
    }
    if (plan.orderBy?.length) parts.push(orderBy(plan.orderBy[0], plan.orderBy[1]));
    if (plan.limit) parts.push(limit(plan.limit));
    return query(collection(this.db, 'matches'), ...parts);
  }
  _takeMatchSnap(snap) {
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
  _listenUpcoming() {
    const today = this._queryDay || todayISO();
    const q = this._applyMatchPlan(matchQueryPlan('upcoming', null, today));
    const { onSnapshot } = this.fs;
    const un = onSnapshot(q, { includeMetadataChanges: true }, (snap) => {
      if (!snap.metadata.fromCache) this.serverOk = true;
      this.state.pending = snap.metadata.hasPendingWrites;
      this._buckets.matches.upcoming = this._takeMatchSnap(snap);
      this._rebuild('matches');
      this._backfillMatches(snap.docs);
    }, (e) => this._onListenError(e));
    this._swap('upcoming', un);
  }
  _listenHistory() {
    const bounds = historyBounds(this._historyFilter);
    this._historyBounds = bounds;
    if (bounds.empty) {
      this._buckets.matches.history = [];
      this.state.historyError = '';
      this._swap('history', null);
      this._rebuild('matches');
      return;
    }
    const q = this._applyMatchPlan(matchQueryPlan('history', bounds, bounds.before));
    const { onSnapshot } = this.fs;
    const un = onSnapshot(q, (snap) => {
      this.state.historyError = '';
      this._buckets.matches.history = this._takeMatchSnap(snap);
      this._rebuild('matches');
      this._backfillMatches(snap.docs);
    }, (e) => {
      if (e?.code === 'failed-precondition') {
        this.state.historyError = e.message || 'Falta un índice de Firestore para el historial.';
        this._buckets.matches.history = [];
        this._rebuild('matches');
        return;
      }
      this._onListenError(e);
    });
    this._swap('history', un);
  }
  _rebuild(kind) {
    const byId = new Map();
    for (const list of Object.values(this._buckets[kind] || {})) for (const item of list || []) byId.set(item.id, item);
    this.state[kind] = [...byId.values()];
    this._emit();
    if (kind === 'matches' || kind === 'players') this._reconcilePlayerCounts();
    if (kind === 'players') this._migrateContacts();
  }
  _reconcilePlayerCounts() {
    if (!this.fs || !this.actor?.uid || this._counting) return;
    const byMatch = new Map();
    for (const player of this.state.players) {
      if (!player.matchId) continue;
      byMatch.set(player.matchId, (byMatch.get(player.matchId) || 0) + 1);
    }
    const fixes = [];
    for (const match of this.state.matches) {
      if (!canAdd(match, this.actor.uid)) continue;
      const n = byMatch.get(match.id) || 0;
      if (match.playerCount === n) continue;
      const key = `${match.id}:${n}`;
      if (this._countTried.has(key)) continue;
      fixes.push([match.id, n, key]);
      if (fixes.length >= 400) break;
    }
    if (!fixes.length) return;
    for (const item of fixes) this._countTried.add(item[2]);
    this._counting = true;
    const { doc, writeBatch } = this.fs;
    const batch = writeBatch(this.db);
    const now = Date.now();
    for (const [id, n] of fixes) batch.update(doc(this.db, 'matches', id), { playerCount: n, updatedAt: now });
    batch.commit().catch((e) => console.error(e)).finally(() => { this._counting = false; });
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
    this._contactBuckets = { playerOwner: [], playerShared: [], rosterOwner: [], rosterShared: [] };
    // Próximos: date >= hoy, todos. Historial: date < hoy con límite 30, o el
    // rango del filtro. Las dos consultas filtran viewers. Un partido viejo no
    // se borra: si no está en la página, se lee por id al abrirlo.
    this._queryDay = todayISO();
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
    this._listenUpcoming();
    this._listenHistory();
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
      this._migrateContacts();
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
    const takeMap = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const mergeContacts = () => {
      const players = {};
      for (const item of this._contactBuckets.playerOwner) players[item.id] = item;
      for (const item of this._contactBuckets.playerShared) if (!players[item.id]) players[item.id] = item;
      const roster = {};
      for (const item of this._contactBuckets.rosterOwner) roster[item.id] = item;
      for (const item of this._contactBuckets.rosterShared) if (!roster[item.id]) roster[item.id] = item;
      this.state.playerContacts = players;
      this.state.rosterContacts = roster;
      this._contactsLive = true;
      this._emit();
    };
    const contactErr = (e) => {
      if (e?.code === 'permission-denied') { this._contactsLive = false; return; }
      console.error(e);
    };
    const uid = this.actor?.uid;
    if (uid) {
      const ownerPlayers = onSnapshot(query(collection(this.db, 'playerContacts'), where('ownerUid', '==', uid)), (snap) => {
        this._contactBuckets.playerOwner = takeMap(snap);
        mergeContacts();
      }, contactErr);
      const ownerRoster = onSnapshot(query(collection(this.db, 'rosterContacts'), where('ownerUid', '==', uid)), (snap) => {
        this._contactBuckets.rosterOwner = takeMap(snap);
        mergeContacts();
      }, contactErr);
      this._unsubs.push(ownerPlayers, ownerRoster);
    }
    const sharedPlayers = onSnapshot(
      query(collection(this.db, 'playerContacts'), where('visibleToAll', '==', true), where('viewers', 'array-contains-any', accessIds)),
      (snap) => { this._contactBuckets.playerShared = takeMap(snap); mergeContacts(); },
      contactErr,
    );
    const sharedRoster = onSnapshot(
      query(collection(this.db, 'rosterContacts'), where('visibleToAll', '==', true)),
      (snap) => { this._contactBuckets.rosterShared = takeMap(snap); mergeContacts(); },
      contactErr,
    );
    this._unsubs.push(sharedPlayers, sharedRoster);
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
    const uidView = uid || '';
    const shown = players.map((player) => attachPhone(player, this.state.playerContacts?.[player.id], uidView));
    const roster = (this.state.roster || []).map((person) => attachPhone(person, this.state.rosterContacts?.[person.id], uidView));
    const { playerContacts: _playerContacts, rosterContacts: _rosterContacts, ...rest } = this.state;
    const bounds = this._historyBounds || historyBounds(this._historyFilter);
    const history = (this._buckets.matches?.history || [])
      .filter((match) => !uid || canView(match, uid))
      .sort((a, b) => (b.startsAt ?? toEpoch(b.date, b.time)) - (a.startsAt ?? toEpoch(a.date, a.time)) || String(b.id).localeCompare(String(a.id)));
    return {
      ...rest,
      matches,
      history,
      historyMeta: { ...bounds, caption: historyCaption(bounds, history.length) },
      confirmations,
      roster,
      players: overlayConfirmations(shown, confirmations),
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
    const { rest, access } = cleanMatchPatch(data);
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
    if (access && this._contactsLive) {
      const { doc: docRef, updateDoc } = this.fs;
      for (const player of this.state.players.filter((p) => p.matchId === id)) {
        try { await updateDoc(docRef(this.db, 'playerContacts', player.id), { viewers: copied.viewers }); }
        catch (e) { if (e?.code !== 'not-found' && e?.code !== 'permission-denied') console.error(e); }
      }
    }
  }
  async deleteMatch(id) {
    const local = this.state.players.filter((p) => p.matchId === id).length;
    const stored = this.state.matches.find((m) => m.id === id);
    const count = stored?.playerCount;
    if (local > 0 || (typeof count === 'number' && count > 0)) {
      throw Object.assign(new Error('Este partido tiene jugadores. Cancelalo en lugar de borrarlo.'), { code: 'has-players' });
    }
    const { doc, deleteDoc } = this.fs;
    await deleteDoc(doc(this.db, 'matches', id));
  }
  _viewersOf(entity) {
    return Array.isArray(entity?.viewers) && entity.viewers.length ? entity.viewers : ['*'];
  }
  _ownerUidFor(entity, kind) {
    const uid = this.actor?.uid || '';
    if (kind === 'players') {
      if (entity?.addedByUid) return entity.addedByUid;
      if (entity?.phoneOwnerUid) return entity.phoneOwnerUid;
      if (sameOrganizer(entity?.addedBy, this.actor?.name)) return uid;
      return '';
    }
    if (entity?.createdByUid) return entity.createdByUid;
    if (entity?.phoneOwnerUid) return entity.phoneOwnerUid;
    if (sameOrganizer(entity?.createdBy, this.actor?.name)) return uid;
    return '';
  }
  async _writeContactDoc(kind, id, phone, entity, opts = {}) {
    const { doc, setDoc, deleteDoc } = this.fs;
    const col = kind === 'players' ? 'playerContacts' : 'rosterContacts';
    const ref = doc(this.db, col, id);
    const canon = canonicalWa(phone);
    if (!canon) {
      await deleteDoc(ref);
      return { cleared: true };
    }
    const uid = this.actor?.uid || '';
    const existing = (kind === 'players' ? this.state.playerContacts : this.state.rosterContacts)?.[id];
    const ownerUid = opts.ownerUid || existing?.ownerUid || entity?.phoneOwnerUid || (kind === 'players' ? entity?.addedByUid : entity?.createdByUid) || uid;
    if (!opts.migrating && ownerUid !== uid) return { cleared: false, denied: true };
    if (!ownerUid) return { cleared: false };
    const body = {
      phone: canon,
      ownerUid,
      visibleToAll: opts.migrating ? false : (typeof opts.visibleToAll === 'boolean' ? opts.visibleToAll : existing?.visibleToAll === true),
      phoneKey: phoneKey(canon),
    };
    if (kind === 'players') body.viewers = this._viewersOf(entity);
    await setDoc(ref, body);
    return { cleared: true, phoneKey: body.phoneKey, ownerUid, visibleToAll: body.visibleToAll };
  }
  async _migrateContacts() {
    if (!this.fs || !this.actor?.uid || this._migrating) return;
    const jobs = [];
    for (const player of this.state.players || []) {
      if (!String(player.phone || '').trim() || this._migrated.has(`p:${player.id}`)) continue;
      const owner = this._ownerUidFor(player, 'players');
      if (!owner) continue;
      const match = this.state.matches.find((item) => item.id === player.matchId);
      const can = player.addedByUid === this.actor.uid || sameOrganizer(player.addedBy, this.actor.name) || (match && canAdd(match, this.actor.uid));
      if (!can) continue;
      jobs.push(['players', player, owner]);
    }
    for (const person of this.state.roster || []) {
      if (!String(person.phone || '').trim() || this._migrated.has(`r:${person.id}`)) continue;
      const owner = this._ownerUidFor(person, 'roster');
      if (!owner) continue;
      jobs.push(['roster', person, owner]);
    }
    if (!jobs.length) return;
    this._migrating = true;
    try {
      for (const [kind, entity, owner] of jobs) {
        const tag = `${kind === 'players' ? 'p' : 'r'}:${entity.id}`;
        this._migrated.add(tag);
        try {
          const wrote = await this._writeContactDoc(kind, entity.id, entity.phone, entity, { migrating: true, ownerUid: owner });
          if (!wrote.cleared) { this._migrated.delete(tag); continue; }
          const { doc, updateDoc, deleteField } = this.fs;
          const col = kind === 'players' ? 'players' : 'roster';
          await updateDoc(doc(this.db, col, entity.id), {
            phone: deleteField(),
            phoneKey: wrote.phoneKey,
            hasPhone: true,
            phoneOwnerUid: owner,
            phoneShared: false,
            updatedAt: Date.now(),
          });
          this._contactsLive = true;
        } catch (e) {
          this._migrated.delete(tag);
          if (e?.code === 'permission-denied') { this._contactsLive = false; return; }
          console.error(e);
        }
      }
    } finally {
      this._migrating = false;
    }
  }
  async addPlayer(match, data, who, opts = {}) {
    const { collection, addDoc, doc, updateDoc, deleteField } = this.fs; const now = Date.now();
    const mates = this.state.players.filter((p) => p.matchId === match.id);
    const cap = match.capacity || 14;
    const mainCount = mates.filter((p) => p.waiting !== true).length;
    const waiting = opts.waiting === true || mainCount >= cap;
    const token = newConfirmToken();
    const rosterId = String(data.rosterId || '').trim();
    const hold = opts.tentative === true && !waiting;
    const canon = canonicalWa(data.phone || '');
    const uid = this.actor?.uid || '';
    const player = {
      matchId: match.id, matchDate: match.date, name: data.name.trim(), phone: '',
      addedBy: who, addedByUid: uid, createdAt: now, updatedAt: now,
      waiting, waitOrder: waiting ? nextWaitOrder(mates.filter((p) => p.waiting === true)) : null,
      rosterAt: waiting ? null : now,
      confirmToken: token,
      hasPhone: !canon && data.hasPhone === true && /^[0-9a-f]{64}$/.test(String(data.phoneKey || '')),
      phoneKey: canon ? phoneKey(canon) : (/^[0-9a-f]{64}$/.test(String(data.phoneKey || '')) ? data.phoneKey : ''),
      phoneOwnerUid: canon ? uid : '', phoneShared: false,
      ...playerAccess(match),
      ...(rosterId ? { rosterId } : {}),
      ...(hold ? { tentative: true, tentativeAt: now } : {}),
    };
    const ref = await addDoc(collection(this.db, 'players'), player);
    const stored = this.state.matches.find((item) => item.id === match.id) || match;
    await updateDoc(doc(this.db, 'matches', match.id), { ...countPatch(this.fs, stored, 1, mates.length), updatedAt: now });
    if (canon) {
      try {
        await this._writeContactDoc('players', ref.id, canon, player, { visibleToAll: data.phoneShared === true });
        await updateDoc(doc(this.db, 'players', ref.id), { hasPhone: true, phone: deleteField(), phoneShared: data.phoneShared === true });
        this._contactsLive = true;
      } catch (e) {
        if (e?.code !== 'permission-denied') throw e;
        this._contactsLive = false;
        await updateDoc(doc(this.db, 'players', ref.id), { phone: canon, hasPhone: true });
      }
    }
    await this._writeConfirmation(token, ref.id, player, match);
    await this.ensureShortLink(ref.id, { matchId: match.id, confirmToken: token });
    return ref.id;
  }
  async setTeams(id, teams, who) {
    const rec = teamsRecord(teams);
    if (!rec.ok) throw Object.assign(new Error(rec.error), { code: 'invalid-teams' });
    const { doc, updateDoc } = this.fs;
    await updateDoc(doc(this.db, 'matches', id), { teams: rec.teams, updatedBy: who || '', updatedAt: Date.now() });
  }
  async updatePlayer(id, data) {
    const { doc, updateDoc, writeBatch, deleteField } = this.fs;
    const cur = this.state.players.find((player) => player.id === id) || {};
    if (cur.id && playerPatchEditsIdentity(data, cur) && !canEditPlayer(cur, this.actor)) throw editLockedError();
    const { phone, ...rest } = data || {};
    const patch = { ...rest, updatedAt: Date.now() };
    if ('phone' in (data || {})) {
      try {
        const wrote = await this._writeContactDoc('players', id, phone, { ...cur, ...rest });
        if (wrote.cleared) {
          patch.phone = deleteField();
          patch.hasPhone = !!wrote.phoneKey;
          patch.phoneKey = wrote.phoneKey || '';
          patch.phoneOwnerUid = wrote.ownerUid || cur.phoneOwnerUid || this.actor?.uid || '';
          patch.phoneShared = wrote.visibleToAll === true;
          this._contactsLive = true;
        } else if (wrote.denied && canonicalWa(phone)) patch.phone = canonicalWa(phone);
      } catch (e) {
        if (e?.code !== 'permission-denied') throw e;
        this._contactsLive = false;
        if (canonicalWa(phone)) patch.phone = canonicalWa(phone);
      }
    } else if (String(cur.phone || '').trim()) {
      try {
        const owner = this._ownerUidFor(cur, 'players');
        const wrote = await this._writeContactDoc('players', id, cur.phone, cur, { migrating: true, ownerUid: owner });
        if (wrote.cleared) {
          patch.phone = deleteField();
          patch.hasPhone = true;
          patch.phoneKey = wrote.phoneKey;
          patch.phoneOwnerUid = wrote.ownerUid;
          patch.phoneShared = false;
          this._contactsLive = true;
        }
      } catch (e) {
        if (e?.code !== 'permission-denied') throw e;
        this._contactsLive = false;
      }
    } else if (this._contactsLive) {
      patch.phone = deleteField();
    }
    const match = this.state.matches.find((item) => item.id === cur?.matchId);
    const nextTeams = data?.waiting === true && cur?.id ? dropPlayer(match?.teams, cur.id) : { changed: false };
    if (nextTeams.changed) {
      const batch = writeBatch(this.db);
      batch.update(doc(this.db, 'players', id), patch);
      batch.update(doc(this.db, 'matches', cur.matchId), { teams: nextTeams.teams, updatedAt: patch.updatedAt });
      await batch.commit();
    } else {
      await updateDoc(doc(this.db, 'players', id), patch);
    }
    const token = data.confirmToken || cur?.confirmToken;
    if (!token) return;
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
  async ensureShortLink(id, hint) {
    const p = this.state.players.find((x) => x.id === id) || hint || null;
    const token = p?.confirmToken || hint?.confirmToken || '';
    if (!token) return '';
    const known = isShortCode(p?.shortCode) ? p.shortCode : (this._shortCodes.get(id) || '');
    if (isShortCode(known)) return known;
    const mint = this._mintShortLink(id, p?.matchId || hint?.matchId || '', token).catch((e) => {
      if (e?.code === 'permission-denied') this._linksLive = false;
      else console.error(e);
      return '';
    });
    return await Promise.race([
      mint,
      new Promise((resolve) => setTimeout(() => resolve(''), 2000)),
    ]);
  }
  async _mintShortLink(id, matchId, token) {
    const { doc, getDoc, setDoc, updateDoc } = this.fs;
    for (let n = 0; n < 4; n++) {
      const code = newShortCode();
      const ref = doc(this.db, 'links', code);
      const cur = await getDoc(ref);
      if (cur.exists()) continue;
      await setDoc(ref, { m: matchId, p: id, t: token });
      try {
        await updateDoc(doc(this.db, 'players', id), { shortCode: code });
      } catch (e) {
        if (e?.code !== 'permission-denied') console.error(e);
      }
      this._linksLive = true;
      this._shortCodes.set(id, code);
      return code;
    }
    return '';
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
    await this.ensureShortLink(id, { matchId: fresh.matchId, confirmToken: token, shortCode: fresh.shortCode });
    return token;
  }
  async markReminderSent(id) {
    await this.updatePlayer(id, { reminderSentAt: Date.now() });
  }
  async deletePlayer(id) {
    const { doc, writeBatch } = this.fs;
    const player = this.state.players.find((item) => item.id === id);
    const match = this.state.matches.find((item) => item.id === player?.matchId);
    const nextTeams = dropPlayer(match?.teams, id);
    const localCount = this.state.players.filter((item) => item.matchId === player?.matchId).length;
    const dropLink = isShortCode(player?.shortCode);
    const commit = async (withLink) => {
      const batch = writeBatch(this.db);
      batch.delete(doc(this.db, 'players', id));
      if (player?.confirmToken) batch.delete(doc(this.db, 'confirmations', player.confirmToken));
      if (withLink) batch.delete(doc(this.db, 'links', player.shortCode));
      if (match) {
        const patch = { ...countPatch(this.fs, match, -1, localCount), updatedAt: Date.now() };
        if (nextTeams.changed) patch.teams = nextTeams.teams;
        batch.update(doc(this.db, 'matches', match.id), patch);
      }
      if (this._contactsLive) batch.delete(doc(this.db, 'playerContacts', id));
      await batch.commit();
    };
    try {
      await commit(dropLink);
      if (dropLink) this._linksLive = true;
    } catch (e) {
      if (!dropLink || e?.code !== 'permission-denied') throw e;
      this._linksLive = false;
      await commit(false);
    }
  }
  _rosterDup(phone, id) {
    const key = phoneKey(canonicalWa(phone));
    if (!key) return null;
    return (this.state.roster || []).find((row) => row.id !== id && phoneIdentity(row) === key) || null;
  }
  async addRoster(data, who) {
    const phone = canonicalWa(data.phone || '');
    const existing = this._rosterDup(phone, '');
    if (existing) throw Object.assign(new Error(`${existing.name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    const { collection, addDoc, doc, updateDoc, deleteField } = this.fs; const now = Date.now();
    const uid = this.actor?.uid || '';
    const person = {
      name: data.name.trim(), phone: '', createdBy: who || '', createdByUid: uid, createdAt: now, updatedAt: now,
      hasPhone: false, phoneKey: phone ? phoneKey(phone) : '', phoneOwnerUid: uid, phoneShared: false,
    };
    const ref = await addDoc(collection(this.db, 'roster'), person);
    if (phone) {
      try {
        await this._writeContactDoc('roster', ref.id, phone, person, { visibleToAll: data.phoneShared === true });
        await updateDoc(doc(this.db, 'roster', ref.id), { hasPhone: true, phone: deleteField(), phoneShared: data.phoneShared === true });
        this._contactsLive = true;
      } catch (e) {
        if (e?.code !== 'permission-denied') throw e;
        this._contactsLive = false;
        await updateDoc(doc(this.db, 'roster', ref.id), { phone, hasPhone: true });
      }
    }
    return ref.id;
  }
  async updateRoster(id, data) {
    const cur = this.state.roster.find((r) => r.id === id) || {};
    if (cur.id && !canEditRoster(cur, this.actor)) throw editLockedError();
    const phone = 'phone' in (data || {}) ? (data.phone || '') : (cur.phone || this.state.rosterContacts?.[id]?.phone || '');
    if ('phone' in (data || {}) && canonicalWa(phone)) {
      const dup = this._rosterDup(phone, id);
      if (dup) throw Object.assign(new Error(`${dup.name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    }
    const { doc, updateDoc, deleteField } = this.fs;
    const next = { name: data.name.trim(), updatedAt: Date.now() };
    if ('phone' in (data || {})) {
      try {
        const wrote = await this._writeContactDoc('roster', id, phone, cur);
        if (wrote.cleared) {
          next.phone = deleteField();
          next.hasPhone = !!wrote.phoneKey;
          next.phoneKey = wrote.phoneKey || '';
          next.phoneOwnerUid = wrote.ownerUid || cur.phoneOwnerUid || this.actor?.uid || '';
          next.phoneShared = wrote.visibleToAll === true;
          this._contactsLive = true;
        } else if (canonicalWa(phone)) next.phone = canonicalWa(phone);
      } catch (e) {
        if (e?.code !== 'permission-denied') throw e;
        this._contactsLive = false;
        if (canonicalWa(phone)) next.phone = canonicalWa(phone);
      }
    } else if (this._contactsLive) next.phone = deleteField();
    await updateDoc(doc(this.db, 'roster', id), next);
  }
  async patchRoster(id, patch) {
    const cur = this.state.roster.find((r) => r.id === id);
    if (!cur) throw new Error('Jugador inexistente');
    if (!canEditRoster(cur, this.actor)) throw editLockedError();
    const next = { updatedAt: Date.now() };
    if ('name' in patch) next.name = String(patch.name || '').trim();
    if ('level' in patch) next.level = patch.level;
    if ('positions' in patch) next.positions = patch.positions || [];
    if ('notes' in patch) next.notes = patch.notes || [];
    if ('phone' in patch && canonicalWa(patch.phone)) {
      const dup = this._rosterDup(patch.phone, id);
      if (dup) throw Object.assign(new Error(`${dup.name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    }
    const { doc, updateDoc, deleteField } = this.fs;
    if ('phone' in patch) {
      try {
        const wrote = await this._writeContactDoc('roster', id, patch.phone, cur);
        if (wrote.cleared) {
          next.phone = deleteField();
          next.hasPhone = !!wrote.phoneKey;
          next.phoneKey = wrote.phoneKey || '';
          next.phoneOwnerUid = wrote.ownerUid || cur.phoneOwnerUid || this.actor?.uid || '';
          next.phoneShared = wrote.visibleToAll === true;
          this._contactsLive = true;
        } else if (canonicalWa(patch.phone)) next.phone = canonicalWa(patch.phone);
      } catch (e) {
        if (e?.code !== 'permission-denied') throw e;
        this._contactsLive = false;
        if (canonicalWa(patch.phone)) next.phone = canonicalWa(patch.phone);
      }
    } else if (String(cur.phone || '').trim()) {
      try {
        const owner = this._ownerUidFor(cur, 'roster');
        const wrote = await this._writeContactDoc('roster', id, cur.phone, cur, { migrating: true, ownerUid: owner });
        if (wrote.cleared) {
          next.phone = deleteField();
          next.hasPhone = true;
          next.phoneKey = wrote.phoneKey;
          next.phoneOwnerUid = wrote.ownerUid;
          next.phoneShared = false;
          this._contactsLive = true;
        }
      } catch (e) {
        if (e?.code !== 'permission-denied') throw e;
        this._contactsLive = false;
      }
    } else if (this._contactsLive) next.phone = deleteField();
    await updateDoc(doc(this.db, 'roster', id), next);
  }
  async deleteRoster(id) {
    const { doc, writeBatch } = this.fs;
    const batch = writeBatch(this.db);
    batch.delete(doc(this.db, 'roster', id));
    if (this._contactsLive) batch.delete(doc(this.db, 'rosterContacts', id));
    await batch.commit();
  }
  async setPhoneShared(target, visible) {
    const uid = this.actor?.uid || '';
    if (!uid) throw Object.assign(new Error('No hay sesión'), { code: 'permission-denied' });
    const want = visible === true;
    const rosterId = target?.rosterId || '';
    const playerId = target?.playerId || '';
    const contact = rosterId ? this.state.rosterContacts?.[rosterId] : this.state.playerContacts?.[playerId];
    if (!contact || contact.ownerUid !== uid) throw Object.assign(new Error(PRIVATE_WA_TEXT), { code: 'permission-denied' });
    const key = contact.phoneKey;
    const { doc, writeBatch } = this.fs;
    const batch = writeBatch(this.db);
    const now = Date.now();
    let n = 0;
    for (const [id, item] of Object.entries(this.state.rosterContacts || {})) {
      if (item.ownerUid === uid && item.phoneKey === key) {
        batch.update(doc(this.db, 'rosterContacts', id), { visibleToAll: want });
        batch.update(doc(this.db, 'roster', id), { phoneShared: want, updatedAt: now });
        n += 1;
      }
    }
    for (const [id, item] of Object.entries(this.state.playerContacts || {})) {
      if (item.ownerUid === uid && item.phoneKey === key) {
        batch.update(doc(this.db, 'playerContacts', id), { visibleToAll: want });
        batch.update(doc(this.db, 'players', id), { phoneShared: want, updatedAt: now });
        n += 1;
      }
    }
    if (!n) throw Object.assign(new Error('No se pudo cambiar la privacidad'), { code: 'permission-denied' });
    await batch.commit();
  }
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
