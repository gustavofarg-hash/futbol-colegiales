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
//   receivedBy: string | null       (quién cobró; null = sin especificar)
//   paidUpdatedBy: string
//   paidUpdatedAt: number           (epoch ms)
//
// Un pago viejo no tiene cash/transfer/pendingTransfer: se lee entero
// como efectivo o como transferencia según method.

export const MAX_AMOUNT = 1_000_000_000;
export const PAYMENT_METHODS = ['efectivo', 'transferencia'];
const METHOD_LABEL = { efectivo: 'Efectivo', transferencia: 'Transferencia' };

export function roundARS(n) {
  return Math.round(Number(n) * 100) / 100;
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

/** true si el documento ya usa efectivo / transferencia / pendiente por separado. */
export function isSplitPayment(player) {
  if (!player) return false;
  return player.cash != null || player.transfer != null || player.pendingTransfer != null;
}

/**
 * Partes del pago. En un pago viejo, todo el monto va a efectivo o a transferencia.
 * received es solo lo cobrado. pending no entra ahí.
 */
export function paymentParts(player) {
  const empty = { cash: 0, transfer: 0, pending: 0, received: 0, split: false };
  if (!player) return empty;
  if (!isSplitPayment(player)) {
    if (player.paid !== true) return empty;
    const received = finiteMoney(player.amount);
    if (player.method === 'transferencia') return { cash: 0, transfer: received, pending: 0, received, split: false };
    if (player.method === 'efectivo') return { cash: received, transfer: 0, pending: 0, received, split: false };
    return { cash: 0, transfer: 0, pending: 0, received, split: false };
  }
  const cash = finiteMoney(player.cash);
  const transfer = finiteMoney(player.transfer);
  const pending = finiteMoney(player.pendingTransfer);
  return { cash, transfer, pending, received: roundARS(cash + transfer), split: true };
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

/** "Transfiere después $1.500", o "" si no hay nada pendiente. */
export function pendingStatusText(player) {
  const pending = paymentParts(player).pending;
  return pending > 0 ? `Transfiere después ${formatARS(pending)}` : '';
}

function receivedStatusText(player) {
  if (!player) return '';
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
  if (parts.cash > 0 && parts.transfer === 0) base = `Pagó ${amount} · Efectivo`;
  else if (parts.transfer > 0 && parts.cash === 0) base = `Pagó ${amount} · Transferencia`;
  else base = `Pagó ${amount} · Efectivo ${formatARS(parts.cash)} · Transferencia ${formatARS(parts.transfer)}`;
  const receiver = String(player.receivedBy || '').trim();
  return receiver ? `${base} · cobró ${receiver}` : base;
}

/** Texto para la fila y para la lista copiada. Incluye lo pendiente. Vacío si todavía no se cargó. */
export function paymentStatusText(player) {
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

/** "Recaudado: $45.000 · 9/14 pagaron", o "" si nadie tiene un pago cargado. */
export function collectedLine(players) {
  const list = players || [];
  const pending = sumParts(list).pending;
  if (!list.some((p) => p.paid === true || p.paid === false) && pending <= 0) return '';
  const paid = list.filter((p) => p.paid === true);
  const total = paid.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const base = `Recaudado: ${formatARS(total)} · ${paid.length}/${list.length} pagaron`;
  return pending > 0 ? `${base} · Transfiere después: ${formatARS(pending)}` : base;
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

function usesSplitInput(input) {
  return !!input && (input.split === true || 'cash' in input || 'transfer' in input || 'pendingTransfer' in input);
}

function moneyField(value, error) {
  if (value == null || value === '') return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_AMOUNT) return { error };
  return roundARS(value);
}

function methodOfParts(cash, transfer) {
  if (cash > 0 && transfer === 0) return 'efectivo';
  if (transfer > 0 && cash === 0) return 'transferencia';
  return null;
}

export function paymentRecord(input, who, now = Date.now()) {
  if (!usesSplitInput(input)) return legacyPaymentRecord(input, who, now);
  const paid = input?.paid;
  if (paid !== true && paid !== false) return { ok: false, error: 'Indicá si pagó.' };
  const stamp = { paidUpdatedBy: String(who || ''), paidUpdatedAt: now };
  const cleared = {
    ...stamp,
    paid: false,
    amount: null,
    method: null,
    receivedBy: null,
    cash: null,
    transfer: null,
    pendingTransfer: null,
    transferReceivedAt: null,
    transferReceivedBy: null,
  };
  if (paid === false) return { ok: true, patch: cleared };
  const cash = moneyField(input.cash, 'Efectivo inválido.');
  if (typeof cash === 'object') return { ok: false, error: cash.error };
  const transfer = moneyField(input.transfer, 'Transferencia inválida.');
  if (typeof transfer === 'object') return { ok: false, error: transfer.error };
  const pending = moneyField(input.pendingTransfer, 'Monto inválido.');
  if (typeof pending === 'object') return { ok: false, error: pending.error };
  if (cash + transfer + pending <= 0) return { ok: false, error: 'Poné un monto.' };
  const received = roundARS(cash + transfer);
  const receivedBy = receiverValue(input);
  if (receivedBy && typeof receivedBy === 'object') return { ok: false, error: receivedBy.error };
  return {
    ok: true,
    patch: {
      ...stamp,
      paid: received > 0,
      amount: received > 0 ? received : null,
      method: methodOfParts(cash, transfer),
      receivedBy: received > 0 ? receivedBy : null,
      cash,
      transfer,
      pendingTransfer: pending > 0 ? pending : null,
      transferReceivedAt: null,
      transferReceivedBy: null,
    },
  };
}

function legacyPaymentRecord(input, who, now) {
  const paid = input?.paid;
  if (paid !== true && paid !== false) return { ok: false, error: 'Indicá si pagó.' };
  const stamp = { paidUpdatedBy: String(who || ''), paidUpdatedAt: now };
  if (paid === false) return { ok: true, patch: { ...stamp, paid: false, amount: null, method: null, receivedBy: null } };
  const amount = input.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
    return { ok: false, error: 'Monto inválido.' };
  }
  if (input.method !== 'efectivo' && input.method !== 'transferencia') {
    return { ok: false, error: 'Elegí Efectivo o Transferencia.' };
  }
  const receivedBy = receiverValue(input);
  if (receivedBy && typeof receivedBy === 'object') return { ok: false, error: receivedBy.error };
  return { ok: true, patch: { ...stamp, paid: true, amount: roundARS(amount), method: input.method, receivedBy } };
}

/** Pasa "Transfiere después" a transferencia cobrada. No toca el efectivo. */
export function receivePendingTransfer(player, who, now = Date.now()) {
  const parts = paymentParts(player);
  if (parts.pending <= 0) return { ok: false, error: 'No hay transferencia pendiente.' };
  const cash = parts.split ? parts.cash : (player?.method === 'efectivo' && player?.paid === true ? parts.received : 0);
  const transfer = roundARS((parts.split ? parts.transfer : (player?.method === 'transferencia' ? parts.received : 0)) + parts.pending);
  const received = roundARS(cash + transfer);
  const name = String(who || '').trim();
  const receivedBy = String(player?.receivedBy || '').trim() || name || null;
  return {
    ok: true,
    patch: {
      paid: true,
      amount: received,
      method: methodOfParts(cash, transfer),
      cash,
      transfer,
      pendingTransfer: null,
      transferReceivedAt: now,
      transferReceivedBy: name || null,
      receivedBy,
      paidUpdatedBy: name,
      paidUpdatedAt: now,
    },
  };
}
