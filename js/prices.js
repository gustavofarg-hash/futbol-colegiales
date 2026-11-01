// Precios del partido y promos del mismo día. Puro: la UI lee el documento
// settings/prices y, si todavía no existe, usa estos defaults.
import { toEpoch } from './dates.js';
import { allocateAcrossDebts, formatARS, isFreePlay, paymentParts, paymentShares, roundARS } from './payments.js';
import { personKey } from './roster.js';

export const DEFAULT_PRICES = { matchPrice: 5000, promo2Price: 9000, promo3Price: 12000 };
export const MAX_PRICE = 1_000_000_000;
export const PRICES_DENIED_READ = 'No se pueden leer los precios. Hay que publicar las reglas de Firestore para settings/prices. Mientras tanto se usan los precios de siempre.';
export const PRICES_DENIED_WRITE = 'No se pudieron guardar los precios. Hay que publicar las reglas de Firestore para settings/prices.';

function asPrice(value, fallback) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_PRICE) return value;
  return fallback;
}

/**
 * Precio por jugador de este partido. Si el partido no lo tiene guardado
 * (los de antes), se usa el de Ajustes.
 */
export function priceOfMatch(match, prices) {
  const n = Number(match?.price);
  if (Number.isInteger(n) && n >= 0 && n <= MAX_PRICE) return n;
  return normalizePrices(prices).matchPrice;
}

/** Documento de Firestore, o los defaults si no está o está incompleto. */
export function normalizePrices(raw) {
  const src = raw || {};
  return {
    matchPrice: asPrice(src.matchPrice, DEFAULT_PRICES.matchPrice),
    promo2Price: asPrice(src.promo2Price, DEFAULT_PRICES.promo2Price),
    promo3Price: asPrice(src.promo3Price, DEFAULT_PRICES.promo3Price),
  };
}

/** Entero ≥ 0. Acepta 5000 y 5.000. Rechaza centavos. */
export function parsePriceInput(raw) {
  let s = String(raw ?? '').trim().replace(/\s+/g, '').replace(/^\$/, '');
  if (!s) return { ok: false, error: 'Poné el precio.' };
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  if (!/^\d+$/.test(s)) return { ok: false, error: 'Tiene que ser un número entero, sin centavos.' };
  const n = Number(s);
  if (n > MAX_PRICE) return { ok: false, error: 'El precio es muy alto.' };
  return { ok: true, amount: n };
}

export function priceRecord(input) {
  const matchPrice = parsePriceInput(input?.matchPrice);
  if (!matchPrice.ok) return matchPrice;
  const promo2Price = parsePriceInput(input?.promo2Price);
  if (!promo2Price.ok) return promo2Price;
  const promo3Price = parsePriceInput(input?.promo3Price);
  if (!promo3Price.ok) return promo3Price;
  return { ok: true, patch: { matchPrice: matchPrice.amount, promo2Price: promo2Price.amount, promo3Price: promo3Price.amount } };
}

/**
 * Misma persona: teléfono (hash), si no el id del plantel, si no el nombre.
 * Un invitado sin teléfono ni ficha es «quien lo invita + su nombre»
 * (personKey): la promo solo junta al Invitado 1 del mismo anfitrión.
 */
export function playerPromoKey(player, players = []) {
  return personKey(player, players);
}

function whenOf(match) {
  if (!match) return 0;
  if (typeof match.startsAt === 'number' && Number.isFinite(match.startsAt)) return match.startsAt;
  if (match.date) return toEpoch(match.date, match.time);
  return 0;
}

/**
 * Titulares (no espera) de la misma persona en partidos con la misma fecha.
 * Ordenados por hora. Vacío si no hay con quién agrupar.
 */
export function sameDayTitulars({ player, players, matches }) {
  const key = playerPromoKey(player, players);
  if (!key || player?.waiting === true || isFreePlay(player)) return [];
  const own = (matches || []).find((match) => match.id === player.matchId);
  const date = own?.date || player.matchDate;
  if (!date) return [];
  const byMatch = new Map();
  for (const other of players || []) {
    if (other?.waiting === true || isFreePlay(other)) continue;
    if (playerPromoKey(other, players) !== key) continue;
    const match = (matches || []).find((item) => item.id === other.matchId);
    const day = match?.date || other.matchDate;
    if (day !== date) continue;
    if (!other.matchId || byMatch.has(other.matchId)) continue;
    byMatch.set(other.matchId, {
      match: match || { id: other.matchId, date: day, time: '' },
      player: other,
    });
  }
  return [...byMatch.values()].sort((a, b) => whenOf(a.match) - whenOf(b.match) || String(a.match.id).localeCompare(String(b.match.id)));
}

/**
 * 2 partidos: promo 2. 3 o más: promo 3, y del cuarto en adelante suma el precio
 * de un partido. El cartel de 3 o más dice siempre la promo 3.
 */
export function promoOffer(count, prices) {
  const p = normalizePrices(prices);
  const n = Number(count) || 0;
  if (n < 2) return null;
  if (n === 2) {
    return { count: n, tier: 2, total: p.promo2Price, label: `Promo 2 partidos por ${formatARS(p.promo2Price)}` };
  }
  const extras = n - 3;
  const total = p.promo3Price + Math.max(0, extras) * p.matchPrice;
  return { count: n, tier: 3, total, label: `Promo 3 partidos por ${formatARS(p.promo3Price)}` };
}

/**
 * Reparte un monto en n partes. El resto de los pesos queda en la primera
 * (9001 en 2 → 4501 y 4500). Los centavos sueltos también van a la primera.
 * La suma cierra con el monto original.
 */
export function splitEven(total, n) {
  const count = Number(n) || 0;
  if (count <= 0) return [];
  const cents = Math.round(roundARS(total) * 100);
  const pesos = Math.floor(cents / 100);
  const loose = cents - pesos * 100;
  const base = Math.floor(pesos / count);
  const rem = pesos - base * count;
  return Array.from({ length: count }, (_, i) => base + (i === 0 ? rem + loose / 100 : 0));
}

/** Reparte efectivo, transferencia y pendiente por separado. La suma de cada uno cierra. */
export function splitPaymentAcross({ cash = 0, transfer = 0, pending = 0, credit = 0 }, n) {
  const cashShares = splitEven(cash, n);
  const transferShares = splitEven(transfer, n);
  const pendingShares = splitEven(pending, n);
  const creditShares = splitEven(credit, n);
  return cashShares.map((part, i) => ({ cash: part, transfer: transferShares[i], pending: pendingShares[i], credit: creditShares[i] }));
}

/**
 * Tope de cada persona al dividir un pago.
 * Con promo, el total del día. Con un solo partido, el precio de ese partido.
 */
export function guestPromoCap({ person, players, matches, prices }) {
  const rows = sameDayTitulars({ player: person, players, matches });
  const norm = normalizePrices(prices);
  if (rows.length >= 2) return { rows, cap: promoOffer(rows.length, norm).total };
  if (rows.length === 1) return { rows, cap: priceOfMatch(rows[0].match, norm) };
  return { rows, cap: 0 };
}

/**
 * Reparte el pago entre el anfitrión y sus invitados, en ese orden, hasta lo que
 * cada uno debe (la promo del día, o el partido si no tiene promo).
 * Lo de cada persona se parte en partes iguales entre sus partidos; el peso que
 * sobra queda en el más temprano. Lo que no entra en esas deudas queda afuera.
 */
export function allocateGuestPromo({ people, players, matches, prices, cash = 0, transfer = 0, pending = 0, credit = 0 } = {}) {
  const bills = (people || []).map((person) => ({ person, ...guestPromoCap({ person, players, matches, prices }) }));
  const dues = bills.map((bill) => bill.cap);
  const cashSplit = allocateAcrossDebts(cash, dues);
  const transferSplit = allocateAcrossDebts(transfer, dues);
  const pendingSplit = allocateAcrossDebts(pending, dues);
  const creditSplit = allocateAcrossDebts(credit, dues);
  const rows = bills.map((bill, i) => {
    const part = {
      cash: cashSplit.parts[i],
      transfer: transferSplit.parts[i],
      pending: pendingSplit.parts[i],
      credit: creditSplit.parts[i],
    };
    const shares = bill.rows.length ? splitPaymentAcross(part, bill.rows.length) : [];
    return {
      person: bill.person,
      cap: bill.cap,
      ...part,
      matches: bill.rows.map((row, j) => ({ player: row.player, match: row.match, ...shares[j] })),
    };
  });
  return {
    rows,
    cashLeft: cashSplit.left,
    transferLeft: transferSplit.left,
    pendingLeft: pendingSplit.left,
    creditLeft: creditSplit.left,
    left: roundARS(cashSplit.left + transferSplit.left + pendingSplit.left + creditSplit.left),
  };
}

/** Promo del día para este jugador, con el monto que le toca a este partido. */
export function promoForPlayer({ player, players, matches, prices }) {
  const rows = sameDayTitulars({ player, players, matches });
  const offer = promoOffer(rows.length, prices);
  if (!offer) return null;
  const index = Math.max(0, rows.findIndex((row) => row.player.id === player.id));
  const shares = splitEven(offer.total, rows.length);
  return { ...offer, rows, index, share: shares[index] ?? offer.total, shares };
}

function addNamed(parts, name, amount) {
  const money = roundARS(amount);
  if (!(money > 0)) return;
  const key = String(name || '').trim();
  const found = parts.find((part) => part.name === key);
  if (found) found.amount = roundARS(found.amount + money);
  else parts.push({ name: key, amount: money });
}

/**
 * Al salir de la promo (gratis, o quitar ese partido), lo ya cobrado se acomoda
 * al precio nuevo: la promo de los que quedan, o el precio de un partido de Ajustes
 * si queda uno solo. No usa el precio propio de ese partido.
 * Lo que sobra vuelve como saldo a quien lo había cobrado.
 * Los partidos que quedan se reparten ese cobro en partes iguales;
 * el peso que sobra queda en el primero. «Transfiere después» no se movió:
 * todavía no se cobró.
 */
export function promoRefundAfterFree({ player, players, matches, prices }) {
  const rows = sameDayTitulars({ player, players, matches });
  if (!player || rows.length < 2) return null;
  const others = rows.filter((row) => row.player.id !== player.id);
  const norm = normalizePrices(prices);
  const newDue = others.length >= 2
    ? promoOffer(others.length, norm).total
    : others.length === 1
      ? norm.matchPrice
      : 0;
  const ordered = [...others, rows.find((row) => row.player.id === player.id)].filter(Boolean);
  const slices = [];
  for (const row of ordered) {
    for (const share of paymentShares(row.player)) {
      if (share.kind === 'pending' || !(share.amount > 0)) continue;
      slices.push({
        kind: share.kind === 'received' ? 'cash' : share.kind,
        name: String(share.name || '').trim(),
        amount: roundARS(share.amount),
      });
    }
  }
  const received = roundARS(slices.reduce((sum, slice) => sum + slice.amount, 0));
  const keptTotal = Math.min(received, roundARS(newDue));
  let room = keptTotal;
  const kept = [];
  const creditByName = new Map();
  for (const slice of slices) {
    const take = roundARS(Math.min(slice.amount, Math.max(0, room)));
    const extra = roundARS(slice.amount - take);
    if (take > 0) kept.push({ ...slice, amount: take });
    if (extra > 0) creditByName.set(slice.name, roundARS((creditByName.get(slice.name) || 0) + extra));
    room = roundARS(room - take);
  }
  const targets = splitEven(keptTotal, others.length);
  const buckets = others.map((row) => ({
    playerId: row.player.id,
    cashParts: [],
    transferParts: [],
    creditParts: [],
    pending: paymentParts(row.player).pending,
    pendingTo: String(row.player.pendingTo || row.player.paidUpdatedBy || '').trim(),
  }));
  let index = 0;
  let filled = 0;
  for (const slice of kept) {
    let left = slice.amount;
    while (left > 0 && index < buckets.length) {
      const cap = roundARS((targets[index] || 0) - filled);
      if (!(cap > 0)) { index += 1; filled = 0; continue; }
      const take = roundARS(Math.min(left, cap));
      const bucket = buckets[index];
      if (slice.kind === 'transfer') addNamed(bucket.transferParts, slice.name, take);
      else if (slice.kind === 'credit') addNamed(bucket.creditParts, slice.name, take);
      else addNamed(bucket.cashParts, slice.name, take);
      filled = roundARS(filled + take);
      left = roundARS(left - take);
      if (filled >= (targets[index] || 0) - 0.001) { index += 1; filled = 0; }
    }
  }
  const largest = (parts) => [...parts].sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name))[0]?.name || '';
  const payments = buckets.map((bucket) => {
    const cash = roundARS(bucket.cashParts.reduce((sum, part) => sum + part.amount, 0));
    const transferParts = bucket.transferParts.filter((part) => part.amount > 0);
    const transfer = roundARS(transferParts.reduce((sum, part) => sum + part.amount, 0));
    const creditParts = bucket.creditParts.filter((part) => part.amount > 0);
    const credit = roundARS(creditParts.reduce((sum, part) => sum + part.amount, 0));
    return {
      playerId: bucket.playerId,
      cash,
      cashTo: cash > 0 ? largest(bucket.cashParts) : '',
      transfer,
      transferTo: transferParts.length === 1 ? transferParts[0].name : '',
      transferParts: transferParts.length > 1 ? transferParts.map((part) => ({ to: part.name, amount: part.amount })) : null,
      fromCredit: credit,
      creditTo: credit > 0 ? largest(creditParts) : '',
      pending: bucket.pending,
      pendingTo: bucket.pending > 0 ? bucket.pendingTo : '',
    };
  }).filter((row) => row.cash + row.transfer + row.fromCredit + row.pending > 0);
  const credits = [...creditByName.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([name, amount]) => ({ name, amount }));
  return { newDue, received, credits, payments };
}
