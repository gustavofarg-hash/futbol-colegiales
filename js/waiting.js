// Lista de espera. El orden es un número waitOrder en el jugador
// (menor = más prioridad). Los que llegan nuevos van al final.

export function sortWaiting(players) {
  return [...(players || [])].sort((a, b) => {
    const ao = orderOf(a);
    const bo = orderOf(b);
    if (ao !== bo) return ao - bo;
    return (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id));
  });
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
export function overflowPatches(players, capacity) {
  const cap = capacity || 14;
  const main = (players || [])
    .filter((p) => p.waiting !== true)
    .sort((a, b) => (a.rosterAt ?? a.createdAt ?? 0) - (b.rosterAt ?? b.createdAt ?? 0) || String(a.id).localeCompare(String(b.id)));
  if (main.length <= cap) return [];
  let order = nextWaitOrder((players || []).filter((p) => p.waiting === true));
  return main.slice(cap).map((p) => ({ id: p.id, waiting: true, waitOrder: order++, rosterAt: null }));
}
