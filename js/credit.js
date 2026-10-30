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

/**
 * Cargar crédito no es anotar en el partido. canAdd mira adders y
 * createdByUid: en Firebase el uid de Auth a veces no está en esa lista
 * (la cuenta se recreó, o el partido lo anota solo otro) y el botón no
 * aparecía ni para el admin. Lo ve cualquier organizador o admin.
 */
export function canOfferCredit(actor) {
  const role = String(actor?.role || '');
  if (role === 'admin' || role === 'organizer') return true;
  return !!String(actor?.uid || '').trim();
}

/**
 * Saldos a favor para la ficha y el menú, por organizador.
 * personKeys puede ser uno (el jugador del partido) o varios (la ficha).
 * El organizador logueado aparece aunque el monto sea cero.
 */
export function creditPanelRows(credits, personKeys, organizer) {
  const keys = (Array.isArray(personKeys) ? personKeys : [personKeys])
    .map((key) => String(key || '').trim())
    .filter(Boolean);
  const byOrg = new Map();
  for (const key of keys) {
    for (const row of creditBalances(credits, key)) {
      const prev = byOrg.get(row.organizerUid);
      if (!prev) byOrg.set(row.organizerUid, { ...row });
      else prev.amount = roundARS(prev.amount + row.amount);
    }
  }
  const uid = String(organizer?.uid || '').trim();
  const name = String(organizer?.name || '').trim();
  const rows = [...byOrg.values()];
  if (uid && !rows.some((row) => row.organizerUid === uid)) {
    rows.push({ organizerUid: uid, organizerName: name, amount: 0 });
  }
  rows.sort((a, b) => Number(b.organizerUid === uid) - Number(a.organizerUid === uid)
    || a.organizerName.localeCompare(b.organizerName, 'es')
    || a.organizerUid.localeCompare(b.organizerUid));
  return rows;
}
