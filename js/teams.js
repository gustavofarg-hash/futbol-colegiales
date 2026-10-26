// Equipos de un partido. Puro: la app y las pruebas lo usan sin Firestore.
// bib = con pechera, plain = sin pechera. La lista de espera no entra.

export function emptyTeams() {
  return { bib: [], plain: [] };
}

function asIds(list) {
  const out = [];
  for (const raw of list || []) {
    const id = String(raw || '').trim();
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * Deja solo ids de la lista principal, sin repetidos.
 * Si mainIds es null, no filtra por pertenencia (solo limpia la forma).
 */
export function normalizeTeams(raw, mainIds = null) {
  const allow = mainIds ? new Set(mainIds.map((id) => String(id))) : null;
  const bib = [];
  const seen = new Set();
  for (const id of asIds(raw?.bib)) {
    if (seen.has(id) || (allow && !allow.has(id))) continue;
    seen.add(id);
    bib.push(id);
  }
  const plain = [];
  for (const id of asIds(raw?.plain)) {
    if (seen.has(id) || (allow && !allow.has(id))) continue;
    seen.add(id);
    plain.push(id);
  }
  return { bib, plain };
}

export function teamsRecord(raw) {
  const teams = normalizeTeams(raw, null);
  if (teams.bib.length > 40 || teams.plain.length > 40) return { ok: false, error: 'Demasiados jugadores en un equipo.' };
  if ([...teams.bib, ...teams.plain].some((id) => id.length > 80)) return { ok: false, error: 'Jugador inválido.' };
  return { ok: true, teams };
}

export function teamsBalance(teams) {
  const bib = teams?.bib?.length || 0;
  const plain = teams?.plain?.length || 0;
  return { bib, plain, balanced: bib === plain };
}

function clampScore(n) {
  const x = Number(n);
  if (!Number.isInteger(x) || x < 0) return 0;
  return Math.min(999, x);
}

/** Marcador del partido. No sale de los goles de cada jugador. */
export function normalizeScore(raw) {
  return { bib: clampScore(raw?.bib), plain: clampScore(raw?.plain) };
}

export function scoreRecord(raw) {
  return { ok: true, score: normalizeScore(raw) };
}

export function bumpScore(score, side, delta) {
  const base = normalizeScore(score);
  const key = side === 'plain' ? 'plain' : 'bib';
  const step = Number(delta);
  return { ...base, [key]: clampScore(base[key] + (Number.isInteger(step) ? step : 0)) };
}

function clampGoals(n) {
  const x = Number(n);
  if (!Number.isInteger(x) || x < 0) return 0;
  return Math.min(99, x);
}

/** Goles de un jugador. No mueven el marcador del partido. */
export function bumpGoals(current, delta) {
  const step = Number(delta);
  return clampGoals(clampGoals(current) + (Number.isInteger(step) ? step : 0));
}

/** Saca a quien se bajó. changed es false si no estaba en ningún equipo. */
export function dropPlayer(teams, playerId) {
  if (!teams || typeof teams !== 'object') return { changed: false, teams: null };
  const id = String(playerId || '');
  const next = normalizeTeams(teams, null);
  const bib = next.bib.filter((item) => item !== id);
  const plain = next.plain.filter((item) => item !== id);
  const changed = bib.length !== next.bib.length || plain.length !== next.plain.length;
  return { changed, teams: { bib, plain } };
}

/**
 * Mueve a un lado, o lo devuelve a sin asignar.
 * side: 'bib' | 'plain' | 'none'. Si el lado está lleno, no cambia.
 */
export function movePlayer(teams, playerId, side, allowedIds, cap) {
  const allow = (allowedIds || []).map((id) => String(id));
  const base = normalizeTeams(teams, allow);
  const id = String(playerId || '');
  if (!allow.includes(id)) return { ok: false, reason: 'fuera', teams: base };
  const without = {
    bib: base.bib.filter((item) => item !== id),
    plain: base.plain.filter((item) => item !== id),
  };
  if (side === 'none' || side === 'unassigned') return { ok: true, teams: without };
  const target = side === 'plain' ? 'plain' : 'bib';
  const limit = Number(cap);
  if (Number.isInteger(limit) && limit > 0 && without[target].length >= limit) {
    return { ok: false, reason: 'full', side: target, teams: base };
  }
  return { ok: true, teams: { bib: without.bib, plain: without.plain, [target]: [...without[target], id] } };
}
export function cyclePlayer(teams, playerId, allowedIds) {
  const allow = (allowedIds || []).map((id) => String(id));
  const base = normalizeTeams(teams, allow);
  const id = String(playerId || '');
  if (!allow.includes(id)) return base;
  if (base.bib.includes(id)) return { bib: base.bib.filter((item) => item !== id), plain: [...base.plain, id] };
  if (base.plain.includes(id)) return { bib: base.bib, plain: base.plain.filter((item) => item !== id) };
  return { bib: [...base.bib, id], plain: base.plain };
}

/** Reparte al azar, lo más parejo posible. El sobrante queda con pechera. */
export function shuffleTeams(playerIds, rng = Math.random) {
  const ids = asIds(playerIds);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = ids[i];
    ids[i] = ids[j];
    ids[j] = swap;
  }
  const mid = Math.ceil(ids.length / 2);
  return { bib: ids.slice(0, mid), plain: ids.slice(mid) };
}

export function teamsMessage({ when = '', venue = '', players = [], teams = emptyTeams(), score = null } = {}) {
  const nameOf = (id) => (players || []).find((player) => player.id === id)?.name || 'Jugador';
  const block = (title, ids) => {
    const lines = [`${title} (${ids.length})`];
    if (!ids.length) lines.push('—');
    else ids.forEach((id, i) => lines.push(`${i + 1}. ${nameOf(id)}`));
    return lines;
  };
  const board = score ? [`Marcador: Con pechera ${score.bib} – Sin pechera ${score.plain}`] : [];
  return [
    `⚽ Equipos · ${venue}`,
    when,
    ...board,
    '',
    ...block('Con pechera', teams.bib || []),
    '',
    ...block('Sin pechera', teams.plain || []),
  ].join('\n');
}
