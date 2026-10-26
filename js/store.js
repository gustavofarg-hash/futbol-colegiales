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
//    court: string opcional, hasta 20 (N° de cancha). Vacío = sin número.
//    price: int opcional. Precio por jugador de este partido. Si falta, el pago usa Ajustes.
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
//    signedUpWith, signedUpWithName: organizador con quien se anotó (uid + nombre)
//    goals: int opcional 0..99. Goles de ese jugador en el partido. No cambia matches.score.
//    inGoal: bool opcional. Marcó que fue al arco. No cambia el marcador.
//    createdAt, updatedAt
//    paid: bool                         (opcional)
//    amount: number|null                (pesos; solo si paid)
//    method: "efectivo"|"transferencia"|null
//    receivedBy: string|null           (quién cobró; null o ausente = "Sin especificar")
//    paidUpdatedBy, paidUpdatedAt
//    waiting: bool                      (true = lista de espera)
//    invitedBy: id del jugador principal que lo trajo. Un invitado no puede ser anfitrión. invitedByName: nombre de ese momento.
//    waitOrder: number|null             (menor = más prioridad; null si es titular)
//    rosterAt: number|null              (cuándo entró a la lista principal)
//    confirmToken: string               (link largo de confirmar.html; se crea al anotar)
//    shortCode: string                  (8 caracteres; el mensaje usa /c/?k=shortCode)
//  links/{code}
//    m: matchId, p: playerId, t: confirmToken
//    shortUrl, shortProvider ('spoo'|'dagd'), shortAt   (cache del acortador; se escribe al mandar)
//    El código es el id. Se lee sin cuenta, igual que confirmations. No se lista.
//    confirmed: "si"|"no"               (respuesta del jugador)
//    confirmedAt, reminderSentAt: number
//    tentative: bool|null               (lugar reservado, a confirmar; ocupa cupo)
//    tentativeAt: number|null
//  matches.teams (opcional)
//    { bib: [playerId], plain: [playerId] }
//    bib = con pechera, plain = sin pechera. Solo titulares.
//    Se guarda en el mismo partido: quien puede anotar lo edita y el resto lo ve.
//  matches.score (opcional) { bib, plain } enteros 0..999. Marcador del partido,
//    independiente de los goles de cada jugador.
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
//    shortName: apodo opcional, hasta 40. En el partido y en Equipos reemplaza al nombre.
//    createdBy, createdAt, updatedAt
//    level: número de 1 a 10, con un decimal (6.8). En pantalla va con coma.
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
import { historyBounds, historyCaption, historyWindow, matchAlreadyPlayed, matchQueryPlan, storedLevel } from './profile.js';
import { paymentRecord, receivePendingTransfer } from './payments.js';
import { MAX_PRICE } from './prices.js';
import { PRICES_DENIED_READ, priceRecord } from './prices.js';
import { nextWaitOrder } from './waiting.js';
import { bumpGoals, bumpScore, dropPlayer, scoreRecord, teamsRecord } from './teams.js';
import { confirmationIdentity, confirmationRecord, newConfirmToken, overlayConfirmations } from './reminders.js';
import { isShortCode, newShortCode } from './short.js';
import { acceptedExternalShort } from './shorten.js';
import { ALREADY_IN_MATCH, alreadyInMatch, inviteBlock, isAutoGuestName } from './guests.js';
import { EVERYONE, accessPatch, canAdd, canView, playerAccess } from './access.js';
import { ROSTER_DENIED_READ, cleanShortName, isRosterDenied, phoneIdentity } from './roster.js';
import { PRIVATE_WA_TEXT, attachPhone, canonicalWa, phoneKey } from './privacy.js';
import {
  ORGANIZERS_DENIED_READ, ORGANIZERS_DENIED_WRITE, cleanOrganizerName, isOrganizerDenied, organizerSlug, sameOrganizer,
} from './organizers.js';
import { canEditPlayer, canEditRoster, editLockedError, playerPatchEditsIdentity } from './edit-lock.js';
import {
  DEFAULT_VENUE_ID, DEFAULT_VENUE_NAME, VENUES_DENIED_READ, cleanCourt, cleanVenueName, isVenueDenied, matchSize, sameVenueName, venueSlug,
} from './venues.js';

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

/**
 * Una consulta vieja (toda la colección, sin el filtro de viewers) falla con
 * permission-denied cuando las reglas ya piden ese filtro. Eso se atiende en
 * su propio manejador y no reinicia el resto. Si no hay manejador, se reintenta
 * una sola vez: el token a veces no estaba listo. Un snapshot que sí llega no
 * vuelve el contador a cero, porque si no el reintento no termina nunca.
 */
export function listenDeniedPlan({ code, hasHandler, retrying, deniedRetries }) {
  if (code !== 'permission-denied' && code !== 'permission_denied') return 'fail';
  if (hasHandler) return 'handler';
  if (!retrying && (deniedRetries || 0) < 1) return 'retry';
  return 'fail';
}

export function matchIdFor(date, time, existingIds = new Set()) {
  const base = `${date}_${(time || '0000').replace(':', '')}`;
  if (!existingIds.has(base)) return base;
  for (let i = 2; ; i++) if (!existingIds.has(`${base}-${i}`)) return `${base}-${i}`;
}

const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function refuseDuplicate(mates, data, exceptId = '') {
  const name = String(data?.name || '').trim();
  const invitedBy = String(data?.invitedBy || '').trim();
  if (alreadyInMatch(mates, {
    name,
    phone: data?.phone || '',
    phoneKey: data?.phoneKey || '',
    rosterId: data?.rosterId || '',
    hasPhone: data?.hasPhone === true,
    invitedBy,
    guestAuto: data?.guestAuto === true,
  }, { roster: false, exceptId })) {
    throw Object.assign(new Error(ALREADY_IN_MATCH), { code: 'already-in-match' });
  }
}

/** Nombre y teléfono que quedarían después del cambio, sin contar al mismo jugador. */
function identityAfterEdit(player, data) {
  const phoneIn = data && 'phone' in data;
  return {
    name: data && 'name' in data ? data.name : player?.name,
    phone: phoneIn ? (data.phone || '') : (player?.phone || ''),
    phoneKey: phoneIn ? '' : (player?.phoneKey || ''),
    hasPhone: phoneIn ? !!canonicalWa(data.phone || '') : player?.hasPhone === true,
    rosterId: data && 'rosterId' in data ? data.rosterId : (player?.rosterId || ''),
    invitedBy: data && 'invitedBy' in data ? data.invitedBy : (player?.invitedBy || ''),
    guestAuto: data && 'guestAuto' in data ? data.guestAuto === true : storedGuestAuto(player),
  };
}

function storedGuestAuto(player) {
  if (player?.guestAuto === true) return true;
  if (player?.guestAuto === false) return false;
  return !!player?.invitedBy && isAutoGuestName(player?.name);
}

function refuseGuestHost(mates, data, current) {
  if (!data || !('invitedBy' in data)) return;
  const next = String(data.invitedBy || '').trim();
  const prev = String(current?.invitedBy || '').trim();
  if (!next || next === prev) return;
  const message = inviteBlock(mates, next);
  if (message) throw Object.assign(new Error(message), { code: 'guest-cannot-invite' });
}

function guestFields(data) {
  const invitedBy = String(data?.invitedBy || '').trim();
  if (!invitedBy) return {};
  const invitedByName = String(data?.invitedByName || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const base = invitedByName ? { invitedBy, invitedByName } : { invitedBy };
  if (data?.guestAuto === true) base.guestAuto = true;
  else if (data?.guestAuto === false) base.guestAuto = false;
  return base;
}

/** Con quién se anotó. Si el alta no lo manda, queda el organizador logueado. */
function signupWith(data, actor) {
  const has = !!data && ('signedUpWith' in data || 'signedUpWithName' in data);
  const uid = String((has ? data.signedUpWith : actor?.uid) || '').trim().slice(0, 128);
  const name = String((has ? data.signedUpWithName : actor?.name) || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!uid || !name) return {};
  return { signedUpWith: uid, signedUpWithName: name };
}

function applySignupPatch(rest) {
  if (!rest || (!('signedUpWith' in rest) && !('signedUpWithName' in rest))) return;
  const next = signupWith(rest, null);
  delete rest.signedUpWith;
  delete rest.signedUpWithName;
  Object.assign(rest, next);
}

function cleanPersonName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function rosterPlayers(db) {
  const contacts = db.contacts?.players || {};
  return Object.entries(db.players || {}).map(([id, row]) => ({
    id,
    ...row,
    phone: row.phone || contacts[id]?.phone || '',
  }));
}

/**
 * Al cambiar el nombre en Jugadores, los jugadores del partido con ese
 * rosterId pasan a llamarse igual. Un solo lote, después de chequear
 * duplicados. Si quien está logueado no creó a ese jugador, no lo toca.
 */
function rosterNamePatches(players, rosterId, newName, actor) {
  const id = String(rosterId || '').trim();
  const name = cleanPersonName(newName);
  if (!id || !name) return [];
  const rows = (players || []).filter((row) => row?.id);
  const byId = new Map(rows.map((row) => [row.id, row]));
  const patches = [];
  for (const player of rows) {
    if (String(player.rosterId || '') !== id) continue;
    if (cleanPersonName(player.name) === name) continue;
    if (!canEditPlayer(player, actor)) continue;
    const invitedBy = String(player.invitedBy || '').trim();
    const host = invitedBy ? byId.get(invitedBy) : null;
    const hostName = cleanPersonName(host?.name || player.invitedByName || '');
    const patch = { name };
    if (invitedBy || player.guestAuto === true || isAutoGuestName(player.name)) patch.guestAuto = false;
    if (invitedBy) {
      patch.invitedBy = invitedBy;
      if (hostName) patch.invitedByName = hostName;
    }
    const mates = rows.filter((row) => row.matchId === player.matchId);
    refuseDuplicate(mates, identityAfterEdit(player, patch), player.id);
    patches.push({ id: player.id, patch });
  }
  return patches;
}

function applyRosterNamePatches(db, patches, now) {
  for (const item of patches) {
    const player = db.players[item.id];
    if (!player) continue;
    Object.assign(player, item.patch, { updatedAt: now });
  }
}

function mergePlayerPatches(...groups) {
  const byId = new Map();
  for (const item of groups.flat()) {
    const prev = byId.get(item.id);
    byId.set(item.id, { id: item.id, patch: { ...(prev?.patch || {}), ...item.patch } });
  }
  return [...byId.values()];
}

/** Copia el apodo a los jugadores del partido con ese rosterId que este organizador puede editar. */
function rosterShortPatches(players, rosterId, shortName, actor) {
  const id = String(rosterId || '').trim();
  if (!id) return [];
  const short = cleanShortName(shortName);
  const patches = [];
  for (const player of players || []) {
    if (!player?.id || String(player.rosterId || '') !== id) continue;
    if (!canEditPlayer(player, actor)) continue;
    if (cleanShortName(player.shortName) === short) continue;
    patches.push({ id: player.id, patch: { shortName: short } });
  }
  return patches;
}

function applyShortName(target, value, present) {
  if (!present) return;
  const short = cleanShortName(value);
  if (short) target.shortName = short;
  else delete target.shortName;
}

function matchDoc(data, who) {
  const now = Date.now();
  const access = data?.access ? accessPatch(data.access) : null;
  const size = matchSize(data);
  return {
    date: data.date,
    time: data.time,
    startsAt: toEpoch(data.date, data.time),
    note: (data.note || '').trim(),
    venueId: String(data.venueId || DEFAULT_VENUE_ID),
    venueName: String(data.venueName || DEFAULT_VENUE_NAME).trim() || DEFAULT_VENUE_NAME,
    capacity: size.capacity,
    ...(size.perTeam ? { perTeam: size.perTeam } : {}),
    ...(cleanCourt(data.court) ? { court: cleanCourt(data.court) } : {}),
    ...(storedMatchPrice(data) != null ? { price: storedMatchPrice(data) } : {}),
    source: data.source || 'manual',
    sourceRef: data.sourceRef || null,
    sourceText: data.sourceText || null,
    createdBy: who, updatedBy: who,
    createdAt: now, updatedAt: now,
    playerCount: 0,
    ...(access || {}),
  };
}

function refusePlayedCancel(match, data) {
  if (data?.cancelled !== true || match?.cancelled === true) return;
  const date = data.date || match?.date;
  if (matchAlreadyPlayed({ date })) {
    throw Object.assign(new Error('Este partido ya se jugó. No se puede cancelar.'), { code: 'already-played' });
  }
}

function storedMatchPrice(data) {
  if (!data || !('price' in data) || data.price == null || data.price === '') return null;
  const n = Number(data.price);
  if (Number.isInteger(n) && n >= 0 && n <= MAX_PRICE) return n;
  return null;
}

function cleanMatchPatch(data) {
  const access = data?.access ? accessPatch(data.access) : null;
  const { access: _access, playerCount: _count, ...rest } = data || {};
  if ('notes' in rest) rest.notes = String(rest.notes ?? '').slice(0, 2000);
  if ('court' in rest) rest.court = cleanCourt(rest.court);
  if ('price' in rest) {
    const price = storedMatchPrice(rest);
    if (price == null) delete rest.price;
    else rest.price = price;
  }
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
  constructor() { this.key = DEMO_STORAGE_KEY; this.mode = 'demo'; this.listeners = new Set(); this.actor = null; this._historyFilter = null; this._queryDay = todayISO(); }
  setActor(user) {
    const next = { uid: user?.uid || '', name: user?.name || '' };
    if (this.actor?.uid === next.uid && this.actor?.name === next.name) return;
    this.actor = next;
    if (this.listeners.size) this._emit();
  }
  setHistoryFilter(filter) {
    this._historyFilter = filter && (filter.day || filter.from || filter.to) ? filter : null;
    this._emit();
  }
  syncDay(now = Date.now()) {
    const today = todayISO(new Date(now));
    if (today === this._queryDay) return;
    this._queryDay = today;
    if (this.listeners.size) this._emit();
  }
  async ensureMatch() {}
  _load() {
    try {
      const db = JSON.parse(localStorage.getItem(this.key)) || { matches: {}, players: {}, roster: {}, organizers: {}, venues: {}, confirmations: {}, settings: {}, contacts: { players: {}, roster: {} } };
      db.matches ||= {}; db.players ||= {}; db.roster ||= {}; db.organizers ||= {}; db.venues ||= {}; db.confirmations ||= {}; db.settings ||= {};
      ensureContacts(db);
      migratePhones(db);
      return db;
    } catch { return { matches: {}, players: {}, roster: {}, organizers: {}, venues: {}, confirmations: {}, settings: {}, contacts: { players: {}, roster: {} } }; }
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
      const prev = db.links[code] || {};
      const next = { m: player.matchId, p: pid, t: player.confirmToken };
      const cached = prev.t === player.confirmToken ? acceptedExternalShort(prev) : null;
      if (cached) {
        next.shortUrl = cached.shortUrl;
        next.shortProvider = cached.shortProvider;
        next.shortAt = typeof prev.shortAt === 'number' ? prev.shortAt : Date.now();
      }
      db.links[code] = next;
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
  async readExternalShort(code) {
    if (!isShortCode(code)) return null;
    const row = this._load().links?.[code];
    const parsed = acceptedExternalShort(row);
    return parsed ? { ...parsed, shortAt: row.shortAt } : null;
  }
  async saveExternalShort(code, rec) {
    if (!isShortCode(code)) return;
    const parsed = acceptedExternalShort(rec);
    if (!parsed) return;
    const db = this._load();
    const row = db.links?.[code];
    if (!row) return;
    row.shortUrl = parsed.shortUrl;
    row.shortProvider = parsed.shortProvider;
    row.shortAt = Date.now();
    this._save(db);
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
  _seedVenues(db) {
    db.venues ||= {};
    if (db.venues[DEFAULT_VENUE_ID]) return false;
    db.venues[DEFAULT_VENUE_ID] = { name: DEFAULT_VENUE_NAME, active: true, order: 0, createdAt: Date.now() };
    return true;
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
    const venues = Object.entries(db.venues || {}).map(([id, venue]) => ({ id, ...venue }));
    const prices = db.settings?.prices || null;
    const windowed = historyWindow(matches, this._historyFilter);
    const history = windowed.matches;
    const { matches: _rows, ...historyMeta } = windowed;
    this.listeners.forEach((fn) => fn({
      matches, history, historyMeta, historyError: '',
      players, roster, rosterError: null, organizers, organizersError: null, venues, venuesError: null, prices, pricesError: null,
    }));
  }
  async init() {
    if (typeof window !== 'undefined') window.addEventListener('storage', (e) => { if (e.key === this.key) this._emit(); });
    const db = this._load();
    this._seedOrganizers(db);
    this._seedVenues(db);
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
    refusePlayedCancel(m, data);
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
    const mates = Object.entries(db.players)
      .filter(([, row]) => row.matchId === match.id)
      .map(([pid, row]) => ({ id: pid, ...row }));
    refuseDuplicate(mates, data);
    refuseGuestHost(mates, data);
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
      ...guestFields(data),
      ...(hold ? { tentative: true, tentativeAt: now } : {}),
      ...signupWith(data, this.actor),
      ...(cleanShortName(data.shortName) ? { shortName: cleanShortName(data.shortName) } : {}),
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
  async adjustScore(id, side, delta, who) {
    const db = this._load();
    const match = db.matches[id];
    if (!match) return;
    match.score = scoreRecord(bumpScore(match.score, side, delta)).score;
    match.updatedBy = who || match.updatedBy;
    match.updatedAt = Date.now();
    this._save(db);
  }
  async adjustGoals(playerId, delta) {
    const db = this._load();
    const player = db.players[playerId];
    if (!player) return;
    player.goals = bumpGoals(player.goals, delta);
    player.updatedAt = Date.now();
    this._save(db);
  }
  async setInGoal(playerId, on) {
    const db = this._load();
    const player = db.players[playerId];
    if (!player) return;
    player.inGoal = on === true;
    player.updatedAt = Date.now();
    this._save(db);
  }
  async updatePlayer(id, data) {
    const db = this._load(); if (!db.players[id]) return;
    const player = db.players[id];
    const mates = Object.entries(db.players)
      .filter(([, row]) => row.matchId === player.matchId)
      .map(([pid, row]) => ({ id: pid, ...row }));
    refuseGuestHost(mates, data, player);
    if (playerPatchEditsIdentity(data, player) && !canEditPlayer(player, this.actor)) throw editLockedError();
    if (playerPatchEditsIdentity(data, player)) {
      refuseDuplicate(mates, identityAfterEdit(player, data), id);
    }
    const { phone, ...rest } = data || {};
    applySignupPatch(rest);
    Object.assign(player, rest, { updatedAt: Date.now() });
    delete player.phone;
    if ('phone' in (data || {})) {
      const visible = typeof data.phoneShared === 'boolean' ? data.phoneShared : undefined;
      writeContact(db, 'players', id, phone, player, player.addedByUid || this.actor?.uid || '', visible);
    }
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
    applyShortName(person, data.shortName, 'shortName' in (data || {}));
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
    const nextName = cleanPersonName(data?.name ?? cur.name);
    if (!nextName) throw Object.assign(new Error('Poné el nombre.'), { code: 'invalid-name' });
    const patches = mergePlayerPatches(
      nextName !== cleanPersonName(cur.name) ? rosterNamePatches(rosterPlayers(db), id, nextName, this.actor) : [],
      'shortName' in (data || {}) ? rosterShortPatches(rosterPlayers(db), id, data.shortName, this.actor) : [],
    );
    const now = Date.now();
    Object.assign(cur, { name: nextName, updatedAt: now });
    applyShortName(cur, data?.shortName, 'shortName' in (data || {}));
    delete cur.phone;
    if ('phone' in (data || {})) writeContact(db, 'roster', id, phone, cur, cur.createdByUid || this.actor?.uid || '');
    applyRosterNamePatches(db, patches, now);
    this._save(db);
  }
  async patchRoster(id, patch) {
    const db = this._load(); const cur = db.roster[id]; if (!cur) return;
    if (!canEditRoster(cur, this.actor)) throw editLockedError();
    const next = {};
    let namePatches = [];
    if ('name' in patch) {
      next.name = cleanPersonName(patch.name);
      if (next.name && next.name !== cleanPersonName(cur.name)) namePatches = rosterNamePatches(rosterPlayers(db), id, next.name, this.actor);
    }
    if ('level' in patch) {
      const level = storedLevel(patch.level);
      if (level == null) throw Object.assign(new Error('El nivel va de 1 a 10, con un solo decimal.'), { code: 'invalid-level' });
      next.level = level;
    }
    if ('positions' in patch) next.positions = patch.positions || [];
    if ('notes' in patch) next.notes = patch.notes || [];
    if ('shortName' in patch) {
      namePatches = mergePlayerPatches(namePatches, rosterShortPatches(rosterPlayers(db), id, patch.shortName, this.actor));
    }
    const phone = 'phone' in patch ? (patch.phone || '') : this._rosterPhone(db, id);
    if ('phone' in patch && phone) {
      const dup = phoneDup(db, 'roster', id, phone);
      if (dup) throw Object.assign(new Error(`${dup.name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    }
    const now = Date.now();
    Object.assign(cur, next, { updatedAt: now });
    if ('shortName' in patch) applyShortName(cur, patch.shortName, true);
    delete cur.phone;
    if ('phone' in patch) writeContact(db, 'roster', id, phone, cur, cur.createdByUid || this.actor?.uid || '');
    applyRosterNamePatches(db, namePatches, now);
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
  async addVenue(name) {
    const clean = cleanVenueName(name);
    if (!clean.ok) throw Object.assign(new Error(clean.error), { code: 'invalid-venue' });
    const db = this._load();
    db.venues ||= {};
    if (Object.values(db.venues).some((item) => sameVenueName(item.name, clean.name))) {
      throw Object.assign(new Error(`${clean.name} ya está en las sedes`), { code: 'venue-duplicate' });
    }
    let id = venueSlug(clean.name);
    let n = 2;
    while (db.venues[id]) id = `${venueSlug(clean.name)}-${n++}`;
    const order = Object.values(db.venues).reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1;
    db.venues[id] = { name: clean.name, active: true, order, createdAt: Date.now() };
    this._save(db);
    return id;
  }
  async updateVenue(id, patch) {
    const db = this._load();
    const cur = db.venues?.[id];
    if (!cur) throw Object.assign(new Error('No está esa sede'), { code: 'venue-missing' });
    if ('name' in (patch || {})) {
      const clean = cleanVenueName(patch.name);
      if (!clean.ok) throw Object.assign(new Error(clean.error), { code: 'invalid-venue' });
      if (Object.entries(db.venues).some(([oid, item]) => oid !== id && sameVenueName(item.name, clean.name))) {
        throw Object.assign(new Error(`${clean.name} ya está en las sedes`), { code: 'venue-duplicate' });
      }
      cur.name = clean.name;
    }
    if ('active' in (patch || {})) cur.active = patch.active !== false;
    this._save(db);
  }
  async clearAll() {
    localStorage.removeItem(this.key);
    const db = this._load();
    this._seedOrganizers(db);
    this._seedVenues(db);
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
    this.state = { matches: [], players: [], roster: [], rosterError: null, organizers: [], organizersError: null, venues: [], venuesError: null, confirmations: [], prices: null, pricesError: null, playerContacts: {}, rosterContacts: {}, historyError: '' };
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
    if (!id || !this.fs) return 'missing';
    if (this.state.matches.some((match) => match.id === id)) return 'ok';
    const { doc, getDoc } = this.fs;
    try {
      const snap = await getDoc(doc(this.db, 'matches', id));
      if (!snap.exists()) return 'missing';
      const match = { id: snap.id, ...snap.data() };
      if (this.actor?.uid && !canView(match, this.actor.uid)) return 'hidden';
      const opened = (this._buckets.matches.opened || []).filter((row) => row.id !== match.id);
      opened.push(match);
      this._buckets.matches.opened = opened;
      this._rebuild('matches');
      return 'ok';
    } catch (e) {
      if (e?.code === 'permission-denied' || e?.code === 'permission_denied') return 'denied';
      console.error(e);
      return 'missing';
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
    this._seedVenues();
    // Si Firestore no existe o la API está deshabilitada, el SDK reintenta en silencio:
    // avisamos si en 15 s no llegó ninguna respuesta del servidor.
    setTimeout(() => {
      if (this.serverOk || navigator.onLine === false) return;
      if (this._sawDenied) this._fail({ code: 'permission-denied', message: 'reglas' });
      else this._fail({ code: 'no-server', message: 'sin respuesta del servidor' });
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
      const next = (snap) => { onNext(snap); };
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
    watch(collection(this.db, 'venues'), null, (snap) => {
      this.state.venues = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this.state.venuesError = null;
      this._emit();
    }, (e) => {
      this.state.venues = [];
      this.state.venuesError = isVenueDenied(e) ? VENUES_DENIED_READ : ('No se pudieron leer las sedes: ' + (e?.message || e?.code || e));
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
    const plan = listenDeniedPlan({
      code: e?.code,
      hasHandler: typeof extra === 'function',
      retrying: !!this._retrying,
      deniedRetries: this._deniedRetries || 0,
    });
    if (plan === 'handler') {
      this._sawDenied = true;
      extra(e);
      return;
    }
    if (plan === 'retry') {
      this._sawDenied = true;
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
  async _seedVenues() {
    const { doc, getDoc, setDoc } = this.fs;
    try {
      const ref = doc(this.db, 'venues', DEFAULT_VENUE_ID);
      const cur = await getDoc(ref);
      if (!cur.exists()) {
        await setDoc(ref, { name: DEFAULT_VENUE_NAME, active: true, order: 0, createdAt: Date.now() });
      }
    } catch (e) {
      if (isVenueDenied(e)) {
        this.state.venuesError = VENUES_DENIED_READ;
        this._emit();
        return;
      }
      console.error(e);
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
    refusePlayedCancel(cur, data);
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
    refuseDuplicate(mates, data);
    refuseGuestHost(mates, data);
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
      ...guestFields(data),
      ...(hold ? { tentative: true, tentativeAt: now } : {}),
      ...signupWith(data, this.actor),
      ...(cleanShortName(data.shortName) ? { shortName: cleanShortName(data.shortName) } : {}),
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
  async adjustScore(id, side, delta, who) {
    const { doc, getDoc, updateDoc } = this.fs;
    const ref = doc(this.db, 'matches', id);
    const snap = await getDoc(ref);
    const score = scoreRecord(bumpScore(snap.data()?.score, side, delta)).score;
    await updateDoc(ref, { score, updatedBy: who || '', updatedAt: Date.now() });
  }
  async adjustGoals(playerId, delta) {
    const { doc, getDoc, updateDoc } = this.fs;
    const ref = doc(this.db, 'players', playerId);
    const snap = await getDoc(ref);
    const goals = bumpGoals(snap.data()?.goals, delta);
    await updateDoc(ref, { goals, updatedAt: Date.now() });
  }
  async setInGoal(playerId, on) {
    const { doc, updateDoc } = this.fs;
    await updateDoc(doc(this.db, 'players', playerId), { inGoal: on === true, updatedAt: Date.now() });
  }
  async updatePlayer(id, data) {
    const { doc, updateDoc, writeBatch, deleteField } = this.fs;
    const cur = this.state.players.find((player) => player.id === id) || {};
    if (cur.id) {
      const mates = this.state.players.filter((row) => row.matchId === cur.matchId);
      refuseGuestHost(mates, data, cur);
    }
    if (cur.id && playerPatchEditsIdentity(data, cur) && !canEditPlayer(cur, this.actor)) throw editLockedError();
    if (cur.id && playerPatchEditsIdentity(data, cur)) {
      const mates = this.state.players.filter((row) => row.matchId === cur.matchId);
      refuseDuplicate(mates, identityAfterEdit(cur, data), id);
    }
    const { phone, ...rest } = data || {};
    applySignupPatch(rest);
    const patch = { ...rest, updatedAt: Date.now() };
    if ('phone' in (data || {})) {
      try {
        const contactOpts = typeof data.phoneShared === 'boolean' ? { visibleToAll: data.phoneShared } : {};
        const wrote = await this._writeContactDoc('players', id, phone, { ...cur, ...rest }, contactOpts);
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
  async readExternalShort(code) {
    if (!isShortCode(code)) return null;
    try {
      const { doc, getDoc } = this.fs;
      const snap = await getDoc(doc(this.db, 'links', code));
      if (!snap.exists()) return null;
      const data = snap.data();
      const parsed = acceptedExternalShort(data);
      return parsed ? { ...parsed, shortAt: data.shortAt } : null;
    } catch {
      return null;
    }
  }
  async saveExternalShort(code, rec) {
    if (!isShortCode(code)) return;
    const parsed = acceptedExternalShort(rec);
    if (!parsed) return;
    try {
      const { doc, updateDoc } = this.fs;
      await updateDoc(doc(this.db, 'links', code), {
        shortUrl: parsed.shortUrl,
        shortProvider: parsed.shortProvider,
        shortAt: Date.now(),
      });
    } catch (e) {
      if (e?.code !== 'permission-denied') console.error(e);
    }
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
      ...(cleanShortName(data.shortName) ? { shortName: cleanShortName(data.shortName) } : {}),
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
    const { doc, updateDoc, deleteField, writeBatch } = this.fs;
    const nextName = cleanPersonName(data?.name ?? cur.name);
    if (!nextName) throw Object.assign(new Error('Poné el nombre.'), { code: 'invalid-name' });
    const namePatches = mergePlayerPatches(
      nextName !== cleanPersonName(cur.name) ? rosterNamePatches(this.state.players || [], id, nextName, this.actor) : [],
      'shortName' in (data || {}) ? rosterShortPatches(this.state.players || [], id, data.shortName, this.actor) : [],
    );
    const next = { name: nextName, updatedAt: Date.now() };
    if ('shortName' in (data || {})) {
      const short = cleanShortName(data.shortName);
      next.shortName = short || deleteField();
    }
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
    await this._commitRosterName(id, next, namePatches, { doc, updateDoc, writeBatch });
  }
  async _commitRosterName(id, next, namePatches, fs) {
    if (!namePatches?.length) {
      await fs.updateDoc(fs.doc(this.db, 'roster', id), next);
      return;
    }
    const batch = fs.writeBatch(this.db);
    const now = next.updatedAt || Date.now();
    batch.update(fs.doc(this.db, 'roster', id), next);
    for (const item of namePatches) batch.update(fs.doc(this.db, 'players', item.id), { ...item.patch, updatedAt: now });
    await batch.commit();
  }
  async patchRoster(id, patch) {
    const cur = this.state.roster.find((r) => r.id === id);
    if (!cur) throw new Error('Jugador inexistente');
    if (!canEditRoster(cur, this.actor)) throw editLockedError();
    const next = { updatedAt: Date.now() };
    let namePatches = [];
    if ('name' in patch) {
      next.name = cleanPersonName(patch.name);
      if (next.name && next.name !== cleanPersonName(cur.name)) namePatches = rosterNamePatches(this.state.players || [], id, next.name, this.actor);
    }
    if ('level' in patch) {
      const level = storedLevel(patch.level);
      if (level == null) throw Object.assign(new Error('El nivel va de 1 a 10, con un solo decimal.'), { code: 'invalid-level' });
      next.level = level;
    }
    if ('positions' in patch) next.positions = patch.positions || [];
    if ('notes' in patch) next.notes = patch.notes || [];
    if ('shortName' in patch) namePatches = mergePlayerPatches(namePatches, rosterShortPatches(this.state.players || [], id, patch.shortName, this.actor));
    if ('phone' in patch && canonicalWa(patch.phone)) {
      const dup = this._rosterDup(patch.phone, id);
      if (dup) throw Object.assign(new Error(`${dup.name} ya tiene ese WhatsApp`), { code: 'roster-duplicate' });
    }
    const { doc, updateDoc, deleteField, writeBatch } = this.fs;
    if ('shortName' in patch) next.shortName = cleanShortName(patch.shortName) || deleteField();
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
    await this._commitRosterName(id, next, namePatches, { doc, updateDoc, writeBatch });
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
  async addVenue(name) {
    const clean = cleanVenueName(name);
    if (!clean.ok) throw Object.assign(new Error(clean.error), { code: 'invalid-venue' });
    if ((this.state.venues || []).some((item) => sameVenueName(item.name, clean.name))) {
      throw Object.assign(new Error(`${clean.name} ya está en las sedes`), { code: 'venue-duplicate' });
    }
    let id = venueSlug(clean.name);
    let n = 2;
    while ((this.state.venues || []).some((item) => item.id === id)) id = `${venueSlug(clean.name)}-${n++}`;
    const order = (this.state.venues || []).reduce((max, item) => Math.max(max, Number(item.order) || 0), 0) + 1;
    const { doc, setDoc } = this.fs;
    await setDoc(doc(this.db, 'venues', id), { name: clean.name, active: true, order, createdAt: Date.now() });
    return id;
  }
  async updateVenue(id, patch) {
    const cur = (this.state.venues || []).find((item) => item.id === id);
    if (!cur) throw Object.assign(new Error('No está esa sede'), { code: 'venue-missing' });
    const next = {};
    if ('name' in (patch || {})) {
      const clean = cleanVenueName(patch.name);
      if (!clean.ok) throw Object.assign(new Error(clean.error), { code: 'invalid-venue' });
      if ((this.state.venues || []).some((item) => item.id !== id && sameVenueName(item.name, clean.name))) {
        throw Object.assign(new Error(`${clean.name} ya está en las sedes`), { code: 'venue-duplicate' });
      }
      next.name = clean.name;
    }
    if ('active' in (patch || {})) next.active = patch.active !== false;
    const { doc, updateDoc } = this.fs;
    await updateDoc(doc(this.db, 'venues', id), next);
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
