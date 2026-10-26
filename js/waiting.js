// Lista de espera. El orden es un número waitOrder en el jugador
// (menor = más prioridad). Los que llegan nuevos van al final.

/** Milisegundos de entrada. Acepta número, Timestamp.toMillis o {seconds, nanoseconds}. */
export function entryMillis(player) {
  const raw = player?.rosterAt ?? player?.createdAt;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (raw && typeof raw.toMillis === 'function') {
    const n = Number(raw.toMillis());
    return Number.isFinite(n) ? n : null;
  }
  if (raw && typeof raw.seconds === 'number' && Number.isFinite(raw.seconds)) {
    const nanos = typeof raw.nanoseconds === 'number' && Number.isFinite(raw.nanoseconds) ? raw.nanoseconds : 0;
    return raw.seconds * 1000 + Math.floor(nanos / 1e6);
  }
  return null;
}

function compareEntry(a, b) {
  const am = entryMillis(a);
  const bm = entryMillis(b);
  if (am == null && bm == null) return String(a?.id).localeCompare(String(b?.id));
  if (am == null) return 1;
  if (bm == null) return -1;
  return am - bm || String(a?.id).localeCompare(String(b?.id));
}

export function sortWaiting(players) {
  return [...(players || [])].sort((a, b) => {
    const ao = orderOf(a);
    const bo = orderOf(b);
    if (ao !== bo) return ao - bo;
    return compareEntry(a, b);
  });
}

/** Titulares y espera según el dato guardado. No recorta por cupo. */
export function rosterSplit(players) {
  const main = [];
  const waiting = [];
  for (const player of players || []) {
    if (player?.waiting === true) waiting.push(player);
    else main.push(player);
  }
  main.sort(compareEntry);
  return { main, waiting: sortWaiting(waiting) };
}

function orderOf(p) {
  const n = Number(p?.waitOrder);
  return Number.isFinite(n) ? n : Number.MAX_SAFE_INTEGER;
}

/** Siguiente puesto: al final, en orden de llegada. */
export function nextWaitOrder(waiting) {
  let max = 0;
  for (const p of waiting || []) {
    const n = Number(p.waitOrder);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/**
 * Mueve un jugador una posición (-1 arriba, +1 abajo) y reescribe
 * waitOrder como 1..n. [] si no se puede mover (primero/último).
 */
export function moveWaiting(players, id, dir) {
  const list = sortWaiting(players);
  const i = list.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return [];
  const next = list.slice();
  const [row] = next.splice(i, 1);
  next.splice(j, 0, row);
  return next.map((p, idx) => ({ id: p.id, waitOrder: idx + 1 }));
}

/**
 * Si hay más titulares que el cupo (dos altas a la vez), los que sobran
 * —los últimos en entrar— pasan al final de la espera.
 */
export function overflowPatches(players, capacity, opts = {}) {
  const list = players || [];
  if (opts.expectedCount != null && opts.expectedCount !== list.length) return [];
  const cap = Number(capacity);
  if (!Number.isInteger(cap) || cap <= 0) return [];
  const main = list.filter((p) => p.waiting !== true).sort(compareEntry);
  if (main.some((p) => entryMillis(p) == null)) return [];
  if (main.length <= cap) return [];
  let order = nextWaitOrder(list.filter((p) => p.waiting === true));
  return main.slice(cap).map((p) => ({ id: p.id, waiting: true, waitOrder: order++, rosterAt: null }));
}
