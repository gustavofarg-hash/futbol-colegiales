// Amigos de un jugador y la regla de no anotar dos veces al mismo en un partido.
// Puro: no escribe en Firestore. El id del documento sigue siendo aleatorio
// (los partidos viejos ya están así). La repetición se frena en el cliente.
import { foldText, phoneIdentity } from './roster.js';

export const ALREADY_IN_MATCH = 'Ya está anotado en este partido';
export const GUEST_CANNOT_INVITE = 'Un invitado no puede agregar invitados.';

export function isGuest(player) {
  return !!String(player?.invitedBy || '').trim();
}

/**
 * El jugador principal al final de la cadena. '' si no es invitado,
 * si falta alguien en el medio, o si la cadena se da vuelta.
 */
export function rootInviterId(player, byId) {
  if (!isGuest(player)) return '';
  const seen = new Set();
  let current = player;
  while (isGuest(current) && current?.id && !seen.has(current.id)) {
    seen.add(current.id);
    const host = byId?.get?.(current.invitedBy);
    if (!host) return '';
    if (!isGuest(host)) return String(host.id);
    current = host;
  }
  return '';
}

/** '' si se puede. Si el anfitrión cargado es invitado, no. */
export function inviteBlock(mates, hostId) {
  const id = String(hostId || '').trim();
  if (!id) return '';
  const host = (mates || []).find((player) => player?.id === id);
  if (host && isGuest(host)) return GUEST_CANNOT_INVITE;
  return '';
}

export function normName(value) {
  return foldText(value).replace(/\s+/g, ' ').trim();
}

/** "Invitado 1" o el viejo "Amigo 1". El número es de quien invita, no del partido. */
export function isAutoGuestName(name) {
  return /^(?:amigo|invitado) \d+$/.test(normName(name));
}

function guestNumber(name) {
  const match = normName(name).match(/^(?:amigo|invitado) (\d+)$/);
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
 * "Invitado N" (o "Amigo N") automático no choca con otro igual: es de quien invita.
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
 * Filas del formulario. Vacío → Invitado N, siguiendo el máximo de quien invita.
 * taken: nombres que esa persona ya trajo a este partido.
 * "Amigo N" viejo cuenta para el máximo. Renombrar "Amigo 1" no reescribe
 * a "Amigo 2": el próximo vacío sigue desde el número más alto que figura.
 */
export function resolveFriendNames(typed, taken = []) {
  let max = 0;
  for (const name of taken || []) max = Math.max(max, guestNumber(name));
  return (typed || []).map((raw) => {
    const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
    if (name) return { name, guestAuto: false };
    max += 1;
    return { name: `Invitado ${max}`, guestAuto: true };
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
 * En la lista principal, los invitados quedan justo después del jugador
 * principal (el que no es invitado). Un invitado de un invitado, ya cargado,
 * se muestra con ese mismo principal. Si el principal no está en esta lista,
 * el invitado sigue en su lugar. universe trae el partido entero para
 * recorrer la cadena aunque el del medio esté en la otra lista.
 */
export function groupByInviter(players, universe) {
  const list = [...(players || [])];
  const byId = new Map();
  for (const player of universe || list) if (player?.id) byId.set(player.id, player);
  const ids = new Set(list.map((player) => player?.id).filter(Boolean));
  const friends = new Map();
  const roots = [];
  for (const player of list) {
    const root = rootInviterId(player, byId);
    if (root && ids.has(root)) {
      const bucket = friends.get(root) || [];
      bucket.push(player);
      friends.set(root, bucket);
    } else roots.push(player);
  }
  const out = [];
  for (const player of roots) {
    out.push(player);
    out.push(...(friends.get(player.id) || []));
  }
  return out;
}
