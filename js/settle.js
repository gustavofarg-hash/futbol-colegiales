// Qué parte de un pago cubre el partido, qué deudas viejas cancela y qué sobra.
// Primero paga el organizador con el que se anotó. Después, el resto de los
// cobros, en el orden del formulario (efectivo, transferencia, crédito).
// Lo que no hizo falta queda en quien lo cobró.
import { roundARS } from './payments.js';

function sameName(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function take(parts, need, pred, used) {
  let left = need;
  for (const part of parts) {
    if (!(left > 0) || !(part.amount > 0) || !pred(part)) continue;
    const amount = roundARS(Math.min(part.amount, left));
    part.amount = roundARS(part.amount - amount);
    left = roundARS(left - amount);
    used.push({ kind: part.kind, amount, name: part.name, uid: part.uid });
  }
  return left;
}

/**
 * due: lo que vale este partido (o su parte de la promo).
 * parts: cobros ya partidos para este partido, en orden.
 * debts: deudas viejas { id, owed, label, organizerName }, de la más vieja a la más nueva.
 * confirmed === false queda pendiente y no entra hasta que ese organizador acepte.
 */
export function planMatchMoney({ due, signupName, parts, debts }) {
  return planRows({ rows: [{ due, signupName, parts }], debts })[0];
}

/** Varios partidos de una promo: la misma deuda vieja no se cancela dos veces. */
export function planRows({ rows, debts }) {
  const live = (debts || []).map((debt) => ({ ...debt }));
  const preview = (debts || []).map((debt) => ({ ...debt }));
  return (rows || []).map((row) => {
    const incoming = (row.parts || []).filter((part) => roundARS(part.amount) > 0).map((part) => ({
      kind: part.kind,
      amount: roundARS(part.amount),
      name: String(part.name || '').trim(),
      uid: String(part.uid || '').trim(),
      confirmed: part.confirmed !== false,
    }));
    const pending = incoming.filter((part) => !part.confirmed).map((part) => ({ ...part }));
    return {
      applied: cover({ due: row.due, signupName: row.signupName, parts: incoming.filter((part) => part.confirmed), debts: live }),
      projected: cover({ due: row.due, signupName: row.signupName, parts: incoming.map((part) => ({ ...part })), debts: preview }),
      pending,
    };
  });
}

function cover({ due, signupName, parts, debts }) {
  const pool = parts.map((part) => ({ ...part }));
  const used = [];
  let need = roundARS(Math.max(0, Number(due) || 0));
  if (signupName) need = take(pool, need, (part) => sameName(part.name, signupName), used);
  need = take(pool, need, () => true, used);
  const open = (debts || []).map((debt) => ({ ...debt, owed: roundARS(debt.owed) }));
  const settlements = [];
  const credits = [];
  for (const part of pool) {
    if (!(part.amount > 0)) continue;
    let rest = part.amount;
    for (const debt of open) {
      if (!(rest > 0)) break;
      if (!(debt.owed > 0) || !sameName(debt.organizerName, part.name)) continue;
      const amount = roundARS(Math.min(rest, debt.owed));
      debt.owed = roundARS(debt.owed - amount);
      rest = roundARS(rest - amount);
      settlements.push({ id: debt.id, label: debt.label, amount, name: part.name, uid: part.uid, kind: part.kind });
    }
    if (rest > 0) credits.push({ name: part.name, uid: part.uid, amount: rest, kind: part.kind });
  }
  return { used, uncovered: need, settlements, credits };
}

export function surplusOf(plan) {
  const rows = Array.isArray(plan) ? plan : [plan];
  let amount = 0;
  for (const row of rows) {
    const projected = row?.projected || row?.applied;
    if (!projected) continue;
    for (const item of projected.settlements || []) amount = roundARS(amount + item.amount);
    for (const item of projected.credits || []) amount = roundARS(amount + item.amount);
  }
  return amount;
}

function kindLabel(kind) {
  if (kind === 'transfer') return 'Transferencia';
  if (kind === 'credit') return 'Crédito';
  return 'Efectivo';
}

export { kindLabel };
