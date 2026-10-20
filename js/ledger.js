// Totales de pagos y de "Agregó", por jugador y por organizador.
// Puro: las pruebas no necesitan Firebase. Un pago sin receivedBy cuenta como "Sin especificar".
import { MESES_CORTOS } from './dates.js';
import { formatARS, paymentShares } from './payments.js';
import { UNSPECIFIED, sameOrganizer } from './organizers.js';
import { foldText } from './roster.js';

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

function ofPhone(phone, players) {
  if (!phone) return [];
  return (players || []).filter((player) => player.phone === phone);
}

function matchOf(player, matches) {
  return (matches || []).find((match) => match.id === player.matchId) || null;
}

/**
 * Plata cobrada a este teléfono, titulares y lista de espera, pasados y futuros.
 * organizer filtra por quien cobró (o "Sin especificar").
 */
export function paymentLedger({ phone, players, matches, organizer = null }) {
  const months = new Map();
  const by = new Map();
  let total = 0;
  let count = 0;
  for (const player of ofPhone(phone, players)) {
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

/** Veces que anotaron a este teléfono, en la lista principal y en la espera. */
export function signupLedger({ phone, players, organizer = null }) {
  const by = new Map();
  for (const player of ofPhone(phone, players)) {
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
 * y cuántas veces lo anotó cada uno. El nombre del plantel gana si hay teléfono.
 */
export function paymentsSummary({ players, roster, organizer = null }) {
  const people = new Map();
  const touch = (key, name) => {
    if (!people.has(key)) people.set(key, { key, name: name || 'Sin nombre', fromRoster: false, paid: new Map(), signups: new Map(), pending: 0, pendingBy: new Map() });
    const row = people.get(key);
    bumpName(row, name);
    return row;
  };
  for (const person of roster || []) {
    if (!person.phone) continue;
    const row = touch(person.phone, person.name);
    row.fromRoster = true;
    if (person.name) row.name = person.name;
  }
  for (const player of players || []) {
    const key = player.phone || `n:${foldText(player.name) || player.id || ''}`;
    const row = touch(key, player.name);
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
    const key = player.phone || `n:${foldText(player.name) || player.id || ''}`;
    if (!people.has(key)) {
      const saved = (roster || []).find((person) => person.phone && person.phone === player.phone);
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

/** true si hay un pago sin cobrador o un alta sin "Agregó", para mostrar el filtro. */
export function hasUnspecified({ players, phone = null }) {
  const list = phone ? ofPhone(phone, players) : (players || []);
  return list.some((player) => addedByLabel(player) === UNSPECIFIED
    || (player.paid === true && receivedShares(player).some((share) => shareLabel(share.name) === UNSPECIFIED)));
}
