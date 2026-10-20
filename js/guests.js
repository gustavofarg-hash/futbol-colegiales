// Amigos de un jugador y la regla de no anotar dos veces al mismo en un partido.
// Puro: no escribe en Firestore. El id del documento sigue siendo aleatorio
// (los partidos viejos ya están así). La repetición se frena en el cliente.
import { foldText, phoneIdentity } from './roster.js';

export const ALREADY_IN_MATCH = 'Ya está anotado en este partido';

export function normName(value) {
  return foldText(value).replace(/\s+/g, ' ').trim();
}

/** "Amigo 1", "Amigo 2", … El número es por quien invita, no del partido. */
export function isAutoGuestName(name) {
  return /^amigo \d+$/.test(normName(name));
}

function guestNumber(name) {
  const match = normName(name).match(/^amigo (\d+)$/);
  return match ? Number(match[1]) : 0;
}

export function isGenericGuest(player) {
  return !!player?.invitedBy && isAutoGuestName(player?.name);
}

/**
 * ¿Esta persona ya está en el partido, titular o en espera?
 * Manda el id del plantel. Si no, el nombre normalizado.
 * Con teléfono en los dos, un número distinto es otra persona
 * (Juan y Nico comparten línea a propósito: el teléfono solo no alcanza).
 * "Amigo N" automático no choca con otro "Amigo N": es de quien invita.
 * Un nombre escrito a mano, aunque sea "Amigo 1", sí choca.
 */
export function alreadyInMatch(players, candidate, { roster = true, exceptId = '' } = {}) {
  const name = normName(candidate?.name);
  const rosterId = String(candidate?.rosterId || '').trim();
  const phone = phoneIdentity(candidate || {});
  const generic = candidate?.guestAuto === true || isGenericGuest(candidate);
  const skip = String(exceptId || '').trim();
  for (const player of players || []) {
    if (skip && player?.id === skip) continue;
    const otherRoster = String(player?.rosterId || '').trim();
    // El plantel junta por teléfono. Juan y Nico comparten línea y son dos
    // jugadores: el id solo cuenta si también se pide (el selector de guardados).
    if (roster && rosterId && otherRoster && rosterId === otherRoster) return player;
    if (generic && isAutoGuestName(name)) continue;
    if (!name || name !== normName(player?.name)) continue;
    const otherPhone = phoneIdentity(player);
    if (phone && otherPhone && phone !== otherPhone) continue;
    return player;
  }
  return null;
}

/** El primero del grupo que ya está. Cada uno se suma para el que sigue. */
export function firstDuplicate(existing, people) {
  const seen = [...(existing || [])];
  for (const person of people || []) {
    const hit = alreadyInMatch(seen, person);
    if (hit) return { person, hit };
    seen.push(person);
  }
  return null;
}

/**
 * Filas del formulario. Vacío → Amigo N, siguiendo el máximo de quien invita.
 * taken: nombres que esa persona ya trajo a este partido.
 * Renombrar "Amigo 1" no reescribe a "Amigo 2": el próximo vacío sigue desde
 * el número más alto que todavía figura.
 */
export function resolveFriendNames(typed, taken = []) {
  let max = 0;
  for (const name of taken || []) max = Math.max(max, guestNumber(name));
  return (typed || []).map((raw) => {
    const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (name) return { name, guestAuto: false };
    max += 1;
    return { name: `Amigo ${max}`, guestAuto: true };
  });
}

/**
 * El que invita entra primero a la lista principal. Los amigos siguen,
 * en el orden en que se escribieron. Lo que no entra va a la espera, en orden.
 * forceWait: el alta ya era a la lista de espera, o el que invita está ahí.
 */
export function placeGroup({ mainCount = 0, capacity = 0, count = 0, forceWait = false } = {}) {
  const spots = Math.max(0, capacity - mainCount);
  const n = Math.max(0, count);
  if (forceWait) return { main: 0, wait: n, spots };
  const main = Math.min(n, spots);
  return { main, wait: n - main, spots };
}

export function waitWarning(spots, waiting) {
  const left = Number(waiting) || 0;
  if (left <= 0) return '';
  const free = Math.max(0, Number(spots) || 0);
  const lugar = free === 1 ? 'Queda 1 lugar' : `Quedan ${free} lugares`;
  const van = left === 1 ? '1 va a quedar en lista de espera' : `${left} van a quedar en lista de espera`;
  return `${lugar}: ${van}`;
}

/**
 * En la lista principal, los amigos quedan justo después de quien los trajo.
 * Si esa persona no está en la misma lista, el amigo sigue en su lugar.
 */
export function groupByInviter(players) {
  const list = [...(players || [])];
  const ids = new Set(list.map((player) => player?.id).filter(Boolean));
  const friends = new Map();
  const roots = [];
  for (const player of list) {
    if (player?.invitedBy && ids.has(player.invitedBy)) {
      const bucket = friends.get(player.invitedBy) || [];
      bucket.push(player);
      friends.set(player.invitedBy, bucket);
    } else roots.push(player);
  }
  const out = [];
  for (const player of roots) {
    out.push(player);
    out.push(...(friends.get(player.id) || []));
  }
  return out;
}
