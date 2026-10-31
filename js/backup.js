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
