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

export function cleanOrganizerName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'Poné el nombre.' };
  if (name.length > MAX_ORGANIZER_NAME) return { ok: false, error: 'El nombre es muy largo.' };
  if (sameOrganizer(name, UNSPECIFIED)) return { ok: false, error: 'Ese nombre está reservado.' };
  return { ok: true, name };
}
