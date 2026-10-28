// Totales de pagos y de "Agregó", por jugador y por organizador.
// Puro: las pruebas no necesitan Firebase. Un pago sin receivedBy cuenta como "Sin especificar".
import { MESES_CORTOS, numericDate, shortHour } from './dates.js';
import { formatARS, isFreePlay, paymentParts, paymentShares, roundARS } from './payments.js';
import { priceOfMatch, promoForPlayer } from './prices.js';
import { UNSPECIFIED, sameOrganizer } from './organizers.js';
import { foldText, phoneIdentity, playerMatchesPerson } from './roster.js';

export function receiverLabel(player) {
  const name = String(player?.receivedBy || '').trim();
  return name || UNSPECIFIED;
}

export function addedByLabel(player) {
  const name = String(player?.addedBy || '').trim();
  return name || UNSPECIFIED;
}

export function monthKeyOf(date) {
  return /^\d{4}-\d{2}/.test(date || '') ? String(date).slice(0, 7) : '';
}

/** "Oct 2026" a partir de "2026-10". */
export function monthLabel(key) {
  const y = String(key).slice(0, 4);
  const m = Number(String(key).slice(5, 7));
  const short = MESES_CORTOS[m - 1] || '';
  const nice = short ? short.charAt(0) + short.slice(1).toLowerCase() : String(key);
  return y ? `${nice} ${y}` : String(key);
}

function wants(label, organizer) {
  if (!organizer) return true;
  if (organizer === UNSPECIFIED) return label === UNSPECIFIED;
  return sameOrganizer(label, organizer);
}

function shareLabel(name) {
  const text = String(name || '').trim();
  return text || UNSPECIFIED;
}

function receivedShares(player) {
  return paymentShares(player).filter((share) => share.kind !== 'pending' && share.amount > 0);
}

function pendingShareList(player) {
  return paymentShares(player).filter((share) => share.kind === 'pending' && share.amount > 0);
}

function ofPerson({ phone, phoneKey, rosterId, name }, players) {
  const person = { id: rosterId || '', phone: phone || '', phoneKey: phoneKey || '', name: name || '' };
  if (!person.phone && !person.phoneKey && !person.id && !person.name) return [];
  return (players || []).filter((player) => playerMatchesPerson(player, person));
}

function summaryKey(player, roster) {
  const phone = phoneIdentity(player);
  if (phone) return `p:${phone}`;
  if (player?.rosterId) return `r:${player.rosterId}`;
  const named = (roster || []).filter((person) => !phoneIdentity(person) && foldText(person.name) === foldText(player?.name) && person.id);
  if (named.length === 1) return `r:${named[0].id}`;
  const name = foldText(player?.name);
  return name ? `n:${name}` : `id:${player?.id || ''}`;
}

function matchOf(player, matches) {
  return (matches || []).find((match) => match.id === player.matchId) || null;
}

/**
 * Plata cobrada a esta persona, titulares y lista de espera, pasados y futuros.
 * organizer filtra por quien cobró (o "Sin especificar").
 */
export function paymentLedger({ phone, phoneKey, rosterId, name, players, matches, organizer = null }) {
  const months = new Map();
  const by = new Map();
  let total = 0;
  let count = 0;
  for (const player of ofPerson({ phone, phoneKey, rosterId, name }, players)) {
    if (player.paid !== true) continue;
    const included = receivedShares(player).filter((share) => wants(shareLabel(share.name), organizer));
    if (!included.length) continue;
    const amount = included.reduce((sum, share) => sum + share.amount, 0);
    total += amount;
    count += 1;
    const match = matchOf(player, matches);
    const key = monthKeyOf(match?.date || player.matchDate);
    if (key) months.set(key, (months.get(key) || 0) + amount);
    const seen = new Set();
    for (const share of included) {
      const who = shareLabel(share.name);
      const bucket = by.get(who) || { name: who, amount: 0, count: 0 };
      bucket.amount += share.amount;
      if (!seen.has(who)) bucket.count += 1;
      seen.add(who);
      by.set(who, bucket);
    }
  }
  const monthList = [...months.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, amount]) => ({ key, label: monthLabel(key), amount, text: `${monthLabel(key)}: ${formatARS(amount)}` }));
  const byOrganizer = [...by.values()].sort((a, b) => b.amount - a.amount || foldText(a.name).localeCompare(foldText(b.name), 'es'));
  return {
    total,
    count,
    totalText: count ? `Pagó ${formatARS(total)}` : 'Sin pagos cargados',
    months: monthList,
    byOrganizer,
  };
}

/** Veces que anotaron a esta persona, en la lista principal y en la espera. */
export function signupLedger({ phone, phoneKey, rosterId, name, players, organizer = null }) {
  const by = new Map();
  for (const player of ofPerson({ phone, phoneKey, rosterId, name }, players)) {
    const who = addedByLabel(player);
    if (!wants(who, organizer)) continue;
    by.set(who, (by.get(who) || 0) + 1);
  }
  const byOrganizer = [...by.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || foldText(a.name).localeCompare(foldText(b.name), 'es'));
  return { total: byOrganizer.reduce((sum, row) => sum + row.count, 0), byOrganizer };
}

function bumpName(row, name) {
  if (name && (!row.name || row.name === 'Sin nombre')) row.name = name;
}

/**
 * Resumen de todos: cuánto le pagó cada jugador a cada organizador
 * y cuántas veces lo anotó cada uno. El nombre del plantel gana.
 * Sin teléfono, la fila usa el id del plantel o el nombre.
 */
export function paymentsSummary({ players, roster, organizer = null }) {
  const people = new Map();
  const touch = (key, name) => {
    if (!key) return null;
    if (!people.has(key)) people.set(key, { key, name: name || 'Sin nombre', rosterId: '', fromRoster: false, paid: new Map(), signups: new Map(), pending: 0, pendingBy: new Map() });
    const row = people.get(key);
    bumpName(row, name);
    return row;
  };
  for (const person of roster || []) {
    const phone = phoneIdentity(person);
    const key = phone ? `p:${phone}` : (person.id ? `r:${person.id}` : '');
    const row = touch(key, person.name);
    if (!row) continue;
    row.fromRoster = true;
    if (person.id) row.rosterId = person.id;
    if (person.name) row.name = person.name;
  }
  for (const player of players || []) {
    const row = touch(summaryKey(player, roster), player.name);
    if (!row) continue;
    const added = addedByLabel(player);
    if (wants(added, organizer)) row.signups.set(added, (row.signups.get(added) || 0) + 1);
    if (player.paid === true) {
      const seen = new Set();
      for (const share of receivedShares(player)) {
        const who = shareLabel(share.name);
        if (!wants(who, organizer)) continue;
        const cur = row.paid.get(who) || { name: who, amount: 0, count: 0 };
        cur.amount += share.amount;
        if (!seen.has(who)) cur.count += 1;
        seen.add(who);
        row.paid.set(who, cur);
      }
    }
    for (const share of pendingShareList(player)) {
      const who = shareLabel(share.name);
      if (!wants(who, organizer)) continue;
      row.pending = (row.pending || 0) + share.amount;
      row.pendingBy.set(who, (row.pendingBy.get(who) || 0) + share.amount);
    }
  }
  const list = [];
  for (const row of people.values()) {
    const paid = [...row.paid.values()].sort((a, b) => b.amount - a.amount || foldText(a.name).localeCompare(foldText(b.name), 'es'));
    const signups = [...row.signups.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || foldText(a.name).localeCompare(foldText(b.name), 'es'));
    const pendingBy = [...row.pendingBy.entries()]
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount || foldText(a.name).localeCompare(foldText(b.name), 'es'));
    if (!paid.length && !signups.length && !(row.pending > 0)) continue;
    list.push({
      key: row.key,
      rosterId: row.rosterId || '',
      name: row.name,
      paid,
      signups,
      pending: row.pending || 0,
      pendingBy,
      paidTotal: paid.reduce((sum, item) => sum + item.amount, 0),
      signupTotal: signups.reduce((sum, item) => sum + item.count, 0),
    });
  }
  list.sort((a, b) => b.paidTotal - a.paidTotal || foldText(a.name).localeCompare(foldText(b.name), 'es'));
  return list;
}

/** Totales de cada organizador: plata cobrada y veces que anotó a alguien. */
export function organizerTotals(players) {
  const map = new Map();
  const bump = (name) => {
    const key = name || UNSPECIFIED;
    if (!map.has(key)) map.set(key, { name: key, collected: 0, added: 0, pending: 0 });
    return map.get(key);
  };
  for (const player of players || []) {
    bump(addedByLabel(player)).added += 1;
    if (player.paid === true) {
      for (const share of receivedShares(player)) bump(shareLabel(share.name)).collected += share.amount;
    }
    for (const share of pendingShareList(player)) bump(shareLabel(share.name)).pending += share.amount;
  }
  return [...map.values()].sort((a, b) => b.collected - a.collected || b.added - a.added || foldText(a.name).localeCompare(foldText(b.name), 'es'));
}

/** Lo que anotó y lo que cobró una persona. El nombre se compara sin acentos. */
export function mineSummary(players, name) {
  let added = 0;
  let amount = 0;
  let pending = 0;
  for (const player of players || []) {
    if (sameOrganizer(player.addedBy, name)) added += 1;
    if (player.paid === true) {
      for (const share of receivedShares(player)) if (sameOrganizer(share.name, name)) amount += share.amount;
    }
    for (const share of pendingShareList(player)) if (sameOrganizer(share.name, name)) pending += share.amount;
  }
  const pendingText = pending > 0 ? ` · por transferir ${formatARS(pending)}` : '';
  return { added, amount, pending, text: `Anotaste ${added} · Cobraste ${formatARS(amount)}${pendingText}` };
}

/** Jugadores con transferencia prometida y todavía no cobrada. */
export function pendingTransfers({ players, roster, organizer = null }) {
  const people = new Map();
  let total = 0;
  for (const player of players || []) {
    const shares = pendingShareList(player).filter((share) => wants(shareLabel(share.name), organizer));
    if (!shares.length) continue;
    const key = summaryKey(player, roster);
    if (!people.has(key)) {
      const saved = (roster || []).find((person) => phoneIdentity(person) && phoneIdentity(person) === phoneIdentity(player))
        || (roster || []).find((person) => person.id && person.id === player.rosterId)
        || (roster || []).find((person) => !phoneIdentity(person) && foldText(person.name) === foldText(player.name));
      people.set(key, { key, name: saved?.name || player.name || 'Sin nombre', amount: 0, by: new Map() });
    }
    const row = people.get(key);
    for (const share of shares) {
      const who = shareLabel(share.name);
      row.amount += share.amount;
      row.by.set(who, (row.by.get(who) || 0) + share.amount);
      total += share.amount;
    }
  }
  const rows = [...people.values()].map((row) => ({
    key: row.key,
    name: row.name,
    amount: row.amount,
    by: [...row.by.entries()].map(([name, amount]) => ({ name, amount })),
  }));
  rows.sort((a, b) => b.amount - a.amount || foldText(a.name).localeCompare(foldText(b.name), 'es'));
  return { total, rows };
}

function organizerOf(organizer) {
  if (typeof organizer === 'string') return { uid: '', name: organizer };
  return { uid: String(organizer?.uid || '').trim(), name: String(organizer?.name || '').trim() };
}

/** Lo anotó este organizador: el uid con el que entró, o el nombre de Agregó. */
export function addedByOrganizer(player, organizer) {
  const who = organizerOf(organizer);
  if (!who.uid && !who.name) return false;
  if (who.uid && player?.addedByUid && player.addedByUid === who.uid) return true;
  return !!who.name && sameOrganizer(player?.addedBy, who.name);
}

/**
 * Lo que falta en este partido.
 * Con promo de 2 o 3, el precio de este partido es la parte del día
 * (promoForPlayer), no el precio suelto. Transfiere después no está cobrado.
 * Juega gratis, la lista de espera y un partido cancelado no deben.
 */
export function amountOwed(player, { players, matches, prices } = {}) {
  if (!player || player.waiting === true || isFreePlay(player)) return 0;
  const list = Array.isArray(matches) ? matches : [];
  const match = list.find((item) => item.id === player.matchId);
  if (!match || match.cancelled === true) return 0;
  const promo = promoForPlayer({ player, players, matches: list, prices });
  const due = promo ? Number(promo.share) : priceOfMatch(match, prices);
  const owed = roundARS(due - paymentParts(player).received);
  return owed > 0 ? owed : 0;
}

/** Lo que falta cobrar en un partido, solo de quien anotó el organizador. */
export function organizerMatchDebt({ match, players, matches, prices, organizer }) {
  if (!match || match.cancelled === true) return { total: 0, rows: [] };
  const rows = [];
  for (const player of players || []) {
    if (player.matchId !== match.id || !addedByOrganizer(player, organizer)) continue;
    const owed = amountOwed(player, { players, matches, prices });
    if (!(owed > 0)) continue;
    rows.push({ id: player.id || '', name: String(player.name || 'Sin nombre'), owed });
  }
  rows.sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name, 'es'));
  const total = roundARS(rows.reduce((sum, row) => sum + row.owed, 0));
  return { total, rows };
}

/**
 * Lo que le falta pagar, partido por partido.
 * Debe el precio del partido menos lo ya cobrado (efectivo + transferencia).
 * Con promo, el precio es la parte de ese día. Transfiere después entra en el resto.
 * Juega gratis, la lista de espera y un partido cancelado no suman.
 */
export function playerDebt({ person, players, matches, prices }) {
  const byId = new Map((matches || []).map((match) => [match.id, match]));
  const rows = [];
  for (const player of players || []) {
    if (!playerMatchesPerson(player, person)) continue;
    const owed = amountOwed(player, { players, matches, prices });
    if (!(owed > 0)) continue;
    const match = byId.get(player.matchId);
    if (!match) continue;
    const when = [numericDate(match.date), shortHour(match.time)].filter(Boolean).join(' · ');
    rows.push({
      matchId: match.id,
      date: match.date || '',
      time: match.time || '',
      owed,
      text: `${when} · ${formatARS(owed)}`,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || String(a.matchId).localeCompare(String(b.matchId)));
  const total = roundARS(rows.reduce((sum, row) => sum + row.owed, 0));
  return { total, rows, text: total > 0 ? `Debe en total: ${formatARS(total)}` : '' };
}

/** true si hay un pago sin cobrador o un alta sin "Agregó", para mostrar el filtro. */
export function hasUnspecified({ players, phone = null, phoneKey = null, rosterId = null, name = null }) {
  const scoped = phone || phoneKey || rosterId || name;
  const list = scoped ? ofPerson({ phone, phoneKey, rosterId, name }, players) : (players || []);
  return list.some((player) => addedByLabel(player) === UNSPECIFIED
    || (player.paid === true && receivedShares(player).some((share) => shareLabel(share.name) === UNSPECIFIED)));
}
