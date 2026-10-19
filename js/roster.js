// Plantel guardado y búsqueda rápida. Puro: no escribe en Firestore.
// La búsqueda no distingue mayúsculas ni acentos. El teléfono compara solo dígitos.

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

/** true si el texto es el comienzo del nombre, del apellido (cualquier palabra) o un tramo del teléfono. */
export function rosterHit(person, query) {
  const raw = String(query || '').trim();
  if (!raw) return true;
  const q = foldText(raw);
  const words = foldText(person?.name).split(/\s+/).filter(Boolean);
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

export function rosterByPhone(roster, phone) {
  if (!phone) return null;
  return (roster || []).find((person) => person.phone === phone) || null;
}
