// Lectura de las listas que están en pantalla.
// Firestore acepta hasta 30 ids en un `in`. Sin tope de documentos:
// un partido se muestra recién cuando llegaron todos sus jugadores.

export const ROSTER_IN = 30;

export function chunkList(values, size = ROSTER_IN) {
  const list = [];
  const seen = new Set();
  for (const value of values || []) {
    const id = String(value || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    list.push(id);
  }
  const out = [];
  const step = Math.max(1, Number(size) || ROSTER_IN);
  for (let i = 0; i < list.length; i += step) out.push(list.slice(i, i + step));
  return out;
}

export function rosterDatesOf(matches) {
  const dates = new Set();
  for (const match of matches || []) {
    const date = String(match?.date || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates.add(date);
  }
  return [...dates].sort();
}

/**
 * El día está listo para promo y deuda cuando la consulta de esa fecha
 * ya volvió y cada partido de ese día tiene su lista completa.
 */
export function dayMoneyReady(date, matches, covered, settledDates) {
  if (!date || !(covered instanceof Set) || !(settledDates instanceof Set)) return false;
  if (!settledDates.has(date)) return false;
  for (const match of matches || []) {
    if (match?.date !== date || !match?.id) continue;
    if (!covered.has(match.id)) return false;
  }
  return true;
}
