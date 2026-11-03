// Equipos de un partido. Puro: la app y las pruebas lo usan sin Firestore.
// bib = con pechera, plain = sin pechera. La lista de espera no entra.
import { POSITIONS, storedLevel } from './profile.js';

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

function playersById(players) {
  const map = new Map();
  if (players instanceof Map) {
    for (const [key, value] of players) map.set(String(key), value);
    return map;
  }
  for (const player of players || []) {
    if (player && player.id != null) map.set(String(player.id), player);
  }
  return map;
}

function goalStamp(player) {
  const at = Number(player?.inGoalAt);
  return Number.isFinite(at) ? at : null;
}

/**
 * Los que ya fueron al arco van primero, del más antiguo al más reciente.
 * Sin hora (marcado antes de guardar inGoalAt) queda arriba de los que sí tienen.
 * El resto conserva el orden de la lista.
 */
export function orderByGoal(ids, players) {
  const map = playersById(players);
  const goal = [];
  const rest = [];
  (ids || []).forEach((id, index) => {
    const key = String(id || '').trim();
    if (!key) return;
    const player = map.get(key);
    if (player?.inGoal === true) goal.push({ id: key, index, at: goalStamp(player) });
    else rest.push(key);
  });
  goal.sort((a, b) => {
    if (a.at == null && b.at == null) return a.index - b.index;
    if (a.at == null) return -1;
    if (b.at == null) return 1;
    return a.at - b.at || a.index - b.index;
  });
  return [...goal.map((row) => row.id), ...rest];
}

export function orderTeamsByGoal(teams, players) {
  const base = normalizeTeams(teams, null);
  return {
    bib: orderByGoal(base.bib, players),
    plain: orderByGoal(base.plain, players),
  };
}

/** Hora del próximo que marca el arco. Si dos clics caen en el mismo ms, el segundo va después. */
export function nextInGoalAt(players, now = Date.now()) {
  let at = Number(now);
  if (!Number.isFinite(at)) at = Date.now();
  for (const player of players || []) {
    if (player?.inGoal !== true) continue;
    const stamp = goalStamp(player);
    if (stamp != null && stamp >= at) at = stamp + 1;
  }
  return at;
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

const POS_AT = { Arquero: 0, Defensa: 1, Mediocampo: 2, Ataque: 3 };

function levelOf(player) {
  if (!player || typeof player !== 'object') return DEFAULT_LEVEL;
  const level = storedLevel(player.level);
  return level == null ? DEFAULT_LEVEL : level;
}

/** Solo las cuatro posiciones de la ficha. Una cadena que no está ahí no cuenta. */
function positionsOf(player) {
  const raw = player && typeof player === 'object' && Array.isArray(player.positions) ? player.positions : [];
  const out = [];
  for (const item of raw) {
    if (POSITIONS.includes(item) && !out.includes(item)) out.push(item);
  }
  return out;
}

function packDiff(diff, offset, base) {
  return (((diff[0] + offset) * base + (diff[1] + offset)) * base + (diff[2] + offset)) * base + (diff[3] + offset);
}

function unpackDiff(key, diff, offset, base) {
  for (let i = 3; i >= 0; i--) {
    const shifted = Math.floor(key / base);
    diff[i] = (key - shifted * base) - offset;
    key = shifted;
  }
}

/**
 * Qué tan desparejas quedan las posiciones si cada jugador cuenta
 * como la que más empareja. Sin posiciones, o con las cuatro, entra en cualquiera.
 * Si varios puestos empatan, el número no cambia.
 */
function positionImbalance(teams) {
  const diff = [0, 0, 0, 0];
  const flex = [];
  let restricted = false;
  for (const side of ['bib', 'plain']) {
    const sign = side === 'bib' ? 1 : -1;
    for (const row of teams[side]) {
      const options = row.positions.length ? row.positions : POSITIONS;
      if (options.length === 1) {
        diff[POS_AT[options[0]]] += sign;
        restricted = true;
      } else {
        let mask = 0;
        for (const name of options) mask |= 1 << POS_AT[name];
        if (options.length < POSITIONS.length) restricted = true;
        flex.push({ sign, mask });
      }
    }
  }
  if (!restricted) return Math.abs(teams.bib.length - teams.plain.length);
  if (!flex.length) return Math.abs(diff[0]) + Math.abs(diff[1]) + Math.abs(diff[2]) + Math.abs(diff[3]);
  const n = teams.bib.length + teams.plain.length;
  const offset = n;
  const base = n * 2 + 1;
  let states = new Map([[packDiff(diff, offset, base), 0]]);
  const scratch = [0, 0, 0, 0];
  for (const player of flex) {
    const next = new Map();
    for (const key of states.keys()) {
      unpackDiff(key, scratch, offset, base);
      for (let bit = 0; bit < 4; bit++) {
        if ((player.mask & (1 << bit)) === 0) continue;
        scratch[bit] += player.sign;
        next.set(packDiff(scratch, offset, base), 0);
        scratch[bit] -= player.sign;
      }
    }
    states = next;
  }
  let best = n * 4;
  for (const key of states.keys()) {
    unpackDiff(key, scratch, offset, base);
    const score = Math.abs(scratch[0]) + Math.abs(scratch[1]) + Math.abs(scratch[2]) + Math.abs(scratch[3]);
    if (score < best) best = score;
  }
  return best;
}

function keepersApart(teams, keeperRows) {
  const side = (row) => (teams.bib.includes(row) ? 'bib' : teams.plain.includes(row) ? 'plain' : null);
  const left = side(keeperRows[0]);
  const right = side(keeperRows[1]);
  return !!(left && right && left !== right);
}

function levelGap(teams) {
  const sum = (list) => list.reduce((total, row) => total + row.level, 0);
  return Math.abs(sum(teams.bib) - sum(teams.plain));
}

/** Cupo de cada lado para que las cantidades queden iguales, o con uno de más si son impares. */
function evenRoom(n, cap) {
  const half = Math.floor(n / 2);
  const per = Math.min(cap, half);
  const extra = n % 2 === 1 && cap > per ? 1 : 0;
  return per + extra;
}

/**
 * Formas de dejar a los dos arqueros exclusivos en lados distintos
 * sin cambiar cuántos juegan de cada lado. Si ya están separados, una sola.
 */
function keeperOptions(teams, keeperRows) {
  if (keeperRows.length !== 2 || keepersApart(teams, keeperRows)) return [teams];
  const [k1, k2] = keeperRows;
  const sideOf = (row, base) => (base.bib.includes(row) ? 'bib' : base.plain.includes(row) ? 'plain' : null);
  const other = (side) => (side === 'bib' ? 'plain' : 'bib');
  const swapWith = (base, row, partner) => {
    const swap = (list) => list.map((item) => (item === row ? partner : item === partner ? row : item));
    return { bib: swap(base.bib), plain: swap(base.plain) };
  };
  const replaceWith = (base, row, partner) => {
    const put = (list) => list.map((item) => (item === partner ? row : item));
    return { bib: put(base.bib), plain: put(base.plain) };
  };
  const s1 = sideOf(k1, teams);
  const s2 = sideOf(k2, teams);
  const options = [];
  if (s1 && s2) {
    const dest = other(s1);
    for (const moving of [k1, k2]) {
      for (const partner of teams[dest]) {
        if (!partner.keeper) options.push(swapWith(teams, moving, partner));
      }
    }
  } else if (s1 || s2) {
    const placed = s1 ? k1 : k2;
    const missing = placed === k1 ? k2 : k1;
    const dest = other(sideOf(placed, teams));
    for (const partner of teams[dest]) {
      if (!partner.keeper) options.push(replaceWith(teams, missing, partner));
    }
  } else {
    for (const partnerA of teams.bib) {
      if (partnerA.keeper) continue;
      const withA = replaceWith(teams, k1, partnerA);
      for (const partnerB of withA.plain) {
        if (!partnerB.keeper) options.push(replaceWith(withA, k2, partnerB));
      }
    }
  }
  const apart = options.filter((next) => keepersApart(next, keeperRows));
  return apart.length ? apart : [teams];
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

/**
 * Arma dos equipos con la suma de niveles lo más pareja posible.
 * Quien no tiene nivel vale 5. Los dos lados quedan con la misma cantidad
 * (si son impares, uno de más). Ningún lado pasa de cap.
 * Una diferencia de hasta 1 punto de nivel cuenta como empate: ahí gana
 * el mejor reparto de posiciones. Si empatan también las posiciones, queda
 * la diferencia de nivel más chica y, si sigue el empate, la primera.
 * Si hay justo dos jugadores que solo son Arquero, van a equipos distintos
 * aunque los niveles queden peor.
 */
export function balanceTeams(players, opts = {}) {
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const rows = (players || []).map((player, index) => {
    const positions = positionsOf(player);
    return {
      id: String(player?.id ?? player ?? '').trim(),
      level: levelOf(player),
      positions,
      keeper: positions.length === 1 && positions[0] === 'Arquero',
      index,
    };
  }).filter((row) => row.id);
  const asked = Number(opts.cap);
  const cap = Number.isInteger(asked) && asked > 0 ? asked : Math.max(1, Math.ceil(rows.length / 2));
  if (!rows.length) return { bib: [], plain: [] };
  const keeperRows = rows.filter((row) => row.keeper);
  const forceKeepers = keeperRows.length === 2;
  const roomCap = evenRoom(rows.length, cap);
  const spreadCache = new Map();
  const spreadOf = (teams) => {
    const key = `${teams.bib.map((row) => row.id).slice().sort().join(',')}|${teams.plain.map((row) => row.id).slice().sort().join(',')}`;
    if (spreadCache.has(key)) return spreadCache.get(key);
    const value = positionImbalance(teams);
    spreadCache.set(key, value);
    return value;
  };
  const made = [];
  const push = (teams) => {
    const options = forceKeepers ? keeperOptions(teams, keeperRows) : [teams];
    for (const next of options) made.push(next);
  };
  const ranked = rows.slice().sort((a, b) => b.level - a.level || a.index - b.index);
  const snake = ({ index, room }) => {
    const block = Math.floor(index / 2);
    const first = index % 2 === 0;
    const side = (block % 2 === 0 ? first : !first) ? 'bib' : 'plain';
    return room(side) ? side : (side === 'bib' ? 'plain' : 'bib');
  };
  const greedy = ({ row, bib, plain, sumBib, sumPlain, room }) => {
    if (!room('plain')) return 'bib';
    if (!room('bib')) return 'plain';
    const toBib = Math.abs((sumBib + row.level) - sumPlain);
    const toPlain = Math.abs(sumBib - (sumPlain + row.level));
    if (toBib < toPlain) return 'bib';
    if (toPlain < toBib) return 'plain';
    if (bib.length !== plain.length) return bib.length < plain.length ? 'bib' : 'plain';
    return rng() < 0.5 ? 'bib' : 'plain';
  };
  push(placeRows(ranked, roomCap, snake));
  const trials = Math.min(200, Math.max(24, rows.length * 12));
  for (let trial = 0; trial < trials; trial++) push(placeRows(shuffleRows(rows, rng), roomCap, greedy));
  let bestGap = Infinity;
  for (const teams of made) {
    if (forceKeepers && !keepersApart(teams, keeperRows)) continue;
    const gap = levelGap(teams);
    if (gap < bestGap) bestGap = gap;
  }
  let chosen = null;
  let chosenGap = Infinity;
  let chosenSpread = Infinity;
  for (const teams of made) {
    if (forceKeepers && !keepersApart(teams, keeperRows)) continue;
    const gap = levelGap(teams);
    if (gap > bestGap + 1 + 1e-9) continue;
    const spread = spreadOf(teams);
    const betterSpread = !chosen || spread < chosenSpread - 1e-9;
    const sameSpreadBetterGap = chosen && Math.abs(spread - chosenSpread) <= 1e-9 && gap < chosenGap - 1e-9;
    if (betterSpread || sameSpreadBetterGap) {
      chosen = teams;
      chosenGap = gap;
      chosenSpread = spread;
    }
  }
  const best = chosen || made[0];
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
