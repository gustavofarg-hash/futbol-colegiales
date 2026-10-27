// Equipos de un partido. Puro: la app y las pruebas lo usan sin Firestore.
// bib = con pechera, plain = sin pechera. La lista de espera no entra.
import { storedLevel } from './profile.js';

const DEFAULT_LEVEL = 5;

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

/** Texto del marcador. Vacío si el partido todavía no tiene uno. */
export function scoreLine(score) {
  if (!score || typeof score !== 'object') return '';
  const s = normalizeScore(score);
  return `Con pechera ${s.bib} – ${s.plain} Sin pechera`;
}

export function goaliesLeft(playerIds, flaggedIds) {
  const done = new Set((flaggedIds || []).map((id) => String(id)));
  return (playerIds || []).filter((id) => !done.has(String(id))).length;
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

function levelOf(player) {
  if (!player || typeof player !== 'object') return DEFAULT_LEVEL;
  const level = storedLevel(player.level);
  return level == null ? DEFAULT_LEVEL : level;
}

function shuffleRows(list, rng) {
  const next = list.slice();
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const swap = next[i];
    next[i] = next[j];
    next[j] = swap;
  }
  return next;
}

function placeRows(rows, cap, choose) {
  const bib = [];
  const plain = [];
  let sumBib = 0;
  let sumPlain = 0;
  rows.forEach((row, index) => {
    const room = (side) => (side === 'bib' ? bib : plain).length < cap;
    let side = choose({ row, index, bib, plain, sumBib, sumPlain, room, });
    if (!room(side)) side = side === 'bib' ? 'plain' : 'bib';
    if (!room(side)) return;
    if (side === 'bib') { bib.push(row); sumBib += row.level; }
    else { plain.push(row); sumPlain += row.level; }
  });
  return { bib, plain };
}

function teamScore(teams) {
  const sum = (list) => list.reduce((total, row) => total + row.level, 0);
  const diff = Math.abs(sum(teams.bib) - sum(teams.plain));
  const countDiff = Math.abs(teams.bib.length - teams.plain.length);
  const assigned = teams.bib.length + teams.plain.length;
  return diff * 1000 + countDiff * 10 - assigned * 0.01;
}

/**
 * Arma dos equipos con la suma de niveles lo más pareja posible.
 * Quien no tiene nivel vale 5. Ningún lado pasa de cap.
 */
export function balanceTeams(players, opts = {}) {
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const rows = (players || []).map((player, index) => ({
    id: String(player?.id ?? player ?? '').trim(),
    level: levelOf(player),
    index,
  })).filter((row) => row.id);
  const asked = Number(opts.cap);
  const cap = Number.isInteger(asked) && asked > 0 ? asked : Math.max(1, Math.ceil(rows.length / 2));
  if (!rows.length) return { bib: [], plain: [] };
  const ranked = rows.slice().sort((a, b) => b.level - a.level || a.index - b.index);
  let best = placeRows(ranked, cap, ({ index, room }) => {
    const block = Math.floor(index / 2);
    const first = index % 2 === 0;
    const side = (block % 2 === 0 ? first : !first) ? 'bib' : 'plain';
    return room(side) ? side : (side === 'bib' ? 'plain' : 'bib');
  });
  let bestScore = teamScore(best);
  const trials = Math.min(200, Math.max(24, rows.length * 12));
  for (let trial = 0; trial < trials; trial++) {
    const next = placeRows(shuffleRows(rows, rng), cap, ({ row, bib, plain, sumBib, sumPlain, room }) => {
      if (!room('plain')) return 'bib';
      if (!room('bib')) return 'plain';
      const toBib = Math.abs((sumBib + row.level) - sumPlain);
      const toPlain = Math.abs(sumBib - (sumPlain + row.level));
      if (toBib < toPlain) return 'bib';
      if (toPlain < toBib) return 'plain';
      if (bib.length !== plain.length) return bib.length < plain.length ? 'bib' : 'plain';
      return rng() < 0.5 ? 'bib' : 'plain';
    });
    const score = teamScore(next);
    if (score < bestScore - 1e-9) {
      best = next;
      bestScore = score;
    }
  }
  return { bib: best.bib.map((row) => row.id), plain: best.plain.map((row) => row.id) };
}

/**
 * Soltar un jugador. Si targetId es otro jugador, intercambian el lugar.
 * Si no, lo mueve a side (index del casillero, o al final).
 */
export function dropPlayerOn(teams, playerId, opts = {}) {
  const allow = (opts.allowedIds || []).map((id) => String(id));
  const base = normalizeTeams(teams, allow);
  const id = String(playerId || '');
  if (!allow.includes(id)) return { ok: false, reason: 'fuera', teams: base };
  const targetId = String(opts.targetId || '');
  if (targetId && targetId !== id) {
    if (!allow.includes(targetId)) return { ok: false, reason: 'fuera', teams: base };
    const next = { bib: [...base.bib], plain: [...base.plain] };
    const at = (pid) => {
      if (next.bib.includes(pid)) return { side: 'bib', index: next.bib.indexOf(pid) };
      if (next.plain.includes(pid)) return { side: 'plain', index: next.plain.indexOf(pid) };
      return { side: 'none', index: -1 };
    };
    const from = at(id);
    const to = at(targetId);
    if (from.side === 'none' && to.side === 'none') return { ok: true, teams: base };
    if (from.side !== 'none' && to.side !== 'none' && from.side === to.side) {
      const list = next[from.side];
      const left = list.indexOf(id);
      const right = list.indexOf(targetId);
      list[left] = targetId;
      list[right] = id;
      return { ok: true, teams: next };
    }
    if (from.side !== 'none' && to.side !== 'none') {
      next[from.side][from.index] = targetId;
      next[to.side][to.index] = id;
      return { ok: true, teams: next };
    }
    if (from.side === 'none') {
      next[to.side][to.index] = id;
      return { ok: true, teams: next };
    }
    next[from.side][from.index] = targetId;
    return { ok: true, teams: next };
  }
  const side = opts.side === 'plain' ? 'plain' : (opts.side === 'none' || opts.side === 'unassigned' ? 'none' : 'bib');
  const without = {
    bib: base.bib.filter((item) => item !== id),
    plain: base.plain.filter((item) => item !== id),
  };
  if (side === 'none') return { ok: true, teams: without };
  const already = (side === 'bib' ? base.bib : base.plain).includes(id);
  const limit = Number(opts.cap);
  if (!already && Number.isInteger(limit) && limit > 0 && without[side].length >= limit) {
    return { ok: false, reason: 'full', side, teams: base };
  }
  const list = without[side].slice();
  let index = Number.isInteger(opts.index) ? opts.index : list.length;
  if (index < 0) index = 0;
  if (index > list.length) index = list.length;
  list.splice(index, 0, id);
  return { ok: true, teams: { ...without, [side]: list } };
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
