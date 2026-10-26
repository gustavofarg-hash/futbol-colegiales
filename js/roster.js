// Plantel guardado y búsqueda rápida. Puro: no escribe en Firestore.
// La búsqueda no distingue mayúsculas ni acentos. El teléfono compara solo dígitos.
// Sin WhatsApp, la misma persona se reconoce por el id del plantel y, si no hay, por el nombre.
import { normalizePhone } from './phone.js';
import { phoneKey } from './privacy.js';

export const ROSTER_DENIED_READ = 'No se pueden leer los jugadores guardados. Gustavo tiene que republicar las reglas de Firestore para la colección roster.';
export const ROSTER_DENIED_WRITE = 'No se pudo guardar en Jugadores. Gustavo tiene que republicar las reglas de Firestore para la colección roster.';

export function isRosterDenied(error) {
  return error?.code === 'permission-denied';
}

export function foldText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

export function cleanShortName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 40);
}

/**
 * En la lista del partido y en Equipos se ve el apodo.
 * Si está en Jugadores, manda ese apodo. Si no, el que quedó copiado en el partido.
 */
export function displayName(player, roster) {
  const person = player?.rosterId
    ? (roster || []).find((item) => item?.id === player.rosterId)
    : null;
  if (person) return cleanShortName(person.shortName) || player?.name || person.name || '';
  return cleanShortName(player?.shortName) || player?.name || '';
}

/** true si el texto es el comienzo del nombre, del apodo, del apellido (cualquier palabra) o un tramo del teléfono. */
export function rosterHit(person, query) {
  const raw = String(query || '').trim();
  if (!raw) return true;
  const q = foldText(raw);
  const words = `${foldText(person?.name)} ${foldText(person?.shortName)}`.split(/\s+/).filter(Boolean);
  if (q && words.some((word) => word.startsWith(q))) return true;
  const digits = phoneDigits(raw);
  if (digits && phoneDigits(person?.phone).includes(digits)) return true;
  return false;
}

export function searchRoster(roster, query) {
  const list = [...(roster || [])].sort((a, b) => foldText(a.name).localeCompare(foldText(b.name), 'es') || String(a.id).localeCompare(String(b.id)));
  const q = String(query || '').trim();
  if (!q) return list;
  return list.filter((person) => rosterHit(person, q));
}

/** Teléfono listo para wa.me. Si no se puede normalizar, quedan los dígitos. Vacío si no hay número. */
export function canonicalPhone(phone) {
  const raw = String(phone || '').trim();
  if (!raw) return '';
  const parsed = normalizePhone(raw);
  return parsed.ok ? parsed.wa : phoneDigits(raw);
}

/** Hash guardado, o el hash del teléfono visible. Vacío si no hay número. */
export function phoneIdentity(entity) {
  const explicit = String(entity?.phoneKey || '').trim();
  if (/^[0-9a-f]{64}$/.test(explicit)) return explicit;
  const phone = canonicalPhone(entity?.phone);
  return phone ? phoneKey(phone) : '';
}

export function rosterByPhone(roster, phone) {
  const key = phoneIdentity({ phone });
  if (!key) return null;
  return (roster || []).find((person) => phoneIdentity(person) === key) || null;
}

export function rosterByIdentity(roster, key) {
  const id = String(key || '').trim();
  if (!id) return null;
  return (roster || []).find((person) => phoneIdentity(person) === id) || null;
}

/**
 * El jugador es esta ficha del plantel.
 * Manda el teléfono (el hash, aunque el número esté oculto). Si ninguno tiene, manda el id del plantel.
 * Si el jugador no tiene teléfono ni id, alcanza el mismo nombre.
 */
export function playerMatchesPerson(player, person) {
  if (!player || !person) return false;
  const phoneP = phoneIdentity(player);
  const phoneR = phoneIdentity(person);
  if (phoneP && phoneR && phoneP === phoneR) return true;
  if (player.rosterId && person.id && player.rosterId === person.id) return true;
  if (phoneP || player.rosterId || phoneR) return false;
  const left = foldText(player.name);
  const right = foldText(person.name);
  return !!left && left === right;
}
