// Saldo a favor. Es de un jugador con un organizador, no de un partido.
// Puro: el store guarda el documento y la pantalla lo muestra.
import { MAX_AMOUNT, formatARS, roundARS } from './payments.js';

/** Id estable. personKey puede traer ":" y "|"; la barra no entra en un id. */
export function creditDocId(personKey, organizerUid) {
  const key = String(personKey || '').trim();
  const uid = String(organizerUid || '').trim();
  if (!key || !uid) return '';
  const raw = `${uid}__${key}`.replace(/\//g, '_');
  return raw.length <= 700 ? raw : '';
}

/** Saldo que queda después de sumar (o restar) un monto. */
export function nextCredit(current, delta) {
  const add = roundARS(Number(delta));
  if (!Number.isFinite(add) || add === 0) return { ok: false, error: 'Poné el monto.' };
  const amount = roundARS((Number(current) || 0) + add);
  if (amount < 0) return { ok: false, error: 'No alcanza el saldo a favor.' };
  if (amount > MAX_AMOUNT) return { ok: false, error: 'El monto es muy alto.' };
  return { ok: true, amount };
}

/** Saldos a favor de esta persona, solo los que tienen plata. */
export function creditBalances(credits, personKey) {
  const key = String(personKey || '').trim();
  if (!key) return [];
  const rows = [];
  for (const row of credits || []) {
    if (String(row?.personKey || '').trim() !== key) continue;
    const amount = roundARS(row?.amount);
    if (!(amount > 0)) continue;
    rows.push({
      id: row.id || creditDocId(key, row.organizerUid),
      organizerUid: String(row.organizerUid || '').trim(),
      organizerName: String(row.organizerName || '').trim(),
      amount,
      name: String(row.name || '').trim(),
    });
  }
  rows.sort((a, b) => a.organizerName.localeCompare(b.organizerName, 'es') || a.organizerUid.localeCompare(b.organizerUid));
  return rows;
}

export function creditBalance(credits, personKey, organizerUid) {
  const uid = String(organizerUid || '').trim();
  const row = creditBalances(credits, personKey).find((item) => item.organizerUid === uid);
  return row ? row.amount : 0;
}

export function creditLine(row) {
  const who = String(row?.organizerName || '').trim();
  const amount = formatARS(row?.amount || 0);
  return who ? `Saldo a favor con ${who}: ${amount}` : `Saldo a favor: ${amount}`;
}
