// Sedes y tamaño del equipo. Puro: no escribe en Firestore.
// La colección venues/{id} guarda name, active y order.
// Ajustes → Sedes da de alta, renombra y desactiva; no borra.
import { foldText } from './roster.js';

export const DEFAULT_VENUE_ID = 'colegiales';
export const DEFAULT_VENUE_NAME = 'Polideportivo Colegiales';
export const MIN_PER_TEAM = 5;
export const MAX_PER_TEAM = 11;
export const DEFAULT_PER_TEAM = 7;
export const MAX_VENUE_NAME = 80;

export const VENUES_DENIED_READ = 'No se pueden leer las sedes. Hay que publicar las reglas de Firestore para la colección venues. Mientras tanto se usa Polideportivo Colegiales.';
export const VENUES_DENIED_WRITE = 'No se pudo guardar la sede. Hay que publicar las reglas de Firestore para la colección venues.';

export function isVenueDenied(error) {
  return error?.code === 'permission-denied' || error?.code === 'permission_denied';
}

export function perTeamOptions() {
  const out = [];
  for (let n = MIN_PER_TEAM; n <= MAX_PER_TEAM; n++) out.push(n);
  return out;
}

export function venueSlug(name) {
  const base = foldText(name).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return base || 'sede';
}

export function cleanVenueName(raw) {
  const name = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!name) return { ok: false, error: 'Poné el nombre de la sede.' };
  if (name.length > MAX_VENUE_NAME) return { ok: false, error: 'El nombre es muy largo.' };
  return { ok: true, name };
}

export function sameVenueName(a, b) {
  const left = foldText(a);
  return left !== '' && left === foldText(b);
}

export function defaultVenue() {
  return { id: DEFAULT_VENUE_ID, name: DEFAULT_VENUE_NAME, active: true, order: 0 };
}

function sortedVenues(stored) {
  return [...(stored || [])]
    .filter((item) => item?.id && String(item.name || '').trim())
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || foldText(a.name).localeCompare(foldText(b.name), 'es'));
}

/**
 * Opciones del desplegable. Si la colección no se puede leer o está vacía,
 * queda solo Colegiales. Una sede inactiva entra si es la del partido que se edita.
 */
export function venueChoices(stored, { unreadable = false, currentId = '' } = {}) {
  const list = sortedVenues(stored);
  if (unreadable || !list.length) return [defaultVenue()];
  const active = list.filter((item) => item.active !== false);
  const shown = active.length ? [...active] : [...list];
  if (currentId && !shown.some((item) => item.id === currentId)) {
    const current = list.find((item) => item.id === currentId);
    if (current) shown.push(current);
  }
  return shown;
}

export function defaultVenueId(stored, opts) {
  const choices = venueChoices(stored, opts);
  return (choices.find((item) => item.id === DEFAULT_VENUE_ID) || choices[0]).id;
}

/** Nombre que se muestra. Si la sede se renombra, gana el nombre nuevo de la colección. */
export function venueLabel(match, stored) {
  const id = String(match?.venueId || '');
  const found = sortedVenues(stored).find((item) => item.id === id);
  if (found) return String(found.name).trim();
  const saved = String(match?.venueName || '').trim();
  if (saved) return saved;
  return DEFAULT_VENUE_NAME;
}

export function perTeamOf(match) {
  const asked = Number(match?.perTeam);
  if (Number.isInteger(asked) && asked >= MIN_PER_TEAM && asked <= MAX_PER_TEAM) return asked;
  const cap = Number(match?.capacity);
  if (Number.isInteger(cap) && cap > 0 && cap % 2 === 0) {
    const half = cap / 2;
    if (half >= MIN_PER_TEAM && half <= MAX_PER_TEAM) return half;
  }
  return DEFAULT_PER_TEAM;
}

export function capacityFor(perTeam) {
  return perTeamOf({ perTeam }) * 2;
}

/** Cupo de la cancha. Un partido viejo sin perTeam conserva el capacity que ya tenía. */
export function matchCapacity(match) {
  const cap = Number(match?.capacity);
  if (Number.isInteger(cap) && cap > 0) return cap;
  return capacityFor(perTeamOf(match));
}

/**
 * Lo que se guarda en el partido.
 * Si viene perTeam, el cupo es el doble.
 * Si solo viene capacity (partidos viejos o pruebas), se respeta.
 */
export function matchSize(data) {
  const asked = Number(data?.perTeam);
  if (Number.isInteger(asked) && asked >= MIN_PER_TEAM && asked <= MAX_PER_TEAM) {
    return { perTeam: asked, capacity: asked * 2 };
  }
  const explicit = Number(data?.capacity);
  if (Number.isInteger(explicit) && explicit > 0) {
    const half = explicit / 2;
    const perTeam = Number.isInteger(half) && half >= MIN_PER_TEAM && half <= MAX_PER_TEAM ? half : null;
    return { perTeam, capacity: explicit };
  }
  return { perTeam: DEFAULT_PER_TEAM, capacity: DEFAULT_PER_TEAM * 2 };
}
