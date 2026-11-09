import { normalizePhone } from './phone.js';
import { sha256Hex } from './privacy.js';

// Backup de Mis Partidos. JSON para bajar, compartir o volver a cargar.
// No hay subcolecciones en la app: todo está en estas colecciones.
// El archivo igual acepta `subcollections` por si un backup futuro las trae.

export const BACKUP_FORMAT = 'mis-partidos-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_ZONE = 'America/Buenos_Aires';
// Una escritura por vez. Un lote grande suma los get() de las reglas (la cuenta
// del admin, cada partido, cada teléfono) y Firestore niega el lote entero al
// pasar de 20 lecturas o de 1000 expresiones. El mensaje es el de permisos.
// El emulador no aplica ese tope, por eso allá un lote de 400 parece andar.
export const BACKUP_WRITE_BATCH = 1;
export const BACKUP_LOADED_OK = 'Todos los datos fueron cargados con éxito';

/** Texto del avance. Con total 0 todavía no se sabe cuántos documentos van. */
export function backupProgressText(done, total) {
  const n = Math.max(0, Math.floor(Number(done) || 0));
  const all = Math.max(0, Math.floor(Number(total) || 0));
  if (!all) return 'Cargando…';
  return `Cargando… ${Math.min(n, all)}/${all}`;
}

export const BACKUP_COLLECTIONS = Object.freeze([
  'matches',
  'players',
  'roster',
  'venues',
  'organizers',
  'settings',
  'confirmations',
  'playerContacts',
  'rosterContacts',
  'links',
  'users',
  'credits',
  'log',
  'compensations',
  'rosterNotes',
  'rosterClaims',
  'rosterRedirects',
  'rosterSuspensions',
  'suspensionHistory',
  'payBatches',
]);

export const COLLECTION_LABELS = Object.freeze({
  matches: 'Partidos',
  players: 'Jugadores',
  roster: 'Plantel',
  venues: 'Sedes',
  organizers: 'Organizadores',
  settings: 'Ajustes',
  confirmations: 'Confirmaciones',
  playerContacts: 'Teléfonos de jugadores',
  rosterContacts: 'Teléfonos del plantel',
  links: 'Links',
  users: 'Cuentas',
  credits: 'Saldos a favor',
  log: 'Registro',
  compensations: 'Compensaciones',
  rosterNotes: 'Notas de jugadores',
  rosterClaims: 'Acceso al WhatsApp',
  rosterRedirects: 'Fichas unidas',
  rosterSuspensions: 'Suspensiones',
  suspensionHistory: 'Historial de suspensiones',
  payBatches: 'Pagos guardados',
});

const ID_MAX = 700;

export function requireAdmin(actor) {
  if (actor?.role !== 'admin') {
    throw Object.assign(new Error('Solo el administrador puede hacer eso.'), { code: 'admin-only' });
  }
}

function padPart(type, parts) {
  const value = parts.find((part) => part.type === type)?.value || '';
  return value === '24' && type === 'hour' ? '00' : value;
}

/** Fecha y hora local de Buenos Aires, sin depender del reloj del teléfono. */
export function buenosAiresStamp(date = new Date()) {
  const when = date instanceof Date ? date : new Date(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BACKUP_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(when);
  const year = padPart('year', parts);
  const month = padPart('month', parts);
  const day = padPart('day', parts);
  const hour = padPart('hour', parts);
  const minute = padPart('minute', parts);
  const second = padPart('second', parts);
  return {
    file: `${year}-${month}-${day}_${hour}-${minute}`,
    iso: `${year}-${month}-${day}T${hour}:${minute}:${second}-03:00`,
  };
}

export function backupFilename(date = new Date()) {
  return `Mis_partidos_${buenosAiresStamp(date).file}.json`;
}

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Deja el valor listo para JSON. Un Timestamp de Firestore pasa a segundos. */
export function plainValue(value) {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value.toMillis === 'function' && typeof value.seconds === 'number') {
    return {
      __type: 'timestamp',
      seconds: value.seconds,
      nanoseconds: Number.isFinite(value.nanoseconds) ? value.nanoseconds : 0,
    };
  }
  if (Array.isArray(value)) return value.map((item) => plainValue(item));
  if (typeof value === 'object') {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined) continue;
      out[key] = plainValue(item);
    }
    return out;
  }
  return null;
}

function copyDocs(raw) {
  const out = {};
  if (!isPlainObject(raw)) return out;
  for (const [id, doc] of Object.entries(raw)) {
    if (!isPlainObject(doc)) continue;
    out[id] = plainValue(doc);
  }
  return out;
}

export function buildBackup(collections, when = new Date()) {
  const docs = {};
  for (const name of BACKUP_COLLECTIONS) docs[name] = copyDocs(collections?.[name]);
  const sub = {};
  if (isPlainObject(collections?.subcollections)) {
    for (const [path, doc] of Object.entries(collections.subcollections)) {
      if (isPlainObject(doc)) sub[path] = plainValue(doc);
    }
  }
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: buenosAiresStamp(when).iso,
    collections: docs,
    subcollections: sub,
  };
}

export function summarizeBackup(backup) {
  const counts = {};
  let total = 0;
  for (const name of BACKUP_COLLECTIONS) {
    const n = Object.keys(backup?.collections?.[name] || {}).length;
    counts[name] = n;
    total += n;
  }
  const subcollections = Object.keys(backup?.subcollections || {}).length;
  return { exportedAt: backup?.exportedAt || '', counts, total, subcollections };
}

function validDocId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= ID_MAX && id !== '.' && id !== '..' && !id.includes('/');
}

function reject(error) {
  return { ok: false, error };
}

function checkDocs(name, docs) {
  if (!isPlainObject(docs)) return `«${name}» tiene que ser un objeto de documentos.`;
  for (const [id, doc] of Object.entries(docs)) {
    if (!validDocId(id)) return `Hay un id inválido en ${name}.`;
    if (!isPlainObject(doc)) return `El documento ${id} de ${name} no es válido.`;
  }
  return '';
}

export function parseBackup(raw) {
  let data = raw;
  if (typeof raw === 'string') {
    try { data = JSON.parse(raw); }
    catch { return reject('Ese archivo no es un JSON.'); }
  }
  if (!isPlainObject(data)) return reject('El backup no tiene el formato de Mis Partidos.');
  if (data.format !== BACKUP_FORMAT) return reject('El backup no tiene el formato de Mis Partidos.');
  if (data.version !== BACKUP_VERSION) return reject('Esa versión de backup no se puede cargar.');
  if (typeof data.exportedAt !== 'string' || !data.exportedAt) return reject('Al backup le falta la fecha.');
  if (!isPlainObject(data.collections)) return reject('Al backup le faltan las colecciones.');
  for (const key of Object.keys(data.collections)) {
    if (!BACKUP_COLLECTIONS.includes(key)) return reject(`Colección desconocida: ${key}.`);
  }
  const collections = {};
  for (const name of BACKUP_COLLECTIONS) {
    const docs = data.collections[name] ?? {};
    const problem = checkDocs(name, docs);
    if (problem) return reject(problem);
    collections[name] = docs;
  }
  const subcollections = {};
  if (data.subcollections != null) {
    if (!isPlainObject(data.subcollections)) return reject('Las subcolecciones no son válidas.');
    for (const [path, doc] of Object.entries(data.subcollections)) {
      const parts = String(path).split('/');
      if (parts.length < 4 || parts.length % 2 !== 0 || parts.some((part) => !validDocId(part))) {
        return reject('Hay una subcolección con una ruta inválida.');
      }
      if (!isPlainObject(doc)) return reject('Hay una subcolección con un documento inválido.');
      subcollections[path] = doc;
    }
  }
  const backup = { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: data.exportedAt, collections, subcollections };
  return { ok: true, backup, summary: summarizeBackup(backup) };
}

export function isFirebasePermissionDenied(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  return code === 'permission-denied'
    || code === 'permission_denied'
    || code.endsWith('/permission-denied')
    || /insufficient permissions/i.test(message);
}

function backupDenyText(error) {
  if (isFirebasePermissionDenied(error)) return 'Firebase rechazó el permiso.';
  const clean = String(error?.message || '').replace(/^FirebaseError:\s*/i, '').trim();
  return clean || 'Error de Firebase.';
}

/** El toast dice qué documento falló. Sin eso solo se ve "insufficient permissions". */
export function backupWriteError(op, error) {
  const path = Array.isArray(op?.segments) && op.segments.length ? op.segments.join('/') : 'documento';
  const action = op?.kind === 'delete' ? 'borrar' : 'guardar';
  return Object.assign(new Error(`No se pudo ${action} ${path}. ${backupDenyText(error)}`), {
    code: error?.code || 'backup-write',
    path,
  });
}

export function backupReadError(collectionName, error) {
  const label = COLLECTION_LABELS[collectionName] || collectionName;
  return Object.assign(new Error(`No se pudo leer ${label} (${collectionName}). ${backupDenyText(error)}`), {
    code: error?.code || 'backup-read',
    path: collectionName,
  });
}

/** Lo que se muestra en rojo. Nunca el texto crudo de Firebase, sin decir dónde. */
export function backupSurfaceMessage(error, fallback) {
  const text = String(error?.message || '').trim();
  if (/missing or insufficient permissions/i.test(text) && !/^No se pudo\b/.test(text)) {
    const where = error?.path ? ` ${error.path}` : '';
    return `No se pudo completar${where}. Firebase rechazó el permiso.`;
  }
  return text || fallback;
}

/** Vuelve a armar un Timestamp si el que escribe conoce la clase. */
// Campos que guardan un uid, o una lista de uids. '*' se conserva.
// invitedBy es el id del jugador anfitrión, no un uid: no entra.
const TRIAL_UID_FIELDS = new Set([
  'uid', 'createdByUid', 'addedByUid', 'signedUpWith', 'phoneOwnerUid', 'ownerUid',
  'organizerUid', 'actorUid', 'authorUid', 'toUid', 'fromUid',
]);
const TRIAL_UID_LISTS = new Set(['viewers', 'adders', 'editors', 'holders', 'readers']);

function isUidToken(value) {
  return typeof value === 'string' && /^[A-Za-z0-9]{6,128}$/.test(value);
}

function rememberUid(set, value, target) {
  if (!isUidToken(value) || value === target) return;
  set.add(value);
}

function collectTrialUids(backup, target) {
  const found = new Set();
  for (const id of Object.keys(backup.collections?.users || {})) rememberUid(found, id, target);
  const walk = (value, key) => {
    if (Array.isArray(value)) {
      if (TRIAL_UID_LISTS.has(key)) {
        for (const item of value) {
          if (typeof item === 'string') rememberUid(found, item, target);
          else walk(item, key);
        }
        return;
      }
      for (const item of value) walk(item, '');
      return;
    }
    if (!isPlainObject(value)) return;
    for (const [itemKey, item] of Object.entries(value)) {
      if (TRIAL_UID_FIELDS.has(itemKey) && typeof item === 'string') rememberUid(found, item, target);
      else walk(item, itemKey);
    }
  };
  for (const docs of Object.values(backup.collections || {})) walk(docs, '');
  walk(backup.subcollections, '');
  return found;
}

function mapTrialUid(value, target) {
  if (typeof value !== 'string' || value === '' || value === '*') return value;
  return target;
}

function mapTrialList(list, target) {
  const out = [];
  for (const item of list) {
    if (typeof item !== 'string') {
      out.push(mapTrialValue(item, '', target));
      continue;
    }
    const next = mapTrialUid(item, target);
    if (next === '' || !out.includes(next)) out.push(next);
  }
  return out;
}

function mapTrialValue(value, key, target) {
  if (Array.isArray(value)) {
    if (TRIAL_UID_LISTS.has(key)) return mapTrialList(value, target);
    return value.map((item) => mapTrialValue(item, '', target));
  }
  if (!isPlainObject(value)) return value;
  const out = {};
  for (const [itemKey, item] of Object.entries(value)) {
    if (TRIAL_UID_FIELDS.has(itemKey) && (typeof item === 'string' || item == null)) out[itemKey] = mapTrialUid(item, target);
    else out[itemKey] = mapTrialValue(item, itemKey, target);
  }
  return out;
}

function remapTrialDocId(collection, id, uids, target) {
  if (collection === 'users') {
    if (!id || id === target || id.includes('@')) return id;
    return isUidToken(id) ? target : id;
  }
  if (!id || !uids.size) return id;
  if (uids.has(id)) return target;
  let changed = false;
  const next = id.split('_').map((part) => {
    if (uids.has(part)) { changed = true; return target; }
    return part;
  });
  return changed ? next.join('_') : id;
}

function trialPhoneKey(doc, phone) {
  if (typeof doc.phoneKey === 'string' && /^[0-9a-f]{64}$/.test(doc.phoneKey)) return doc.phoneKey;
  return sha256Hex(String(phone));
}

// La regla de alta no acepta el teléfono dentro del jugador. En la prueba se
// pasa al contacto, que es donde la app lo lee, y el documento queda en blanco.
function parkTrialPhones(collections) {
  const jobs = [
    ['players', 'playerContacts', true],
    ['roster', 'rosterContacts', false],
  ];
  for (const [kind, contactName, withViewers] of jobs) {
    const docs = collections[kind];
    if (!isPlainObject(docs)) continue;
    const contacts = isPlainObject(collections[contactName]) ? collections[contactName] : {};
    for (const [id, doc] of Object.entries(docs)) {
      if (!isPlainObject(doc) || typeof doc.phone !== 'string' || doc.phone === '') continue;
      const parsed = normalizePhone(doc.phone);
      const phone = parsed.ok ? parsed.wa : doc.phone;
      const current = isPlainObject(contacts[id]) ? contacts[id] : {};
      if (!current.phone) {
        const next = {
          ...current,
          phone,
          ownerUid: current.ownerUid || doc.phoneOwnerUid || doc.addedByUid || doc.createdByUid || '',
          visibleToAll: current.visibleToAll === true,
          phoneKey: current.phoneKey || trialPhoneKey(doc, phone),
        };
        if (withViewers) next.viewers = current.viewers || (Array.isArray(doc.viewers) ? doc.viewers.slice() : ['*']);
        contacts[id] = next;
      }
      doc.phone = '';
      doc.hasPhone = true;
    }
    collections[contactName] = contacts;
  }
}

function alignTrialAccess(collections) {
  const matches = collections.matches;
  if (!isPlainObject(matches)) return;
  const copyList = (doc, match, key) => {
    if (Array.isArray(match[key])) doc[key] = match[key].slice();
  };
  if (isPlainObject(collections.players)) {
    for (const doc of Object.values(collections.players)) {
      if (!isPlainObject(doc)) continue;
      const match = matches[doc.matchId];
      if (!isPlainObject(match)) continue;
      copyList(doc, match, 'viewers');
      copyList(doc, match, 'adders');
      if (typeof doc.invitedBy === 'string' && doc.invitedBy && !Object.prototype.hasOwnProperty.call(collections.players, doc.invitedBy)) {
        delete doc.invitedBy;
        delete doc.invitedByName;
      }
    }
  }
  if (isPlainObject(collections.confirmations)) {
    for (const doc of Object.values(collections.confirmations)) {
      if (!isPlainObject(doc)) continue;
      const match = matches[doc.matchId];
      if (isPlainObject(match)) copyList(doc, match, 'viewers');
    }
  }
}

/**
 * En la versión de prueba, todo uid del backup pasa a ser el admin logueado.
 * Así las reglas (isAdder, ownerUid, listados por viewers) lo aceptan.
 * Fuera de /prueba/ no se llama. '*' queda. Los id de jugador (invitedBy) quedan.
 */
export function remapTrialBackup(backup, uid) {
  const target = String(uid || '').trim();
  if (!target || !isPlainObject(backup?.collections)) return backup;
  const draft = structuredClone(backup);
  parkTrialPhones(draft.collections);
  const found = collectTrialUids(draft, target);
  const collections = {};
  for (const [name, docs] of Object.entries(draft.collections)) {
    const next = {};
    if (!isPlainObject(docs)) { collections[name] = docs; continue; }
    for (const [id, doc] of Object.entries(docs)) {
      next[remapTrialDocId(name, id, found, target)] = mapTrialValue(doc, '', target);
    }
    collections[name] = next;
  }
  alignTrialAccess(collections);
  const subcollections = {};
  if (isPlainObject(draft.subcollections)) {
    for (const [path, doc] of Object.entries(draft.subcollections)) {
      const segments = String(path).split('/');
      const mapped = segments.map((part, index) => (index % 2 === 1 ? remapTrialDocId(segments[index - 1] || '', part, found, target) : part));
      subcollections[mapped.join('/')] = mapTrialValue(doc, '', target);
    }
  }
  return { ...draft, collections, subcollections };
}

function clipText(value, max) {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text ? text.slice(0, max) : '';
}

function finiteNumber(value, min, max) {
  if (value == null || value === '') return undefined;
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) return undefined;
  return n;
}

function wholeNumber(value, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) return undefined;
  return n;
}

/** La alta del jugador evalúa el documento entero. Con pago e invitado pasa el tope y Firebase lo niega. */
export function trialPlayerPlan(players, matches) {
  const docs = isPlainObject(players) ? players : {};
  const games = isPlainObject(matches) ? matches : {};
  const skipped = [];
  const creates = [];
  const invitePatches = [];
  const moneyPatches = [];
  const goalPatches = [];
  for (const [id, raw] of Object.entries(docs)) {
    if (!isPlainObject(raw)) {
      skipped.push({ path: `players/${id}`, reason: 'el documento no es válido' });
      continue;
    }
    const match = games[raw.matchId];
    if (!isPlainObject(match)) {
      skipped.push({ path: `players/${id}`, reason: 'el partido no está en el backup' });
      continue;
    }
    const create = {
      matchId: String(raw.matchId),
      name: clipText(raw.name, 60) || 'Sin nombre',
      phone: '',
    };
    if (typeof raw.matchDate === 'string' && raw.matchDate) create.matchDate = raw.matchDate.slice(0, 10);
    if (Array.isArray(match.viewers)) create.viewers = match.viewers.slice();
    if (Array.isArray(match.adders)) create.adders = match.adders.slice();
    if (typeof raw.addedBy === 'string' && clipText(raw.addedBy, 40)) create.addedBy = clipText(raw.addedBy, 40);
    if (typeof raw.addedByUid === 'string' && raw.addedByUid && raw.addedByUid.length <= 128) create.addedByUid = raw.addedByUid;
    if (typeof raw.signedUpWith === 'string' && raw.signedUpWith.trim() && raw.signedUpWith.trim().length <= 128) create.signedUpWith = raw.signedUpWith.trim();
    if (clipText(raw.signedUpWithName, 40)) create.signedUpWithName = clipText(raw.signedUpWithName, 40);
    for (const key of ['createdAt', 'updatedAt', 'rosterAt', 'tentativeAt', 'confirmedAt', 'reminderSentAt']) {
      if (typeof raw[key] === 'number' && Number.isFinite(raw[key])) create[key] = raw[key];
    }
    if (typeof raw.hasPhone === 'boolean') create.hasPhone = raw.hasPhone;
    if (typeof raw.phoneShared === 'boolean') create.phoneShared = raw.phoneShared;
    if (typeof raw.phoneKey === 'string' && (raw.phoneKey === '' || /^[0-9a-f]{64}$/.test(raw.phoneKey))) create.phoneKey = raw.phoneKey;
    if (typeof raw.phoneOwnerUid === 'string' && raw.phoneOwnerUid.length <= 128) create.phoneOwnerUid = raw.phoneOwnerUid;
    if (typeof raw.waiting === 'boolean') create.waiting = raw.waiting;
    if (typeof raw.noPlay === 'boolean') create.noPlay = raw.noPlay;
    if (typeof raw.tentative === 'boolean') create.tentative = raw.tentative;
    const waitOrder = finiteNumber(raw.waitOrder, 0, 1000000);
    if (waitOrder !== undefined) create.waitOrder = waitOrder;
    if (typeof raw.confirmToken === 'string' && raw.confirmToken.length >= 16 && raw.confirmToken.length <= 80) create.confirmToken = raw.confirmToken;
    if (raw.confirmed === 'si' || raw.confirmed === 'no') create.confirmed = raw.confirmed;
    if (typeof raw.shortCode === 'string' && /^[0-9A-Za-z]{8}$/.test(raw.shortCode)) create.shortCode = raw.shortCode;
    if (typeof raw.shortName === 'string' && raw.shortName.slice(0, 40)) create.shortName = raw.shortName.slice(0, 40);
    if (typeof raw.rosterId === 'string' && raw.rosterId && raw.rosterId.length <= 200) create.rosterId = raw.rosterId;
    creates.push({ id, data: create });

    const hostId = String(raw.invitedBy || '').trim();
    const host = hostId ? docs[hostId] : null;
    const hostIsMain = host && !String(host.invitedBy || '').trim() && games[host.matchId] && host.matchId === raw.matchId;
    if (hostIsMain) {
      const patch = { invitedBy: hostId.slice(0, 128), updatedAt: Date.now() };
      const hostName = clipText(raw.invitedByName || host.name, 60);
      if (hostName) patch.invitedByName = hostName;
      invitePatches.push({ id, data: patch });
    }

    const money = {};
    if (typeof raw.paid === 'boolean') money.paid = raw.paid;
    const amount = finiteNumber(raw.amount, 0, 1000000000);
    if (amount !== undefined) money.amount = amount;
    if (raw.method === 'efectivo' || raw.method === 'transferencia' || raw.method === 'credito') money.method = raw.method;
    for (const key of ['cash', 'transfer', 'pendingTransfer', 'fromCredit']) {
      const n = finiteNumber(raw[key], 0, 1000000000);
      if (n !== undefined) money[key] = n;
    }
    if (typeof raw.freePlay === 'boolean') money.freePlay = raw.freePlay;
    if (typeof raw.autoCredit === 'boolean') money.autoCredit = raw.autoCredit;
    for (const key of ['paidUpdatedBy', 'receivedBy', 'transferReceivedBy', 'cashTo', 'transferTo', 'pendingTo', 'creditTo']) {
      const text = clipText(raw[key], key === 'paidUpdatedBy' || key === 'creditTo' ? 40 : 40);
      if (text) money[key] = text;
    }
    if (typeof raw.paidUpdatedAt === 'number') money.paidUpdatedAt = raw.paidUpdatedAt;
    if (typeof raw.transferReceivedAt === 'number') money.transferReceivedAt = raw.transferReceivedAt;
    if (Object.keys(money).length) {
      money.updatedAt = Date.now();
      moneyPatches.push({ id, data: money });
    }

    const goals = {};
    const goalCount = wholeNumber(raw.goals, 0, 99);
    if (goalCount !== undefined) goals.goals = goalCount;
    if (typeof raw.inGoal === 'boolean') goals.inGoal = raw.inGoal;
    if (typeof raw.inGoalAt === 'number' && Number.isFinite(raw.inGoalAt)) goals.inGoalAt = raw.inGoalAt;
    if (Object.keys(goals).length) {
      goals.updatedAt = Date.now();
      goalPatches.push({ id, data: goals });
    }
  }
  return { skipped, creates, invitePatches, moneyPatches, goalPatches };
}

export function trialBackupResultText(failures) {
  const list = Array.isArray(failures) ? failures.filter((item) => item?.path) : [];
  if (!list.length) return '';
  const shown = list.slice(0, 8);
  const lines = shown.map((item) => `${item.path}: ${item.reason || 'Firebase rechazó el permiso'}`);
  const extra = list.length > shown.length ? `\ny ${list.length - shown.length} más` : '';
  return `Se cargó el resto. No se pudieron guardar ${list.length}:\n${lines.join('\n')}${extra}`;
}

/**
 * Un link con acortador no se puede crear de una: la regla solo acepta m, p y t.
 * Primero eso, y después el acortador si tiene la forma que la regla permite.
 */
export function trialLinkStages(data) {
  const base = { m: data?.m, p: data?.p, t: data?.t };
  const provider = data?.shortProvider;
  const url = data?.shortUrl;
  const spoo = provider === 'spoo' && typeof url === 'string' && /^https:\/\/spoo\.me\/[A-Za-z0-9_]+$/.test(url);
  const dagd = provider === 'dagd' && typeof url === 'string' && /^https:\/\/da\.gd\/[A-Za-z0-9_]+$/.test(url);
  if ((spoo || dagd) && typeof data.shortAt === 'number') {
    return [base, { ...base, shortAt: data.shortAt, shortProvider: provider, shortUrl: url }];
  }
  return [base];
}

/** Los anfitriones se escriben antes que sus invitados. invitedBy apunta al id del jugador. */
export function hostsBeforeGuests(ops) {
  const slots = [];
  const players = [];
  ops.forEach((op, index) => {
    if (op?.kind === 'set' && !op.merge && Array.isArray(op.segments) && op.segments.length === 2 && op.segments[0] === 'players') {
      slots.push(index);
      players.push(op);
    }
  });
  if (players.length < 2) return ops;
  const ids = new Set(players.map((op) => op.segments[1]));
  const ranked = players.map((op, index) => {
    const host = op.data?.invitedBy;
    return { op, index, guest: typeof host === 'string' && ids.has(host) ? 1 : 0 };
  });
  ranked.sort((a, b) => a.guest - b.guest || a.index - b.index);
  const next = ops.slice();
  slots.forEach((at, index) => { next[at] = ranked[index].op; });
  return next;
}

export function reviveValue(value, Timestamp) {
  if (Array.isArray(value)) return value.map((item) => reviveValue(item, Timestamp));
  if (isPlainObject(value) && value.__type === 'timestamp' && Number.isFinite(value.seconds)) {
    const nanos = Number.isFinite(value.nanoseconds) ? value.nanoseconds : 0;
    if (typeof Timestamp === 'function') return new Timestamp(value.seconds, nanos);
    return { seconds: value.seconds, nanoseconds: nanos };
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = reviveValue(item, Timestamp);
    return out;
  }
  return value;
}
