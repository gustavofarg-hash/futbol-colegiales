// Totales para la pestaña Estadísticas. Puro: no lee Firebase.
// Un partido cancelado no suma plata ni cupo. La espera no debe.
import { dayCompensation, matchAdders, matchCompensation } from './compensate.js';
import { monthKeyOf, monthLabel } from './ledger.js';
import { sameOrganizerIdentity, UNSPECIFIED } from './organizers.js';
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
      if (signupIsMine(player, who)) expected = roundARS(expected + priceDue(player, { players, matches: all, prices }));
      for (const share of paymentShares(player)) {
        if (!(share.amount > 0) || !sameOrganizerIdentity(share.name, who)) continue;
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

/**
 * Se anotó con esta persona.
 * Si hay nombre, manda el nombre: en un backup importado en /prueba/ el uid
 * de todos puede haber quedado en el de quien importó, y el nombre no.
 * Sin nombre, manda el uid. Sin uid, el nombre de quien lo agregó.
 */
function signupIsMine(player, who) {
  const named = String(player?.signedUpWithName || '').trim();
  const whoName = String(who?.name || '').trim();
  if (named && whoName) return sameOrganizerIdentity(named, who);
  const uid = String(who?.uid || '').trim();
  const signed = signupOrganizerUid(player);
  if (uid && signed) return signed === uid;
  return sameOrganizerIdentity(player?.addedBy, who);
}

/**
 * Un lugar que él anotó y que tiene plata paga o adeudada.
 * La espera y el juega gratis no entran. «No jugó pero pagó» y quien
 * pagó y después se bajó sí: el lugar sigue contando.
 * Con promo, due es la parte de ese partido, no el total del día.
 */
function signedSpot(player, ctx) {
  if (!player || player.waiting === true || isFreePlay(player)) return null;
  const due = priceDue(player, ctx);
  const parts = paymentParts(player);
  const recorded = roundARS((parts.received || 0) + (parts.pending || 0));
  if (!(due > 0) && !(recorded > 0)) return null;
  const promo = promoForPlayer({ player, players: ctx.players, matches: ctx.matches, prices: ctx.prices });
  const grouped = !!(promo && promo.count >= 2);
  const match = (ctx.matches || []).find((item) => item.id === player.matchId);
  const person = personKey(player, ctx.players) || player.id || '';
  return {
    due: due > 0 ? due : 0,
    recorded,
    promo: grouped,
    total: grouped ? Number(promo.total) || 0 : 0,
    group: grouped ? `promo:${person}|${match?.date || ''}` : `spot:${player.id || person}`,
  };
}

function emptyPeriod(key, grain) {
  return {
    key,
    label: grain === 'year' ? String(key) : monthLabel(key),
    matches: 0,
    cancelled: 0,
    playerKeys: new Set(),
    spotGroups: new Map(),
    expected: 0,
    collected: 0,
    pending: 0,
    byMethod: new Map(),
    byOrganizer: new Map(),
  };
}

/**
 * Lo que anotó y lo que pagaron en un día, partido por partido.
 * Misma regla que Mes: se anotó con él (uid o nombre), no está en la espera
 * y el lugar tiene plata paga o adeudada. Pagaron es lo que pusieron,
 * lo cobre quien lo cobre, incluido Transfiere después. Un cancelado no entra.
 */
export function daySignupSummary({ matches, players, prices, who } = {}) {
  const person = who && typeof who === 'object' ? who : null;
  const ordered = (matches || [])
    .filter((match) => match?.id && match.cancelled !== true)
    .sort((a, b) => String(a.time || '').localeCompare(String(b.time || '')) || String(a.id).localeCompare(String(b.id)));
  const spotCtx = { players, matches: ordered, prices };
  const rows = [];
  let spots = 0;
  let paid = 0;
  for (const match of ordered) {
    let matchSpots = 0;
    let matchPaid = 0;
    for (const player of players || []) {
      if (!player || player.matchId !== match.id || player.waiting === true) continue;
      if (!person || !signupIsMine(player, person)) continue;
      if (signedSpot(player, spotCtx)) matchSpots += 1;
      const parts = paymentParts(player);
      matchPaid = roundARS(matchPaid + (parts.received || 0) + (parts.pending || 0));
    }
    spots += matchSpots;
    paid = roundARS(paid + matchPaid);
    rows.push({ id: match.id, time: match.time || '--:--', spots: matchSpots, paid: matchPaid });
  }
  return { spots, paid, matches: rows };
}

function signedMoney(groups) {
  let count = 0;
  let amount = 0;
  for (const group of groups.values()) {
    count += group.count;
    const raw = Math.max(group.due, group.recorded);
    const money = group.promo && group.total > 0 ? Math.min(raw, group.total) : raw;
    amount = roundARS(amount + money);
  }
  return { count, amount };
}

/**
 * Mes o año. Los partidos son los que organiza quien está logueado, ya jugados
 * (el mismo corte que el historial) y sin cancelados. Hoy y los que faltan no
 * entran. Los jugadores son los lugares que anotó él y que tienen plata paga o
 * adeudada. El monto es esa plata, sin importar quién la cobró.
 * Sin `who`, sigue el total del partido: gente distinta y lo cobrado.
 */
export function periodBuckets({ matches, players, prices, grain = 'month', who, staff, now = Date.now() } = {}) {
  const person = who && typeof who === 'object' ? who : null;
  const buckets = new Map();
  const source = matches || [];
  const visible = person ? source.filter((match) => matchOrganizedBy(match, staff, person)) : source;
  const spotCtx = { players, matches: source, prices };
  for (const match of visible) {
    if (!match?.id || !/^\d{4}-\d{2}-\d{2}$/.test(match.date || '')) continue;
    if (!matchAlreadyPlayed(match, now)) continue;
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
    if (!person) continue;
    for (const player of players || []) {
      if (player?.matchId !== match.id || !signupIsMine(player, person)) continue;
      const spot = signedSpot(player, spotCtx);
      if (!spot) continue;
      const group = bucket.spotGroups.get(spot.group) || { promo: spot.promo, total: spot.total, due: 0, recorded: 0, count: 0 };
      group.count += 1;
      group.due = roundARS(group.due + spot.due);
      group.recorded = roundARS(group.recorded + spot.recorded);
      bucket.spotGroups.set(spot.group, group);
    }
  }
  return [...buckets.values()]
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((bucket) => {
      const signed = person ? signedMoney(bucket.spotGroups) : null;
      return {
        key: bucket.key,
        label: bucket.label,
        matches: bucket.matches,
        cancelled: bucket.cancelled,
        players: signed ? signed.count : bucket.playerKeys.size,
        signedAmount: signed ? signed.amount : bucket.collected,
        expected: bucket.expected,
        collected: bucket.collected,
        pending: bucket.pending,
        byMethod: methodRows(bucket.byMethod),
        byOrganizer: organizerRows(bucket.byOrganizer),
      };
    });
}

function isThisOrganizer(person, who) {
  if (!person) return false;
  return sameOrganizerIdentity(person, who);
}

function activeDayMatches(matches) {
  return (matches || []).filter((match) => match && match.cancelled !== true);
}

function namedAdders(match) {
  const raw = Array.isArray(match?.adderNames) ? match.adderNames : [];
  const names = [];
  for (const item of raw) {
    const name = typeof item === 'string' ? item : item?.name;
    const text = String(name || '').trim();
    if (text && !names.some((have) => sameOrganizerIdentity(have, text))) names.push(text);
  }
  return names;
}

function nameUid(name) {
  const slug = String(name || '').trim().toLowerCase().replace(/\s+/g, '-');
  return slug ? `name:${slug}` : '';
}

function personByName(staff, name) {
  return (staff || []).find((user) => user?.uid && sameOrganizerIdentity(user, { name })) || null;
}

/** Nombres que organizan ese día aunque su cuenta no esté en la lista. */
function namedOrganizers(matches, players) {
  const names = [];
  const add = (name) => {
    const text = String(name || '').trim();
    if (!text || text === UNSPECIFIED || names.some((have) => sameOrganizerIdentity(have, text))) return;
    names.push(text);
  };
  const ids = new Set();
  for (const match of matches || []) {
    if (!match || match.cancelled === true) continue;
    ids.add(match.id);
    for (const name of namedAdders(match)) add(name);
    add(match.createdBy);
  }
  for (const player of players || []) {
    if (!player || !ids.has(player.matchId) || player.waiting === true) continue;
    add(player.signedUpWithName);
    if (!player.signedUpWith && !player.signedUpWithName) add(player.addedBy);
  }
  return names;
}

function staffForShare(staff, matches, players) {
  const people = (staff || [])
    .filter((user) => user?.uid && user.active !== false)
    .map((user) => ({ uid: user.uid, name: user.name || '', active: true }));
  for (const name of namedOrganizers(matches, players)) {
    if (personByName(people, name)) continue;
    const uid = nameUid(name);
    if (!uid) continue;
    people.push({ uid, name, active: true });
  }
  return people;
}

/** Si el partido nombra quién anota, esos nombres mandan sobre un uid reescrito. */
function matchForShare(match, staff) {
  const names = namedAdders(match);
  if (!names.length) return match;
  const adders = [];
  for (const name of names) {
    const user = personByName(staff, name);
    const uid = user?.uid || nameUid(name);
    if (uid && !adders.includes(uid)) adders.push(uid);
  }
  if (!adders.length) return match;
  return { ...match, adders, createdByUid: adders[0] };
}

/** Esta persona organiza el partido: puede anotar, igual que en la compensación. */
export function matchOrganizedBy(match, staff, who) {
  const person = who && typeof who === 'object' ? who : { uid: '', name: '' };
  const names = namedAdders(match);
  if (names.length) return names.some((name) => sameOrganizerIdentity(name, person));
  const created = String(match?.createdBy || '').trim();
  const adders = Array.isArray(match?.adders) ? match.adders : [];
  const open = !adders.length || adders.includes('*');
  // Un partido cerrado creado por otro no es de él, aunque el import haya
  // pisado el uid del creador con el de quien cargó el backup.
  if (created && !open && !sameOrganizerIdentity(created, person)) return false;
  if (matchAdders(match, staff).some((adder) => isThisOrganizer(adder, person))) return true;
  return !!(created && sameOrganizerIdentity(created, person));
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
 * Solo entran los partidos de ese día que ya se jugaron. Hoy y los que faltan
 * no suman. Un cancelado tampoco.
 * Un solo organizador: todo lo cobrado.
 * Más de uno: su fila de dayCompensation («le corresponden»),
 * según el modo de cada partido (partes iguales o lo que anotó).
 * No es la suma de lo que cobraron todos.
 */
export function organizerDayShare({ matches, players, staff, uid, name, who, now = Date.now() } = {}) {
  const played = (matches || []).filter((match) => matchAlreadyPlayed(match, now));
  const person = who && typeof who === 'object' ? who : { uid: uid || '', name: name || '' };
  const people = staffForShare(staff, played, players);
  const dayMatches = played.map((match) => matchForShare(match, people));
  const organizers = dayOrganizers(dayMatches, people);
  if (organizers.length <= 1) {
    const only = organizers[0];
    if (!isThisOrganizer(only, person)) return 0;
    return dayCollected(dayMatches, players, people);
  }
  const calc = dayCompensation(dayMatches, players, people);
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
 * Día: del 1 de este mes hasta ayer. Solo días con documento de compensación.
 * Lo usa quien todavía mira el cálculo guardado. La lista de Estadísticas
 * ya no pasa por acá: muestra los partidos jugados aunque no haya cálculo.
 */
export function currentMonthDiaDates({ today, done } = {}) {
  if (!ISO_DAY.test(today || '')) return [];
  const set = done instanceof Set ? done : compensationDoneDates(done);
  const monthStart = `${today.slice(0, 7)}-01`;
  return [...set].filter((date) => date >= monthStart && date <= today).sort((a, b) => b.localeCompare(a));
}

/**
 * Estadísticas > Día: todos los partidos ya jugados de este mes, no cancelados,
 * en los que organiza quien está logueado. No hace falta un cálculo guardado.
 * Hoy no entra: todavía no se jugó. Gus y Gustavo son el mismo organizador.
 */
export function diaDatesForOrganizer({ today, matches, staff, who } = {}) {
  const person = who && typeof who === 'object' ? who : { uid: '', name: '' };
  if (!ISO_DAY.test(today || '')) return [];
  const monthStart = `${today.slice(0, 7)}-01`;
  const dates = new Set();
  for (const match of matches || []) {
    const date = String(match?.date || '');
    if (!ISO_DAY.test(date) || date < monthStart || date >= today) continue;
    if (match.cancelled === true) continue;
    if (!matchOrganizedBy(match, staff, person)) continue;
    dates.add(date);
  }
  return [...dates].sort((a, b) => b.localeCompare(a));
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
 * Cada día usa organizerDayShare, o sea el mismo cálculo de la hoja, y solo
 * con los partidos de ese día que ya se jugaron.
 * Un día con varios partidos entra una sola vez. Uno con un solo
 * organizador suma lo que esa función le asigna.
 * Mes y Año no recortan por el cálculo guardado: suman los días ya jugados.
 */
export function organizerShareByPeriod({ matches, players, staff, uid, name, who, grain = 'month', now = Date.now() } = {}) {
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
    const share = organizerDayShare({ matches: dayMatches, players, staff, uid, name, who, now });
    totals.set(key, roundARS((totals.get(key) || 0) + share));
  }
  return totals;
}
