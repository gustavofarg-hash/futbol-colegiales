// Totales para la pestaña Estadísticas. Puro: no lee Firebase.
// Un partido cancelado no suma plata ni cupo. La espera no debe.
import { dayCompensation, matchAdders, matchCompensation } from './compensate.js';
import { monthKeyOf, monthLabel } from './ledger.js';
import { sameOrganizer, UNSPECIFIED } from './organizers.js';
import { isFreePlay, paymentParts, paymentShares, roundARS } from './payments.js';
import { priceOfMatch, promoForPlayer } from './prices.js';
import { matchAlreadyPlayed } from './profile.js';
import { personKey, playerMatchesPerson } from './roster.js';

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

/**
 * La misma ficha, pero la plata es solo la de quien está logueado:
 * lo que le pagaron y lo que correspondía a quienes se anotaron con él.
 * No arma el desglose por organizador.
 */
export function organizerViewTake({ match, players, matches, prices, who } = {}) {
  const take = matchTake({ match, players, matches, prices });
  const name = String(who?.name || '').trim();
  const uid = String(who?.uid || '').trim();
  if (!name && !uid) return { ...take, byOrganizer: [] };
  const rows = (players || []).filter((player) => player && match?.id && player.matchId === match.id);
  const all = matches || (match ? [match] : []);
  let expected = 0;
  let collected = 0;
  let pending = 0;
  const byMethod = new Map();
  if (match?.cancelled !== true) {
    for (const player of rows) {
      const signed = signupOrganizerUid(player);
      const mineSignup = (uid && signed === uid) || (!signed && name && sameOrganizer(player.addedBy, name));
      if (mineSignup) expected = roundARS(expected + priceDue(player, { players, matches: all, prices }));
      for (const share of paymentShares(player)) {
        if (!(share.amount > 0) || !sameOrganizer(share.name, name)) continue;
        if (share.kind === 'pending') pending = roundARS(pending + share.amount);
        else {
          collected = roundARS(collected + share.amount);
          bump(byMethod, share.kind, share.amount);
        }
      }
    }
  }
  return {
    ...take,
    expected,
    collected,
    pending,
    byMethod: methodRows(byMethod),
    byOrganizer: [],
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
export function periodBuckets({ matches, players, prices, grain = 'month', who, staff } = {}) {
  const person = who && typeof who === 'object' ? who : null;
  const buckets = new Map();
  const source = matches || [];
  const visible = person ? source.filter((match) => matchOrganizedBy(match, staff, person)) : source;
  for (const match of visible) {
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
    const take = person
      ? organizerViewTake({ match, players, matches: source, prices, who: person })
      : matchTake({ match, players, matches: source, prices });
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

function isThisOrganizer(person, who) {
  if (!person) return false;
  const id = String(who?.uid || '').trim();
  const name = String(who?.name || '').trim();
  if (id && person.uid === id) return true;
  return !!name && sameOrganizer(person.name, name);
}

function activeDayMatches(matches) {
  return (matches || []).filter((match) => match && match.cancelled !== true);
}

/** Esta persona organiza el partido: puede anotar, igual que en la compensación. */
export function matchOrganizedBy(match, staff, who) {
  const person = who && typeof who === 'object' ? who : { uid: '', name: '' };
  return matchAdders(match, staff).some((adder) => isThisOrganizer(adder, person));
}

/** Organizadores del día: quienes pueden anotar en algún partido activo. */
function dayOrganizers(matches, staff) {
  const map = new Map();
  for (const match of activeDayMatches(matches)) {
    for (const person of matchAdders(match, staff)) {
      if (person?.uid) map.set(person.uid, person);
    }
  }
  return [...map.values()];
}

/** Lo cobrado del día, el total que usa el cálculo (incluye pendiente). */
function dayCollected(matches, players, staff) {
  let total = 0;
  for (const match of activeDayMatches(matches)) {
    total = roundARS(total + matchCompensation(match, players, staff).total);
  }
  return total;
}

/**
 * Lo que le corresponde a esta persona en el día.
 * Un solo organizador: todo lo cobrado.
 * Más de uno: su fila de dayCompensation («le corresponden»),
 * según el modo de cada partido (partes iguales o lo que anotó).
 * No es la suma de lo que cobraron todos.
 */
export function organizerDayShare({ matches, players, staff, uid, name, who } = {}) {
  const person = who && typeof who === 'object' ? who : { uid: uid || '', name: name || '' };
  const organizers = dayOrganizers(matches, staff);
  if (organizers.length <= 1) {
    const only = organizers[0];
    if (!isThisOrganizer(only, person)) return 0;
    return dayCollected(matches, players, staff);
  }
  const calc = dayCompensation(matches || [], players, staff);
  const id = String(person.uid || '').trim();
  const row = (id && calc.rows.find((item) => item.uid === id))
    || calc.rows.find((item) => isThisOrganizer(item, person))
    || null;
  return roundARS(row?.entitled || 0);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Fechas con un documento de compensación. El partido terminado, solo, no alcanza. */
export function compensationDoneDates(compensations) {
  const dates = new Set();
  for (const row of compensations || []) {
    const date = String(row?.date || row?.id || '');
    if (ISO_DAY.test(date)) dates.add(date);
  }
  return dates;
}

/**
 * Día: del 1 de este mes hasta el último día con cálculo guardado, inclusive.
 * Solo entran los días que tienen documento. Hoy sin documento no aparece.
 * Un día de un mes anterior tampoco, aunque tenga cálculo.
 */
export function currentMonthDiaDates({ today, done } = {}) {
  if (!ISO_DAY.test(today || '')) return [];
  const set = done instanceof Set ? done : compensationDoneDates(done);
  const monthStart = `${today.slice(0, 7)}-01`;
  return [...set].filter((date) => date >= monthStart && date <= today).sort((a, b) => b.localeCompare(a));
}

/**
 * Día, para quien está logueado: la ventana de currentMonthDiaDates,
 * y solo un día en el que organiza al menos un partido.
 * Un día de otro organizador, o un cálculo sin partidos, no entra.
 */
export function diaDatesForOrganizer({ today, done, matches, staff, who } = {}) {
  const person = who && typeof who === 'object' ? who : { uid: '', name: '' };
  const byDay = new Map();
  for (const match of matches || []) {
    const date = String(match?.date || '');
    if (!ISO_DAY.test(date)) continue;
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date).push(match);
  }
  return currentMonthDiaDates({ today, done }).filter((date) => (
    (byDay.get(date) || []).some((match) => matchOrganizedBy(match, staff, person))
  ));
}

/** Con quién se anotó. Si no hay uid, vale quien lo agregó. */
export function signupOrganizerUid(player) {
  const signed = String(player?.signedUpWith || '').trim();
  if (signed) return signed;
  return String(player?.addedByUid || '').trim();
}

/** Lo cobrado de verdad: efectivo, transferencia y crédito. Transfiere después no entra. */
function paidReceived(player) {
  if (!player || isFreePlay(player)) return 0;
  return roundARS(paymentParts(player).received || 0);
}

/**
 * Mes a mes, solo lo que esta persona jugó y pagó con el organizador logueado.
 * Entra si se anotó con él, no está en la espera ni el partido está cancelado,
 * el día ya pasó (el mismo corte que el historial), no está en «No juega»
 * (confirmed === 'no') ni en «No jugó» (noPlay), y hay un pago cobrado mayor a 0.
 * La plata es ese pago entero, aunque lo haya recibido otro. No se parte.
 */
export function playerOrganizerMonths({ person, players, matches, who, now = Date.now() } = {}) {
  const uid = String(who?.uid || '').trim();
  if (!person || !uid) return [];
  const visible = (matches || []).filter((match) => match?.id && ISO_DAY.test(match.date || ''));
  const months = new Map();
  for (const player of players || []) {
    if (!playerMatchesPerson(player, person)) continue;
    if (player.waiting === true || player.noPlay === true || player.confirmed === 'no') continue;
    if (signupOrganizerUid(player) !== uid) continue;
    const match = visible.find((item) => item.id === player.matchId);
    if (!match || match.cancelled === true || !matchAlreadyPlayed(match, now)) continue;
    const paid = paidReceived(player);
    if (!(paid > 0)) continue;
    const key = monthKeyOf(match.date);
    if (!key) continue;
    const row = months.get(key) || { key, label: monthLabel(key), matches: 0, paid: 0 };
    row.matches += 1;
    row.paid = roundARS(row.paid + paid);
    months.set(key, row);
  }
  return [...months.values()].sort((a, b) => b.key.localeCompare(a.key));
}

/**
 * Lo que le corresponde al organizador en cada mes (o año).
 * Cada día usa organizerDayShare, o sea el mismo cálculo de la hoja.
 * Un día con varios partidos entra una sola vez. Uno con un solo
 * organizador suma lo que esa función le asigna.
 * Mes y Año no recortan por el cálculo guardado: suman los días que hay.
 */
export function organizerShareByPeriod({ matches, players, staff, uid, name, who, grain = 'month' } = {}) {
  const byDay = new Map();
  for (const match of matches || []) {
    if (!match?.id || !/^\d{4}-\d{2}-\d{2}$/.test(match.date || '')) continue;
    if (!byDay.has(match.date)) byDay.set(match.date, []);
    byDay.get(match.date).push(match);
  }
  const totals = new Map();
  for (const [date, dayMatches] of byDay) {
    const key = grain === 'year' ? date.slice(0, 4) : monthKeyOf(date);
    if (!key) continue;
    const share = organizerDayShare({ matches: dayMatches, players, staff, uid, name, who });
    totals.set(key, roundARS((totals.get(key) || 0) + share));
  }
  return totals;
}
