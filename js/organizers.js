// Lista de organizadores. Pura: no escribe en Firestore.
// Gustavo y Martín siguen siendo los de siempre si la lista todavía no se cargó.
import { foldText } from './roster.js';

export const DEFAULT_ORGANIZERS = ['Gustavo', 'Martín'];
export const UNSPECIFIED = 'Sin especificar';
export const MAX_ORGANIZER_NAME = 40;

export const ORGANIZERS_DENIED_READ = 'No se puede leer la lista de organizadores. Gustavo tiene que republicar las reglas de Firestore para la colección organizers.';
export const ORGANIZERS_DENIED_WRITE = 'No se pudo guardar el organizador. Gustavo tiene que republicar las reglas de Firestore para la colección organizers.';

export function isOrganizerDenied(error) {
  return error?.code === 'permission-denied';
}

export function organizerSlug(name) {
  const base = foldText(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return base || 'organizador';
}

export function sameOrganizer(a, b) {
  const left = foldText(a);
  return left !== '' && left === foldText(b);
}

function organizerIdentity(value) {
  if (value && typeof value === 'object') {
    return {
      uid: String(value.uid || '').trim(),
      name: String(value.name || '').trim(),
    };
  }
  return { uid: '', name: String(value || '').trim() };
}

/**
 * La misma persona: mismo uid, mismo nombre, o un apodo que es el
 * comienzo del nombre (Gus y Gustavo). El apodo tiene al menos 3 letras.
 */
export function sameOrganizerIdentity(a, b) {
  const left = organizerIdentity(a);
  const right = organizerIdentity(b);
  if (left.uid && right.uid && left.uid === right.uid) return true;
  if (sameOrganizer(left.name, right.name)) return true;
  const ln = foldText(left.name);
  const rn = foldText(right.name);
  if (ln.length < 3 || rn.length < 3) return false;
  return ln.startsWith(rn) || rn.startsWith(ln);
}

/**
 * Nombre con el que se guarda un cobro. Si el texto es el apodo de una
 * sola persona de la lista, queda el nombre de esa persona.
 * Si hay más de una, no se adivina.
 */
export function canonicalOrganizerName(label, people) {
  const raw = String(label || '').trim().replace(/\s+/g, ' ');
  const list = (Array.isArray(people) ? people : [people]).map(organizerIdentity).filter((item) => item.name);
  if (!raw) return list.length === 1 ? list[0].name : '';
  const exact = list.find((item) => sameOrganizer(item.name, raw));
  if (exact) return exact.name;
  const hits = [];
  for (const item of list) {
    if (!sameOrganizerIdentity(raw, item)) continue;
    if (hits.some((have) => (have.uid && item.uid && have.uid === item.uid) || sameOrganizer(have.name, item.name))) continue;
    hits.push(item);
  }
  return hits.length === 1 ? hits[0].name : raw;
}

/** Clase del tag "Agregó". Gustavo y Martín conservan el color; el resto, neutro. */
export function organizerTagClass(name) {
  const folded = foldText(name);
  if (folded === 'gustavo') return 'g';
  if (folded === 'martin') return 'm';
  return '';
}

/**
 * Nombres para el selector, en el orden en que se agregaron.
 * Si no hay ninguno guardado, usa el fallback (Gustavo y Martín).
 */
export function organizerNames(stored, fallback = DEFAULT_ORGANIZERS) {
  const list = [...(stored || [])]
    .filter((item) => String(item?.name || '').trim())
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0) || foldText(a.name).localeCompare(foldText(b.name), 'es'));
  const out = [];
  for (const item of list) {
    const name = String(item.name).trim();
    if (out.some((have) => sameOrganizer(have, name))) continue;
    out.push(name);
  }
  return out.length ? out : [...fallback];
}

/**
 * Nombres para los desplegables de pago. Salen de la colección organizers.
 * Gustavo y Martín del config solo entran si la colección está vacía o no se pudo leer.
 * Un nombre que ya está en un pago y ya no está en la lista se conserva.
 */
export function organizerChoices(stored, { unreadable = false, extra = [] } = {}) {
  const fromList = organizerNames(stored, []);
  const base = (!unreadable && fromList.length) ? fromList : [...DEFAULT_ORGANIZERS];
  const out = [...base];
  for (const raw of extra) {
    const name = String(raw || '').trim();
    if (!name || out.some((have) => sameOrganizer(have, name))) continue;
    out.push(name);
  }
  return out;
}

export function cleanOrganizerName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'Poné el nombre.' };
  if (name.length > MAX_ORGANIZER_NAME) return { ok: false, error: 'El nombre es muy largo.' };
  if (sameOrganizer(name, UNSPECIFIED)) return { ok: false, error: 'Ese nombre está reservado.' };
  return { ok: true, name };
}
