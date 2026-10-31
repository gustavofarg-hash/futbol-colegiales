// Cálculo de compensación del día entre organizadores. Puro.
import { awaitingItems, isFreePlay, paymentParts, paymentShares, roundARS } from './payments.js';

export function splitModeOf(match) {
  return match?.splitMode === 'signed' ? 'signed' : 'equal';
}

export function playerNeedsPayState(player) {
  if (!player || player.waiting === true) return false;
  if (isFreePlay(player)) return false;
  const parts = paymentParts(player);
  const waiting = awaitingItems(player).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return !(parts.received > 0 || parts.pending > 0 || waiting > 0);
}

function addMoney(map, uid, name, amount) {
  const money = roundARS(amount);
  if (!(money > 0) || !uid) return;
  const row = map.get(uid) || { uid, name: name || '', collected: 0, entitled: 0 };
  if (name && !row.name) row.name = name;
  row.collected = roundARS(row.collected + money);
  map.set(uid, row);
}

function addEntitled(map, uid, name, amount) {
  const money = roundARS(amount);
  if (!uid) return;
  const row = map.get(uid) || { uid, name: name || '', collected: 0, entitled: 0 };
  if (name) row.name = name;
  row.entitled = roundARS(row.entitled + money);
  map.set(uid, row);
}

/** Quién puede anotar. Si el partido es de todos, son todos los organizadores activos. */
export function matchAdders(match, staff) {
  const people = (staff || []).filter((user) => user?.uid && user.active !== false);
  const adders = Array.isArray(match?.adders) ? match.adders : [];
  const open = !adders.length || adders.includes('*');
  if (open) return people.map((user) => ({ uid: user.uid, name: user.name || '' }));
  const ids = new Set(adders.filter((uid) => uid && uid !== '*'));
  if (match?.createdByUid) ids.add(match.createdByUid);
  return people.filter((user) => ids.has(user.uid)).map((user) => ({ uid: user.uid, name: user.name || '' }));
}

function staffByName(staff) {
  const list = staff || [];
  return (name) => {
    const wanted = String(name || '').trim().toLowerCase();
    if (!wanted) return null;
    return list.find((user) => String(user.name || '').trim().toLowerCase() === wanted) || null;
  };
}

function playerAmount(player) {
  if (!player || player.waiting === true || isFreePlay(player)) return 0;
  const parts = paymentParts(player);
  const waiting = awaitingItems(player).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  return roundARS(parts.received + parts.pending + waiting);
}

/** Lo cobrado, incluido lo pendiente de transferir y lo pendiente de confirmar. */
export function collectedSlices(player, staff) {
  if (!player || player.waiting === true || isFreePlay(player)) return [];
  const find = staffByName(staff);
  const slices = [];
  for (const share of paymentShares(player)) {
    if (!(share.amount > 0)) continue;
    const user = find(share.name);
    slices.push({ uid: user?.uid || '', name: user?.name || share.name || '', amount: roundARS(share.amount) });
  }
  for (const item of awaitingItems(player)) {
    const user = find(item.to) || (staff || []).find((row) => row.uid === item.toUid);
    slices.push({ uid: user?.uid || item.toUid || '', name: user?.name || item.to || '', amount: roundARS(item.amount) });
  }
  return slices.filter((slice) => slice.amount > 0);
}

function splitEqual(total, people) {
  const count = people.length;
  if (!count) return [];
  const cents = Math.round(roundARS(total) * 100);
  const base = Math.floor(cents / count);
  let rem = cents - base * count;
  return people.map((person) => {
    const extra = rem > 0 ? 1 : 0;
    if (rem > 0) rem -= 1;
    return { ...person, amount: (base + extra) / 100 };
  });
}

export function matchCompensation(match, players, staff) {
  const people = (players || []).filter((player) => player.matchId === match.id && player.waiting !== true);
  const missing = people.filter(playerNeedsPayState).map((player) => ({
    playerId: player.id,
    name: player.name || 'Jugador',
    matchId: match.id,
  }));
  const rows = new Map();
  const adders = matchAdders(match, staff);
  for (const person of adders) addEntitled(rows, person.uid, person.name, 0);
  let total = 0;
  for (const player of people) {
    const amount = playerAmount(player);
    total = roundARS(total + amount);
    for (const slice of collectedSlices(player, staff)) addMoney(rows, slice.uid, slice.name, slice.amount);
  }
  if (splitModeOf(match) === 'signed') {
    for (const player of people) {
      const amount = playerAmount(player);
      const name = player.signedUpWithName || player.addedBy || '';
      const user = staffByName(staff)(name);
      if (user) addEntitled(rows, user.uid, user.name, amount);
      else if (name && amount > 0) addEntitled(rows, `name:${name.toLowerCase()}`, name, amount);
    }
  } else {
    const ordered = [...adders].sort((a, b) => a.name.localeCompare(b.name, 'es') || a.uid.localeCompare(b.uid));
    for (const share of splitEqual(total, ordered)) addEntitled(rows, share.uid, share.name, share.amount);
  }
  return { missing, total, rows: [...rows.values()] };
}

export function dayCompensation(matches, players, staff) {
  const active = (matches || []).filter((match) => match?.cancelled !== true);
  const missing = [];
  const rows = new Map();
  for (const match of active) {
    const one = matchCompensation(match, players, staff);
    missing.push(...one.missing.map((item) => ({ ...item, date: match.date, time: match.time })));
    for (const row of one.rows) {
      const prev = rows.get(row.uid) || { uid: row.uid, name: row.name, collected: 0, entitled: 0 };
      if (row.name) prev.name = row.name;
      prev.collected = roundARS(prev.collected + row.collected);
      prev.entitled = roundARS(prev.entitled + row.entitled);
      rows.set(row.uid, prev);
    }
  }
  const list = [...rows.values()].filter((row) => row.collected > 0 || row.entitled > 0).sort((a, b) => a.name.localeCompare(b.name));
  return { missing, rows: list, transfers: missing.length ? [] : minimalTransfers(list) };
}

/** Quién cobró de más le pasa la diferencia a quien cobró de menos. Lista mínima. */
export function minimalTransfers(rows) {
  const extra = (rows || []).filter((row) => row.collected > row.entitled).map((row) => ({ ...row, left: roundARS(row.collected - row.entitled) })).sort((a, b) => b.left - a.left || a.uid.localeCompare(b.uid));
  const short = (rows || []).filter((row) => row.entitled > row.collected).map((row) => ({ ...row, left: roundARS(row.entitled - row.collected) })).sort((a, b) => b.left - a.left || a.uid.localeCompare(b.uid));
  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < extra.length && j < short.length) {
    const amount = roundARS(Math.min(extra[i].left, short[j].left));
    if (amount > 0) {
      transfers.push({
        fromUid: extra[i].uid,
        fromName: extra[i].name,
        toUid: short[j].uid,
        toName: short[j].name,
        amount,
        doneAt: null,
        stale: false,
        removed: false,
      });
    }
    extra[i].left = roundARS(extra[i].left - amount);
    short[j].left = roundARS(short[j].left - amount);
    if (!(extra[i].left > 0)) i += 1;
    if (!(short[j].left > 0)) j += 1;
  }
  return transfers;
}

export function compensationFingerprint(matches, players, staff) {
  const body = {
    matches: (matches || []).map((match) => ({
      id: match.id, date: match.date, cancelled: match.cancelled === true, split: splitModeOf(match),
      adders: match.adders || [], price: match.price ?? null, createdByUid: match.createdByUid || '',
    })),
    players: (players || []).filter((player) => player.waiting !== true).map((player) => ({
      id: player.id, matchId: player.matchId, free: player.freePlay === true, signed: player.signedUpWith || '',
      added: player.addedBy || '', paid: player.paid === true, amount: player.amount ?? null,
      cash: player.cash ?? null, transfer: player.transfer ?? null, pending: player.pendingTransfer ?? null,
      credit: player.fromCredit ?? null, cashTo: player.cashTo || '', transferTo: player.transferTo || '',
      pendingTo: player.pendingTo || '', creditTo: player.creditTo || '', receivedBy: player.receivedBy || '',
      parts: player.transferParts || null, awaiting: player.awaiting || null,
    })),
    staff: (staff || []).map((user) => user.uid).sort(),
  };
  return JSON.stringify(body);
}

export function reconcileTransfers(previous, next) {
  const prev = previous || [];
  const fresh = (next || []).map((transfer) => {
    const old = prev.find((item) => item.fromUid === transfer.fromUid && item.toUid === transfer.toUid && !item.removed);
    if (!old?.doneAt) return { ...transfer, doneAt: old?.doneAt || null, stale: false, removed: false };
    return { ...transfer, doneAt: old.doneAt, stale: old.amount !== transfer.amount, removed: false };
  });
  for (const old of prev) {
    if (!old.doneAt || old.removed) continue;
    if (fresh.some((item) => item.fromUid === old.fromUid && item.toUid === old.toUid)) continue;
    fresh.push({ ...old, stale: true, removed: true });
  }
  return fresh;
}
