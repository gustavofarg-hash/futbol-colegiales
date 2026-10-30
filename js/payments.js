// Pagos por jugador. Funciones puras: la UI y el store las usan igual,
// y las pruebas no necesitan el navegador ni Firebase.
//
// En el documento del jugador (players/{id}):
//   paid: bool                      (true solo si ya se cobró algo)
//   amount: number | null           (pesos cobrados: efectivo + transferencia)
//   method: "efectivo" | "transferencia" | null
//   cash: number | null             (efectivo cobrado; 0 si el formulario nuevo no usó efectivo)
//   transfer: number | null         (transferencia cobrada)
//   pendingTransfer: number | null  (prometió transferir; NO entra en amount)
//   transferReceivedAt: number | null
//   transferReceivedBy: string | null
//   cashTo: string | null           (quién cobró el efectivo)
//   transferTo: string | null       (quién cobró la transferencia, si es uno solo)
//   transferParts: { to, amount }[] | null  (transferencias a organizadores distintos)
//   pendingTo: string | null        (a quién le va a transferir)
//   receivedBy: string | null       (quién cobró; null = sin especificar)
//   paidUpdatedBy: string
//   paidUpdatedAt: number           (epoch ms)
//
// Un pago viejo no tiene cash/transfer/pendingTransfer: se lee entero
// como efectivo o como transferencia según method.
// Si no hay cashTo/transferTo/pendingTo/transferParts, receivedBy vale
// para el efectivo y para la transferencia.

import { sameOrganizer } from './organizers.js';

export const MAX_AMOUNT = 1_000_000_000;
export const MAX_TRANSFER_PARTS = 6;
export const PAYMENT_METHODS = ['efectivo', 'transferencia'];
const METHOD_LABEL = { efectivo: 'Efectivo', transferencia: 'Transferencia', credito: 'Crédito' };

export function roundARS(n) {
  return Math.round(Number(n) * 100) / 100;
}

/**
 * Reparte un monto en orden. Cada uno recibe como máximo lo que debe.
 * Lo que no alcanza deja en cero a los últimos. Lo que sobra no se asigna.
 */
export function allocateAcrossDebts(amount, dues) {
  let left = roundARS(Math.max(0, Number(amount) || 0));
  const parts = (dues || []).map((due) => {
    const cap = Math.max(0, roundARS(Number(due) || 0));
    const give = Math.min(cap, left);
    left = roundARS(left - give);
    return give;
  });
  return { parts, left };
}

/**
 * Un pago de deudas viejas cubre primero el partido más viejo.
 * Cada parte (efectivo, transferencia, pendiente, crédito) sigue sobre lo que queda.
 * debts ya vienen ordenadas de la más vieja a la más nueva.
 */
export function settleOldestDebts({ cash = 0, transfer = 0, pending = 0, credit = 0, debts = [] } = {}) {
  let leftOwed = (debts || []).map((debt) => Math.max(0, roundARS(Number(debt?.owed) || 0)));
  const take = (amount) => {
    const split = allocateAcrossDebts(amount, leftOwed);
    leftOwed = leftOwed.map((due, i) => roundARS(due - split.parts[i]));
    return split;
  };
  const cashSplit = take(cash);
  const transferSplit = take(transfer);
  const pendingSplit = take(pending);
  const creditSplit = take(credit);
  const rows = (debts || []).map((debt, i) => {
    const applied = roundARS(cashSplit.parts[i] + transferSplit.parts[i] + pendingSplit.parts[i] + creditSplit.parts[i]);
    return {
      ...debt,
      cash: cashSplit.parts[i],
      transfer: transferSplit.parts[i],
      pending: pendingSplit.parts[i],
      credit: creditSplit.parts[i],
      applied,
    };
  }).filter((row) => row.applied > 0);
  return {
    rows,
    left: roundARS(cashSplit.left + transferSplit.left + pendingSplit.left + creditSplit.left),
  };
}

/**
 * Lo que sobra de un pago dividido (efectivo y transferencia ya cobrados)
 * queda como saldo a favor de quien paga, con el organizador que lo recibió.
 */
export function splitLeftoverCredit({ playerName, cashLeft = 0, cashTo = '', transferLeft = 0, transferTo = '' } = {}) {
  const items = [];
  const push = (amount, name) => {
    const n = roundARS(amount);
    const who = String(name || '').trim();
    if (!(n > 0) || !who) return;
    const found = items.find((item) => sameOrganizer(item.name, who));
    if (found) found.amount = roundARS(found.amount + n);
    else items.push({ name: who, amount: n });
  };
  push(cashLeft, cashTo);
  push(transferLeft, transferTo);
  const name = String(playerName || '').trim() || 'el jugador';
  return items.map((item) => ({
    ...item,
    text: `Sobra ${formatARS(item.amount)}: queda como saldo a favor de ${name} con ${item.name}.`,
  }));
}

/** "Se aplicó $5.000 a 01/10 21:00 y $2.000 a 08/10 21:00". */
export function settlementSummary(rows) {
  const applied = (rows || []).filter((row) => row.applied > 0 && row.label);
  if (!applied.length) return '';
  const bits = applied.map((row) => `${formatARS(row.applied)} a ${row.label}`);
  if (bits.length === 1) return `Se aplicó ${bits[0]}`;
  const last = bits.pop();
  return `Se aplicó ${bits.join(', ')} y ${last}`;
}

/** "$5.000" / "$5.000,50" — separador de miles "." y decimales ",". */
export function formatARS(amount) {
  const n = roundARS(amount);
  if (!Number.isFinite(n)) return '$0';
  const neg = n < 0;
  const abs = Math.abs(n);
  const cents = Math.round((abs - Math.trunc(abs)) * 100);
  const intPart = Math.trunc(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const body = cents ? `${intPart},${String(cents).padStart(2, '0')}` : intPart;
  return `${neg ? '-' : ''}$${body}`;
}

/**
 * Acepta 5000, 5.000, 5.000,50, 5000,50, $5.000 y 5000.50.
 * Devuelve { ok, amount } o { ok:false, error }.
 */
export function parseAmount(raw) {
  let s = String(raw ?? '').trim().replace(/\s+/g, '').replace(/^\$/, '');
  if (!s) return { ok: false, error: 'Poné el monto.' };
  let normalized;
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s) || /^\d+(,\d{1,2})?$/.test(s)) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d+\.\d{1,2}$/.test(s)) {
    normalized = s;
  } else {
    return { ok: false, error: 'El monto no es válido.' };
  }
  const n = Number(normalized);
  if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) return { ok: false, error: 'El monto no es válido.' };
  return { ok: true, amount: roundARS(n) };
}

export function methodLabel(method) {
  return METHOD_LABEL[method] || '';
}

function finiteMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? roundARS(n) : 0;
}

/** Juega gratis: no debe nada, aunque el documento viejo todavía tenga montos. */
export function isFreePlay(player) {
  return player?.freePlay === true;
}

/** true si el documento ya usa efectivo / transferencia / pendiente por separado. */
export function isSplitPayment(player) {
  if (!player) return false;
  return player.cash != null || player.transfer != null || player.pendingTransfer != null || player.fromCredit != null;
}

/**
 * Partes del pago. En un pago viejo, todo el monto va a efectivo o a transferencia.
 * received es solo lo cobrado. pending no entra ahí.
 */
export function paymentParts(player) {
  const empty = { cash: 0, transfer: 0, pending: 0, credit: 0, received: 0, split: false };
  if (!player || isFreePlay(player)) return empty;
  if (!isSplitPayment(player)) {
    if (player.paid !== true) return empty;
    const received = finiteMoney(player.amount);
    if (player.method === 'transferencia') return { ...empty, transfer: received, received };
    if (player.method === 'efectivo') return { ...empty, cash: received, received };
    if (player.method === 'credito') return { ...empty, credit: received, received };
    return { ...empty, received };
  }
  const cash = finiteMoney(player.cash);
  const transfer = finiteMoney(player.transfer);
  const pending = finiteMoney(player.pendingTransfer);
  const credit = finiteMoney(player.fromCredit);
  return { cash, transfer, pending, credit, received: roundARS(cash + transfer + credit), split: true };
}

export function sumParts(players) {
  const acc = { cash: 0, transfer: 0, pending: 0, received: 0 };
  for (const player of players || []) {
    const parts = paymentParts(player);
    acc.cash = roundARS(acc.cash + parts.cash);
    acc.transfer = roundARS(acc.transfer + parts.transfer);
    acc.pending = roundARS(acc.pending + parts.pending);
    acc.received = roundARS(acc.received + parts.received);
  }
  return acc;
}

/** true si el pago ya dice quién cobró cada parte. */
export function hasPaymentDirection(player) {
  if (!player) return false;
  return player.cashTo != null || player.transferTo != null || player.pendingTo != null || player.creditTo != null
    || (Array.isArray(player.transferParts) && player.transferParts.length > 0);
}

/**
 * Cada parte con su organizador. Sin los campos nuevos, receivedBy cubre
 * efectivo y transferencia, y lo pendiente queda en quien lo anotó (paidUpdatedBy).
 */
export function paymentShares(player) {
  const parts = paymentParts(player);
  const directed = hasPaymentDirection(player);
  const legacy = String(player?.receivedBy || '').trim();
  const shares = [];
  if (!parts.split && parts.received > 0 && parts.cash === 0 && parts.transfer === 0 && parts.credit === 0) {
    shares.push({ kind: 'received', name: legacy, amount: parts.received });
  }
  if (parts.cash > 0) {
    shares.push({ kind: 'cash', name: directed ? String(player?.cashTo || '').trim() : legacy, amount: parts.cash });
  }
  if (parts.transfer > 0) {
    if (Array.isArray(player?.transferParts) && player.transferParts.length) {
      for (const part of player.transferParts) {
        const amount = finiteMoney(part?.amount);
        if (amount > 0) shares.push({ kind: 'transfer', name: String(part?.to || '').trim(), amount });
      }
    } else {
      shares.push({
        kind: 'transfer',
        name: directed ? String(player?.transferTo || '').trim() : legacy,
        amount: parts.transfer,
      });
    }
  }
  if (parts.credit > 0) {
    shares.push({ kind: 'credit', name: String(player?.creditTo || '').trim(), amount: parts.credit });
  }
  if (parts.pending > 0) {
    const name = directed ? String(player?.pendingTo || '').trim() : String(player?.paidUpdatedBy || '').trim();
    shares.push({ kind: 'pending', name, amount: parts.pending });
  }
  return shares;
}

function uniqueNames(names) {
  const out = [];
  for (const name of names) {
    if (out.some((have) => sameOrganizer(have, name) || (!have && !name))) continue;
    out.push(name || '');
  }
  return out;
}

/** "Transfiere después $1.500", o "" si no hay nada pendiente. */
export function pendingStatusText(player) {
  const pending = paymentParts(player).pending;
  if (pending <= 0) return '';
  const base = `Transfiere después ${formatARS(pending)}`;
  if (!hasPaymentDirection(player)) return base;
  const name = String(player?.pendingTo || '').trim();
  return name ? `${base} · a ${name}` : base;
}

function paidPartText(parts) {
  const bits = [];
  if (parts.cash > 0) bits.push(`Efectivo ${formatARS(parts.cash)}`);
  if (parts.transfer > 0) bits.push(`Transferencia ${formatARS(parts.transfer)}`);
  if (parts.credit > 0) bits.push(`Crédito ${formatARS(parts.credit)}`);
  return bits.join(' · ');
}

function directedStatusText(player) {
  const parts = paymentParts(player);
  if (parts.received <= 0) return '';
  const shares = paymentShares(player).filter((share) => share.kind !== 'pending');
  const names = uniqueNames(shares.map((share) => share.name));
  const amount = formatARS(parts.received);
  if (names.length <= 1) {
    let base;
    if (parts.cash > 0 && parts.transfer === 0 && parts.credit === 0) base = `Pagó ${amount} · Efectivo`;
    else if (parts.transfer > 0 && parts.cash === 0 && parts.credit === 0) base = `Pagó ${amount} · Transferencia`;
    else if (parts.credit > 0 && parts.cash === 0 && parts.transfer === 0) base = `Pagó ${amount} · Crédito`;
    else base = `Pagó ${amount} · ${paidPartText(parts)}`;
    return names[0] ? `${base} · cobró ${names[0]}` : base;
  }
  const bits = [`Pagó ${amount}`];
  for (const share of shares) {
    const label = share.kind === 'cash' ? 'Efectivo' : share.kind === 'credit' ? 'Crédito' : 'Transferencia';
    const who = share.name ? ` · cobró ${share.name}` : '';
    bits.push(`${label} ${formatARS(share.amount)}${who}`);
  }
  return bits.join(' · ');
}

function receivedStatusText(player) {
  if (!player) return '';
  if (hasPaymentDirection(player)) return directedStatusText(player);
  const parts = paymentParts(player);
  if (!parts.split) {
    if (player.paid !== true && player.paid !== false) return '';
    if (player.paid === false) return 'No pagó';
    const amount = player.amount != null && player.amount !== '' ? formatARS(player.amount) : '';
    const method = methodLabel(player.method);
    const head = ['Pagó', amount].filter(Boolean).join(' ');
    const base = method ? `${head} · ${method}` : head;
    const receiver = String(player.receivedBy || '').trim();
    return receiver ? `${base} · cobró ${receiver}` : base;
  }
  if (parts.received <= 0) return '';
  const amount = formatARS(parts.received);
  let base;
  if (parts.cash > 0 && parts.transfer === 0 && parts.credit === 0) base = `Pagó ${amount} · Efectivo`;
  else if (parts.transfer > 0 && parts.cash === 0 && parts.credit === 0) base = `Pagó ${amount} · Transferencia`;
  else if (parts.credit > 0 && parts.cash === 0 && parts.transfer === 0) base = `Pagó ${amount} · Crédito`;
  else base = `Pagó ${amount} · ${paidPartText(parts)}`;
  const receiver = String(player.receivedBy || '').trim();
  return receiver ? `${base} · cobró ${receiver}` : base;
}

/** Texto para la fila y para la lista copiada. Incluye lo pendiente. Vacío si todavía no se cargó. */
export function paymentStatusText(player) {
  if (isFreePlay(player)) return 'Juega gratis';
  const pending = pendingStatusText(player);
  const head = receivedStatusText(player);
  if (pending && head && head !== 'No pagó') return `${head} · ${pending}`;
  if (pending) return pending;
  return head;
}

/** Lo que va en verde en la fila, sin repetir el cartel de pendiente. */
export function paymentHeadline(player) {
  const pending = pendingStatusText(player);
  const full = paymentStatusText(player);
  if (!pending) return full;
  if (full === pending) return '';
  return full.endsWith(pending) ? full.slice(0, -pending.length).replace(/ ·\s*$/, '') : full;
}

/** "Recaudado: $45.000 · 9/14 pagaron", o "" si nadie tiene un pago cargado.
 * Quien juega gratis no debe: no suma plata ni entra en el "faltan pagar". */
export function collectedLine(players) {
  const list = players || [];
  const free = list.filter((p) => isFreePlay(p)).length;
  const paying = list.filter((p) => !isFreePlay(p));
  const pending = sumParts(paying).pending;
  const freeText = free ? (free === 1 ? '1 juega gratis' : `${free} juegan gratis`) : '';
  if (!paying.some((p) => p.paid === true || p.paid === false) && pending <= 0) {
    return freeText;
  }
  const paid = paying.filter((p) => p.paid === true);
  const total = paid.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const base = paying.length
    ? `Recaudado: ${formatARS(total)} · ${paid.length}/${paying.length} pagaron`
    : `Recaudado: ${formatARS(0)}`;
  const bits = [base];
  if (freeText) bits.push(freeText);
  if (pending > 0) bits.push(`Transfiere después: ${formatARS(pending)}`);
  return bits.join(' · ');
}

/**
 * Campos para mergear en el jugador. No toca nombre, teléfono ni partido.
 * { ok:true, patch } o { ok:false, error }.
 */
function receiverValue(input) {
  if (input?.receivedBy == null || String(input.receivedBy).trim() === '') return null;
  const name = String(input.receivedBy).trim().replace(/\s+/g, ' ');
  if (name.length > 40) return { error: 'El nombre de quien cobró es muy largo.' };
  return name;
}

function nameField(value) {
  if (value == null || String(value).trim() === '') return null;
  const name = String(value).trim().replace(/\s+/g, ' ');
  if (name.length > 40) return { error: 'El nombre de quien cobró es muy largo.' };
  return name;
}

function usesSplitInput(input) {
  return !!input && (input.split === true || 'cash' in input || 'transfer' in input || 'pendingTransfer' in input || 'fromCredit' in input);
}

function moneyField(value, error) {
  if (value == null || value === '') return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) return { error };
  return roundARS(value);
}

function methodOfParts(cash, transfer, credit = 0) {
  const on = [];
  if (cash > 0) on.push('efectivo');
  if (transfer > 0) on.push('transferencia');
  if (credit > 0) on.push('credito');
  return on.length === 1 ? on[0] : null;
}

function freePlayPatch(who, now) {
  return {
    paidUpdatedBy: String(who || ''),
    paidUpdatedAt: now,
    paid: true,
    freePlay: true,
    amount: null,
    method: null,
    receivedBy: null,
    cash: null,
    transfer: null,
    pendingTransfer: null,
    transferReceivedAt: null,
    transferReceivedBy: null,
    cashTo: null,
    transferTo: null,
    pendingTo: null,
    transferParts: null,
    fromCredit: null,
    creditTo: null,
  };
}

function freeFlag(input) {
  if (!input || !('freePlay' in input)) return {};
  return { freePlay: input.freePlay === true };
}

export function paymentRecord(input, who, now = Date.now()) {
  if (input?.freePlay === true) return { ok: true, patch: freePlayPatch(who, now) };
  if (!usesSplitInput(input)) return legacyPaymentRecord(input, who, now);
  const paid = input?.paid;
  if (paid !== true && paid !== false) return { ok: false, error: 'Indicá si pagó.' };
  const stamp = { paidUpdatedBy: String(who || ''), paidUpdatedAt: now };
  const cleared = {
    ...stamp,
    ...freeFlag(input),
    paid: false,
    amount: null,
    method: null,
    receivedBy: null,
    cash: null,
    transfer: null,
    pendingTransfer: null,
    transferReceivedAt: null,
    transferReceivedBy: null,
    cashTo: null,
    transferTo: null,
    pendingTo: null,
    transferParts: null,
    fromCredit: null,
    creditTo: null,
  };
  if (paid === false) return { ok: true, patch: cleared };
  const cash = moneyField(input.cash, 'Efectivo inválido.');
  if (typeof cash === 'object') return { ok: false, error: cash.error };
  const transfer = moneyField(input.transfer, 'Transferencia inválida.');
  if (typeof transfer === 'object') return { ok: false, error: transfer.error };
  const pending = moneyField(input.pendingTransfer, 'Monto inválido.');
  if (typeof pending === 'object') return { ok: false, error: pending.error };
  const credit = moneyField(input.fromCredit, 'Crédito inválido.');
  if (typeof credit === 'object') return { ok: false, error: credit.error };
  if (cash + transfer + pending + credit <= 0) return { ok: false, error: 'Poné un monto.' };
  let creditTo = null;
  if (credit > 0) {
    const creditName = nameField(input.creditTo || who);
    if (creditName && typeof creditName === 'object') return { ok: false, error: creditName.error };
    creditTo = creditName;
  }
  const directed = 'cashTo' in input || 'transferTo' in input || 'pendingTo' in input || 'transferParts' in input;
  let cashTo = null;
  let transferTo = null;
  let pendingTo = null;
  let transferParts = null;
  let receivedBy;
  if (directed) {
    const cashName = cash > 0 ? nameField(input.cashTo) : null;
    if (cashName && typeof cashName === 'object') return { ok: false, error: cashName.error };
    cashTo = cashName;
    const pendingName = pending > 0 ? nameField(input.pendingTo) : null;
    if (pendingName && typeof pendingName === 'object') return { ok: false, error: pendingName.error };
    pendingTo = pendingName;
    if (transfer > 0 && Array.isArray(input.transferParts) && input.transferParts.length > 1) {
      if (input.transferParts.length > MAX_TRANSFER_PARTS) return { ok: false, error: 'Demasiados cobros de transferencia.' };
      const built = [];
      for (const part of input.transferParts) {
        const amount = moneyField(part?.amount, 'Transferencia inválida.');
        if (typeof amount === 'object') return { ok: false, error: amount.error };
        const to = nameField(part?.to);
        if (to && typeof to === 'object') return { ok: false, error: to.error };
        if (amount > 0 && to) built.push({ to, amount });
      }
      const sum = roundARS(built.reduce((acc, part) => acc + part.amount, 0));
      if (built.length > 1 && sum === transfer) {
        transferParts = built;
        transferTo = null;
      }
    }
    if (!transferParts && transfer > 0) {
      const transferName = nameField(input.transferTo);
      if (transferName && typeof transferName === 'object') return { ok: false, error: transferName.error };
      transferTo = transferName;
    }
    const who = [];
    if (cashTo) who.push(cashTo);
    if (transferParts) who.push(...transferParts.map((part) => part.to));
    else if (transferTo) who.push(transferTo);
    if (creditTo) who.push(creditTo);
    const names = uniqueNames(who);
    receivedBy = names.length === 1 && names[0] ? names[0] : null;
  } else {
    receivedBy = receiverValue(input);
    if (receivedBy && typeof receivedBy === 'object') return { ok: false, error: receivedBy.error };
  }
  const received = roundARS(cash + transfer + credit);
  return {
    ok: true,
    patch: {
      ...stamp,
      ...freeFlag(input),
      paid: received > 0,
      amount: received > 0 ? received : null,
      method: methodOfParts(cash, transfer, credit),
      receivedBy: received > 0 ? receivedBy : null,
      cash,
      transfer,
      pendingTransfer: pending > 0 ? pending : null,
      cashTo,
      transferTo,
      pendingTo,
      transferParts,
      fromCredit: credit > 0 ? credit : null,
      creditTo: credit > 0 ? creditTo : null,
      transferReceivedAt: null,
      transferReceivedBy: null,
    },
  };
}

function legacyPaymentRecord(input, who, now) {
  const paid = input?.paid;
  if (paid !== true && paid !== false) return { ok: false, error: 'Indicá si pagó.' };
  const stamp = { paidUpdatedBy: String(who || ''), paidUpdatedAt: now };
  if (paid === false) return { ok: true, patch: { ...stamp, ...freeFlag(input), paid: false, amount: null, method: null, receivedBy: null } };
  const amount = input.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
    return { ok: false, error: 'Monto inválido.' };
  }
  if (input.method !== 'efectivo' && input.method !== 'transferencia') {
    return { ok: false, error: 'Elegí Efectivo o Transferencia.' };
  }
  const receivedBy = receiverValue(input);
  if (receivedBy && typeof receivedBy === 'object') return { ok: false, error: receivedBy.error };
  return { ok: true, patch: { ...stamp, ...freeFlag(input), paid: true, amount: roundARS(amount), method: input.method, receivedBy } };
}

function legacyReceiver(player) {
  return String(player?.receivedBy || '').trim();
}

function transferBuckets(player, parts) {
  if (Array.isArray(player?.transferParts) && player.transferParts.length) {
    return player.transferParts
      .map((part) => ({ to: String(part?.to || '').trim(), amount: finiteMoney(part?.amount) }))
      .filter((part) => part.amount > 0 && part.to);
  }
  if (parts.transfer <= 0) return [];
  const to = hasPaymentDirection(player) ? String(player?.transferTo || '').trim() : legacyReceiver(player);
  return to ? [{ to, amount: parts.transfer }] : [{ to: '', amount: parts.transfer }];
}

function mergeTransfer(buckets, to, amount) {
  const name = String(to || '').trim();
  const next = buckets.map((part) => ({ ...part }));
  const found = next.find((part) => sameOrganizer(part.to, name) || (!part.to && !name));
  if (found) found.amount = roundARS(found.amount + amount);
  else next.push({ to: name, amount });
  return next.filter((part) => part.amount > 0);
}

/** Pasa "Transfiere después" a transferencia cobrada. No toca el efectivo. */
export function receivePendingTransfer(player, who, now = Date.now()) {
  const parts = paymentParts(player);
  if (parts.pending <= 0) return { ok: false, error: 'No hay transferencia pendiente.' };
  const directed = hasPaymentDirection(player);
  const clicker = String(who || '').trim();
  const pendingTo = directed
    ? String(player?.pendingTo || '').trim()
    : String(player?.paidUpdatedBy || '').trim() || clicker;
  const cash = parts.split ? parts.cash : (player?.method === 'efectivo' && player?.paid === true ? parts.received : 0);
  const cashTo = cash > 0 ? (directed ? String(player?.cashTo || '').trim() : legacyReceiver(player)) : '';
  const buckets = mergeTransfer(transferBuckets(player, parts).filter((part) => part.to || parts.transfer > 0), pendingTo || clicker, parts.pending);
  const named = buckets.filter((part) => part.to);
  const useParts = named.length > 1;
  const transfer = roundARS(buckets.reduce((sum, part) => sum + part.amount, 0));
  const transferTo = useParts ? null : (named[0]?.to || pendingTo || clicker || null);
  const receivedNames = uniqueNames([
    ...(cash > 0 && cashTo ? [cashTo] : []),
    ...named.map((part) => part.to),
  ]);
  const received = roundARS(cash + transfer);
  return {
    ok: true,
    patch: {
      paid: true,
      amount: received,
      method: methodOfParts(cash, transfer),
      cash,
      cashTo: cash > 0 ? (cashTo || null) : null,
      transfer,
      transferTo,
      transferParts: useParts ? named.map((part) => ({ to: part.to, amount: part.amount })) : null,
      pendingTransfer: null,
      pendingTo: null,
      transferReceivedAt: now,
      transferReceivedBy: clicker || null,
      receivedBy: receivedNames.length === 1 ? receivedNames[0] : null,
      paidUpdatedBy: clicker,
      paidUpdatedAt: now,
    },
  };
}

/**
 * Varios jugadores (él y cada invitado, o los partidos de una promo) no van
 * en un lote: cada updateDoc es un request aparte, uno después del otro.
 * Un lote suma los get() de las reglas y Firestore lo niega al pasar de 20.
 * El emulador no aplica ese tope.
 */
export async function writePaymentsInOrder(entries, write) {
  for (const entry of entries || []) {
    try {
      await write(entry);
    } catch (error) {
      const fail = error instanceof Error ? error : new Error(String(error?.message || error || 'error'));
      fail.playerId = entry?.id || '';
      fail.paymentWrite = true;
      if (error && error.code && !fail.code) fail.code = error.code;
      throw fail;
    }
  }
}

/** El aviso dice el documento y el código de Firestore, no un texto genérico de reglas. */
export function paymentFailureText(error, playerId) {
  const code = String(error?.code || 'error').replace(/^firestore\//, '');
  const id = String(playerId || error?.playerId || '').trim();
  const where = id ? ` en players/${id}` : '';
  const raw = String(error?.message || '').replace(/^FirebaseError:\s*/i, '').trim();
  const generic = !raw || raw === code || /missing or insufficient permissions/i.test(raw);
  if (code === 'invalid-payment' && !generic) return raw;
  if (!generic) return `No se pudo guardar el pago${where} (${code}). ${raw}`;
  return `No se pudo guardar el pago${where} (${code}).`;
}
