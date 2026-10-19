// Pagos por jugador. Funciones puras: la UI y el store las usan igual,
// y las pruebas no necesitan el navegador ni Firebase.
//
// En el documento del jugador (players/{id}):
//   paid: bool
//   amount: number | null          (pesos)
//   method: "efectivo" | "transferencia" | null
//   paidUpdatedBy: string
//   paidUpdatedAt: number           (epoch ms)

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

/** Texto compacto para la fila y para la lista copiada. Vacío si todavía no se cargó. */
export function paymentStatusText(player) {
  if (!player || (player.paid !== true && player.paid !== false)) return '';
  if (player.paid === false) return 'No pagó';
  const amount = player.amount != null && player.amount !== '' ? formatARS(player.amount) : '';
  const method = methodLabel(player.method);
  const head = ['Pagó', amount].filter(Boolean).join(' ');
  return method ? `${head} · ${method}` : head;
}

/** "Recaudado: $45.000 · 9/14 pagaron", o "" si nadie tiene un pago cargado. */
export function collectedLine(players) {
  const list = players || [];
  if (!list.some((p) => p.paid === true || p.paid === false)) return '';
  const paid = list.filter((p) => p.paid === true);
  const total = paid.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  return `Recaudado: ${formatARS(total)} · ${paid.length}/${list.length} pagaron`;
}

/**
 * Campos para mergear en el jugador. No toca nombre, teléfono ni partido.
 * { ok:true, patch } o { ok:false, error }.
 */
export function paymentRecord(input, who, now = Date.now()) {
  const paid = input?.paid;
  if (paid !== true && paid !== false) return { ok: false, error: 'Indicá si pagó.' };
  const stamp = { paidUpdatedBy: String(who || ''), paidUpdatedAt: now };
  if (paid === false) return { ok: true, patch: { ...stamp, paid: false, amount: null, method: null } };
  const amount = input.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
    return { ok: false, error: 'Monto inválido.' };
  }
  if (input.method !== 'efectivo' && input.method !== 'transferencia') {
    return { ok: false, error: 'Elegí Efectivo o Transferencia.' };
  }
  return { ok: true, patch: { ...stamp, paid: true, amount: roundARS(amount), method: input.method } };
}
