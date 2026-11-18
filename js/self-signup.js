// Anotarse solo desde la ficha. Puro: no escribe en Firestore.
// Un pendiente no ocupa cupo ni suma plata hasta que el organizador confirma.
// La espera entra directo. Sacarse de un pendiente o de la espera no resta puntos.
import { toEpoch } from './dates.js';
import { personKey, rosterHolderIds } from './roster.js';
import { pendingConfirmLabel } from './share.js';

export const DROP_LOCK_MS = 4 * 60 * 60 * 1000;
export const RATE_WINDOW_MS = 30 * 60 * 1000;
export const RATE_MAX = 5;
export const RATE_WINDOW_MIN = 30;
export const RATE_MAX_LIMIT = 100;
export const RATE_WINDOW_MIN_LIMIT = 1440;

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

/** 5 y 30 si el documento no está o los números no entran en el rango. */
export function signupLimitFrom(raw) {
  const max = Number(raw?.maxMoves);
  const minutes = Number(raw?.windowMinutes);
  return {
    maxMoves: Number.isInteger(max) && max >= 1 && max <= RATE_MAX_LIMIT ? max : RATE_MAX,
    windowMinutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= RATE_WINDOW_MIN_LIMIT ? minutes : RATE_WINDOW_MIN,
  };
}

export function signupLimitRecord(input) {
  const max = Number(String(input?.maxMoves ?? '').trim());
  const minutes = Number(String(input?.windowMinutes ?? '').trim());
  if (!Number.isInteger(max) || max < 1 || max > RATE_MAX_LIMIT) {
    return { ok: false, error: 'Los movimientos tienen que ser entre 1 y 100.' };
  }
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > RATE_WINDOW_MIN_LIMIT) {
    return { ok: false, error: 'Los minutos tienen que ser entre 1 y 1440.' };
  }
  return { ok: true, patch: { maxMoves: max, windowMinutes: minutes } };
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
export function selfRowAction({ player, full, kickoff, now = Date.now(), organizerName = '' } = {}) {
  if (isSelfPending(player)) return { action: 'cancel', status: 'pending', note: pendingConfirmLabel(organizerName) };
  if (player?.waiting === true) return { action: 'cancel', status: 'wait', note: 'En lista de espera' };
  if (occupiesSpot(player)) {
    const left = Number(kickoff) - Number(now);
    if (left > DROP_LOCK_MS) return { action: 'cancel', status: 'confirmed', note: 'Confirmado' };
    return { action: 'locked', status: 'confirmed', note: 'Confirmado', lock: 'Avisale al organizador para bajarte' };
  }
  if (full) return { action: 'wait', note: '' };
  return { action: 'join', note: '' };
}

/** Sin el campo, el partido se muestra. Destildado, no aparece en la página del jugador. */
export function visibleToPlayers(match) {
  return match?.playerVisible !== false;
}

/**
 * Partido de este organizador en su enlace. Manda el uid, no el nombre:
 * en producción se muestra Gus y en la prueba Gustavo, y es la misma cuenta.
 * «Solo yo» no lo esconde: eso solo saca a los otros organizadores.
 */
export function guestMatchForOrganizer(match, { uid = '' } = {}) {
  if (!match || match.cancelled === true || !visibleToPlayers(match)) return false;
  const owner = String(uid || '').trim();
  if (!owner) return false;
  const created = String(match.createdByUid || '').trim();
  if (created === owner) return true;
  // Los compartidos con todos (viewers *) entran en el enlace de cualquier organizador.
  const viewers = Array.isArray(match.viewers) ? match.viewers.map((id) => String(id || '')) : [];
  if (viewers.includes('*')) return true;
  const adders = Array.isArray(match.adders) ? match.adders.map((id) => String(id || '')) : [];
  return adders.includes(owner);
}

/** Partido de este organizador: lo creó él, o está en quienes anotan (no el comodín *). */
export function matchOwnedBy(match, uid) {
  const id = String(uid || '').trim();
  if (!id || !match) return false;
  if (String(match.createdByUid || '').trim() === id) return true;
  const adders = Array.isArray(match.adders) ? match.adders.map((item) => String(item || '')) : [];
  return adders.includes(id);
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

export function selfSignupRows({ person, matches, players, now = Date.now(), organizerUid = '', organizerName = '', scoped = false } = {}) {
  const owner = String(organizerUid || '').trim();
  const label = String(organizerName || '').trim();
  return (matches || [])
    .filter((match) => {
      if (!match || match.cancelled === true || !visibleToPlayers(match)) return false;
      if (scoped) return guestMatchForOrganizer(match, { uid: owner, name: label });
      return matchOpenToRoster(match, person);
    })
    .filter((match) => {
      const today = new Date(now);
      const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(today);
      return String(match.date || '') >= iso && toEpoch(match.date, match.time || '00:00') > now - 2 * 3600e3;
    })
    .sort((a, b) => toEpoch(a.date, a.time) - toEpoch(b.date, b.time) || String(a.id).localeCompare(String(b.id)))
    .map((match) => {
      const player = playerOnMatch(person, match, players);
      const cap = Number(match.capacity) > 0 ? Number(match.capacity) : 14;
      const listed = (players || []).filter((item) => item?.matchId === match.id && occupiesSpot(item)).length;
      const stored = Number(match.playerCount);
      const taken = Number.isFinite(stored) ? Math.max(listed, Math.trunc(stored)) : listed;
      const kickoff = toEpoch(match.date, match.time);
      const action = selfRowAction({ player, full: taken >= cap, kickoff, now, organizerName: label });
      return { match, player, taken, cap, ...action };
    });
}

/** Pendientes de este organizador, el más nuevo primero. Sin dueño, lo ve cualquiera. */
export function pendingSelfSignups({ players, matches, uid, admin = false } = {}) {
  const byId = new Map((matches || []).filter((match) => match?.id).map((match) => [match.id, match]));
  return (players || [])
    .filter((player) => isSelfPending(player))
    .map((player) => ({ player, match: byId.get(player.matchId) || null }))
    .filter(({ player, match }) => {
      if (!match || match.cancelled === true) return false;
      const forUid = String(player.addedByUid || '').trim();
      if (forUid) return admin === true || forUid === String(uid || '');
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
