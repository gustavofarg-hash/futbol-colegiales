// Anotarse solo desde la ficha. Puro: no escribe en Firestore.
// Un pendiente no ocupa cupo ni suma plata hasta que el organizador confirma.
// La espera entra directo. Sacarse de un pendiente o de la espera no resta puntos.
import { toEpoch } from './dates.js';
import { personKey, rosterHolderIds } from './roster.js';

export const DROP_LOCK_MS = 4 * 60 * 60 * 1000;
export const RATE_WINDOW_MS = 30 * 60 * 1000;
export const RATE_MAX = 5;

/** El mismo pendiente de confirmación que usa el organizador: tentative, y lo anotó él. */
export function isSelfPending(player) {
  return player?.selfSignup === true && player?.tentative === true && player?.waiting !== true;
}

/** Ocupa un lugar del partido. El pendiente de confirmación también. La espera no. */
export function occupiesSpot(player) {
  return !!player && player.waiting !== true && player.noPlay !== true;
}

/**
 * El partido es de un organizador que tiene esta ficha.
 * Si no hay dueño ni lista de anotadores, se muestra igual (partido abierto viejo).
 */
export function matchOpenToRoster(match, person) {
  const holders = rosterHolderIds(person);
  if (!holders.length || !match || match.cancelled === true) return false;
  const created = String(match.createdByUid || '').trim();
  if (created && holders.includes(created)) return true;
  const adders = Array.isArray(match.adders) ? match.adders.map((id) => String(id || '')) : null;
  if (adders && adders.some((id) => id && id !== '*' && holders.includes(id))) return true;
  const open = !adders || adders.length === 0 || adders.includes('*');
  return open && !created;
}

export function signupRateDecision(prev, now = Date.now(), max = RATE_MAX, windowMs = RATE_WINDOW_MS) {
  const start = Number(prev?.windowStart) || 0;
  const count = Number(prev?.count) || 0;
  if (!start || now - start >= windowMs) return { ok: true, windowStart: now, count: 1 };
  if (count >= max) return { ok: false, windowStart: start, count, error: 'Esperá un rato para volver a anotarte.' };
  return { ok: true, windowStart: start, count: count + 1 };
}

/**
 * Qué muestra la fila. join = Anotarme, wait = Lista de espera,
 * cancel = Anular, locked = ya no se puede bajar solo.
 */
export function selfRowAction({ player, full, kickoff, now = Date.now() } = {}) {
  if (isSelfPending(player)) return { action: 'cancel', note: 'Pendiente de confirmación' };
  if (player?.waiting === true) return { action: 'cancel', note: '' };
  if (occupiesSpot(player)) {
    const left = Number(kickoff) - Number(now);
    if (left > DROP_LOCK_MS) return { action: 'cancel', note: '' };
    return { action: 'locked', note: 'Avisale al organizador para bajarte' };
  }
  if (full) return { action: 'wait', note: '' };
  return { action: 'join', note: '' };
}

export function playerOnMatch(person, match, players) {
  const id = String(person?.id || '');
  const key = personKey({ ...person, id }, players);
  return (players || []).find((player) => {
    if (!player || player.matchId !== match?.id) return false;
    if (id && player.rosterId === id) return true;
    return !!(key && personKey(player, players) === key);
  }) || null;
}

export function selfSignupRows({ person, matches, players, now = Date.now() } = {}) {
  return (matches || [])
    .filter((match) => match && match.cancelled !== true && matchOpenToRoster(match, person))
    .filter((match) => {
      const today = new Date(now);
      const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
      return String(match.date || '') >= iso && toEpoch(match.date, match.time || '00:00') > now - 2 * 3600e3;
    })
    .sort((a, b) => toEpoch(a.date, a.time) - toEpoch(b.date, b.time) || String(a.id).localeCompare(String(b.id)))
    .map((match) => {
      const player = playerOnMatch(person, match, players);
      const cap = Number(match.capacity) > 0 ? Number(match.capacity) : 14;
      const taken = (players || []).filter((item) => item?.matchId === match.id && occupiesSpot(item)).length;
      const kickoff = toEpoch(match.date, match.time);
      const action = selfRowAction({ player, full: taken >= cap, kickoff, now });
      return { match, player, taken, cap, ...action };
    });
}

/** Pendientes de este organizador, el más nuevo primero. Sin dueño, lo ve cualquiera. */
export function pendingSelfSignups({ players, matches, uid } = {}) {
  const byId = new Map((matches || []).filter((match) => match?.id).map((match) => [match.id, match]));
  return (players || [])
    .filter((player) => isSelfPending(player))
    .map((player) => ({ player, match: byId.get(player.matchId) || null }))
    .filter(({ match }) => {
      if (!match || match.cancelled === true) return false;
      const owners = [];
      if (match.createdByUid) owners.push(String(match.createdByUid));
      for (const id of match.adders || []) if (id && id !== '*') owners.push(String(id));
      return !owners.length || owners.includes(String(uid || ''));
    })
    .sort((a, b) => (Number(b.player.createdAt) || 0) - (Number(a.player.createdAt) || 0) || String(b.player.id).localeCompare(String(a.player.id)));
}

export function canSelfCancel(player, match, now = Date.now()) {
  if (!player) return false;
  if (isSelfPending(player) || player.waiting === true) return true;
  if (!occupiesSpot(player)) return false;
  return toEpoch(match?.date, match?.time) - now > DROP_LOCK_MS;
}
