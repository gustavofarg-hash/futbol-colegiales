// Totales para la pestaña Estadísticas. Puro: no lee Firebase.
// Un partido cancelado no suma plata ni cupo. La espera no debe.
import { monthKeyOf, monthLabel } from './ledger.js';
import { UNSPECIFIED } from './organizers.js';
import { isFreePlay, paymentParts, paymentShares, roundARS } from './payments.js';
import { priceOfMatch, promoForPlayer } from './prices.js';
import { personKey } from './roster.js';

const METHOD_LABEL = {
  cash: 'Efectivo',
  transfer: 'Transferencia',
  credit: 'Crédito',
  received: 'Cobrado',
  pending: 'Transfiere después',
};

function organizerName(name) {
  const text = String(name || '').trim();
  return text || UNSPECIFIED;
}

function priceDue(player, { players, matches, prices }) {
  if (!player || player.waiting === true || isFreePlay(player)) return 0;
  const match = (matches || []).find((item) => item.id === player.matchId);
  if (!match || match.cancelled === true) return 0;
  const promo = promoForPlayer({ player, players, matches, prices });
  const due = promo ? Number(promo.share) : priceOfMatch(match, prices);
  return Number.isFinite(due) ? due : 0;
}

function bump(map, key, amount) {
  map.set(key, roundARS((map.get(key) || 0) + amount));
}

function methodRows(map) {
  const order = ['cash', 'transfer', 'credit', 'received', 'pending'];
  return [...map.entries()]
    .map(([kind, amount]) => ({ kind, label: METHOD_LABEL[kind] || kind, amount }))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || b.amount - a.amount);
}

function organizerRows(map) {
  return [...map.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, 'es'));
}

/** Goles cargados en esas filas. tracked es false si nadie tiene el campo. */
export function countedGoals(players) {
  let goals = 0;
  let tracked = false;
  for (const player of players || []) {
    if (!Number.isInteger(player?.goals)) continue;
    tracked = true;
    if (player.goals > 0) goals += player.goals;
  }
  return { tracked, goals };
}

/**
 * Un partido: quién estuvo, cuánto correspondía y cuánto se cobró.
 * expected es el precio (o la parte de la promo). collected no incluye
 * «Transfiere después».
 */
export function matchTake({ match, players, matches, prices } = {}) {
  const rows = (players || []).filter((player) => player && match?.id && player.matchId === match.id);
  const keys = new Set();
  let main = 0;
  let waiting = 0;
  let noShows = 0;
  let expected = 0;
  let collected = 0;
  let pending = 0;
  const byMethod = new Map();
  const byOrganizer = new Map();
  const all = matches || (match ? [match] : []);
  for (const player of rows) {
    const key = personKey(player, players) || (player.id ? `id:${player.id}` : '');
    if (key) keys.add(key);
    if (player.waiting === true) waiting += 1;
    else if (player.noPlay !== true) main += 1;
    if (player.confirmed === 'no') noShows += 1;
    if (match?.cancelled === true) continue;
    expected = roundARS(expected + priceDue(player, { players, matches: all, prices }));
    const parts = paymentParts(player);
    collected = roundARS(collected + parts.received);
    pending = roundARS(pending + parts.pending);
    for (const share of paymentShares(player)) {
      if (!(share.amount > 0)) continue;
      bump(byMethod, share.kind, share.amount);
      if (share.kind !== 'pending') bump(byOrganizer, organizerName(share.name), share.amount);
    }
  }
  const goals = countedGoals(rows);
  return {
    main,
    waiting,
    noShows,
    goals: goals.goals,
    goalsTracked: goals.tracked,
    players: keys.size,
    playerKeys: [...keys],
    expected,
    collected,
    pending,
    byMethod: methodRows(byMethod),
    byOrganizer: organizerRows(byOrganizer),
  };
}

function emptyPeriod(key, grain) {
  return {
    key,
    label: grain === 'year' ? String(key) : monthLabel(key),
    matches: 0,
    cancelled: 0,
    playerKeys: new Set(),
    expected: 0,
    collected: 0,
    pending: 0,
    byMethod: new Map(),
    byOrganizer: new Map(),
  };
}

/**
 * Mes o año: cantidad de partidos, jugadores distintos y plata cobrada
 * por organizador y por medio. Los cancelados se cuentan aparte y no suman plata.
 */
export function periodBuckets({ matches, players, prices, grain = 'month' } = {}) {
  const buckets = new Map();
  const all = matches || [];
  for (const match of all) {
    if (!match?.id || !/^\d{4}-\d{2}-\d{2}$/.test(match.date || '')) continue;
    const key = grain === 'year' ? match.date.slice(0, 4) : monthKeyOf(match.date);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, emptyPeriod(key, grain));
    const bucket = buckets.get(key);
    if (match.cancelled === true) {
      bucket.cancelled += 1;
      continue;
    }
    bucket.matches += 1;
    const take = matchTake({ match, players, matches: all, prices });
    for (const item of take.playerKeys) bucket.playerKeys.add(item);
    bucket.expected = roundARS(bucket.expected + take.expected);
    bucket.collected = roundARS(bucket.collected + take.collected);
    bucket.pending = roundARS(bucket.pending + take.pending);
    for (const row of take.byMethod) bump(bucket.byMethod, row.kind, row.amount);
    for (const row of take.byOrganizer) bump(bucket.byOrganizer, row.name, row.amount);
  }
  return [...buckets.values()]
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      matches: bucket.matches,
      cancelled: bucket.cancelled,
      players: bucket.playerKeys.size,
      expected: bucket.expected,
      collected: bucket.collected,
      pending: bucket.pending,
      byMethod: methodRows(bucket.byMethod),
      byOrganizer: organizerRows(bucket.byOrganizer),
    }));
}
