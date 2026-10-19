// Totales de pagos y de "Agregó", por jugador y por organizador.
// Puro: las pruebas no necesitan Firebase. Un pago sin receivedBy cuenta como "Sin especificar".
import { MESES_CORTOS } from './dates.js';
import { formatARS } from './payments.js';
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
    const who = receiverLabel(player);
    if (!wants(who, organizer)) continue;
    const amount = Number(player.amount) || 0;
    total += amount;
    count += 1;
    const match = matchOf(player, matches);
    const key = monthKeyOf(match?.date || player.matchDate);
    if (key) months.set(key, (months.get(key) || 0) + amount);
    const bucket = by.get(who) || { name: who, amount: 0, count: 0 };
    bucket.amount += amount;
    bucket.count += 1;
    by.set(who, bucket);
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
    if (!people.has(key)) people.set(key, { key, name: name || 'Sin nombre', fromRoster: false, paid: new Map(), signups: new Map() });
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
      const who = receiverLabel(player);
      if (wants(who, organizer)) {
        const cur = row.paid.get(who) || { name: who, amount: 0, count: 0 };
        cur.amount += Number(player.amount) || 0;
        cur.count += 1;
        row.paid.set(who, cur);
      }
    }
  }
  const list = [];
  for (const row of people.values()) {
    const paid = [...row.paid.values()].sort((a, b) => b.amount - a.amount || foldText(a.name).localeCompare(foldText(b.name), 'es'));
    const signups = [...row.signups.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || foldText(a.name).localeCompare(foldText(b.name), 'es'));
    if (!paid.length && !signups.length) continue;
    list.push({
      key: row.key,
      name: row.name,
      paid,
      signups,
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
    if (!map.has(key)) map.set(key, { name: key, collected: 0, added: 0 });
    return map.get(key);
  };
  for (const player of players || []) {
    bump(addedByLabel(player)).added += 1;
    if (player.paid === true) bump(receiverLabel(player)).collected += Number(player.amount) || 0;
  }
  return [...map.values()].sort((a, b) => b.collected - a.collected || b.added - a.added || foldText(a.name).localeCompare(foldText(b.name), 'es'));
}

/** Lo que anotó y lo que cobró una persona. El nombre se compara sin acentos. */
export function mineSummary(players, name) {
  let added = 0;
  let amount = 0;
  for (const player of players || []) {
    if (sameOrganizer(player.addedBy, name)) added += 1;
    if (player.paid === true && sameOrganizer(player.receivedBy, name)) amount += Number(player.amount) || 0;
  }
  return { added, amount, text: `Anotaste ${added} · Cobraste ${formatARS(amount)}` };
}

/** true si hay un pago sin cobrador o un alta sin "Agregó", para mostrar el filtro. */
export function hasUnspecified({ players, phone = null }) {
  const list = phone ? ofPhone(phone, players) : (players || []);
  return list.some((player) => (player.paid === true && receiverLabel(player) === UNSPECIFIED) || addedByLabel(player) === UNSPECIFIED);
}
