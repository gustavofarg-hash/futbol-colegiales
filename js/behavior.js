// Comportamiento del jugador. Puro: no escribe en Firestore.
// El promedio arranca en 10. Cada ajuste suma sus puntos y queda entre 0 y 10.
// falta y baja son para anotar desde el partido; suspensión y levantamiento
// se muestran acá aunque sigan guardados en su colección.
import { todayISO, numericDate } from './dates.js';
import { blankLog } from './log.js';

export const BEHAVIOR_TYPES = Object.freeze(['manual', 'falta', 'baja', 'suspension', 'lift']);
export const BEHAVIOR_BASE = 10;

const ADJUSTMENT = new Set(['manual', 'falta', 'baja']);

function cleanText(value, max) {
  return String(value || '').replace(/\r\n/g, '\n').trim().replace(/[ \t]+/g, ' ').slice(0, max);
}

function half(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 2) / 2;
}

function endOfDay(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return 0;
  const at = Date.parse(`${iso}T23:59:59-03:00`);
  return Number.isFinite(at) ? at : 0;
}

/** Puntos de a 0,5, entre −10 y 10, distintos de cero. Acepta coma. */
export function parseBehaviorPoints(value) {
  const raw = String(value ?? '').trim().replace('−', '-').replace(',', '.');
  if (!raw) return { ok: false, error: 'Poné los puntos.' };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, error: 'Los puntos no son válidos.' };
  const points = half(n);
  if (points == null || Math.abs(points - n) > 0.001) return { ok: false, error: 'Los puntos van de a 0,5.' };
  if (points === 0) return { ok: false, error: 'Los puntos no pueden ser 0.' };
  if (points < -10 || points > 10) return { ok: false, error: 'Los puntos van de −10 a 10.' };
  return { ok: true, points };
}

export function cleanBehaviorEntry(input, actor, now = Date.now()) {
  const type = String(input?.type || 'manual');
  if (!BEHAVIOR_TYPES.includes(type)) return { ok: false, error: 'Tipo inválido.', code: 'invalid-behavior' };
  let points = 0;
  if (type === 'suspension' || type === 'lift') {
    const n = half(String(input?.points ?? 0).replace('−', '-').replace(',', '.'));
    points = n == null ? 0 : Math.min(10, Math.max(-10, n));
  } else {
    const parsed = parseBehaviorPoints(input?.points);
    if (!parsed.ok) return { ...parsed, code: 'invalid-behavior' };
    points = parsed.points;
  }
  const reason = cleanText(input?.reason, 200);
  if (!reason) return { ok: false, error: 'Poné el motivo.', code: 'invalid-behavior' };
  const uid = cleanText(actor?.uid, 128);
  if (!uid) return { ok: false, error: 'No hay sesión.', code: 'permission-denied' };
  return {
    ok: true,
    entry: {
      type,
      points,
      reason,
      comment: cleanText(input?.comment, 300),
      matchId: cleanText(input?.matchId, 80),
      createdByUid: uid,
      createdByName: cleanText(actor?.name, 40) || 'Organizador',
      createdAt: Number(now) || Date.now(),
    },
  };
}

export function behaviorScore(entries) {
  let total = BEHAVIOR_BASE;
  for (const row of entries || []) {
    const n = Number(row?.points);
    if (Number.isFinite(n)) total += n;
  }
  total = Math.round(total * 10) / 10;
  if (total < 0) return 0;
  if (total > 10) return 10;
  return total;
}

function commaNumber(value, digits) {
  return value.toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatBehaviorScore(value) {
  const n = Math.round(Number(value) * 10) / 10;
  const digits = Number.isInteger(n) ? 0 : 1;
  return `${commaNumber(n, digits)}/10`;
}

export function formatBehaviorPoints(value) {
  const n = Math.round(Number(value) * 10) / 10;
  const abs = commaNumber(Math.abs(n), 1);
  if (n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return '0,0';
}

function dayOf(at) {
  const n = Number(at);
  if (!Number.isFinite(n) || n <= 0) return '';
  return todayISO(new Date(n));
}

function sameStored(stored, virtual) {
  return stored?.type === virtual.type
    && stored.createdByUid === virtual.createdByUid
    && stored.date === virtual.date
    && stored.reason === virtual.reason;
}

/**
 * Ajustes guardados más suspensiones y levantamientos. Lo más nuevo primero.
 * Una entrada ya guardada de tipo suspension o lift no se repite.
 */
export function behaviorTimeline({ rosterId, entries, suspensions, suspensionHistory, nameOf, now = Date.now() } = {}) {
  const id = String(rosterId || '');
  const stored = [];
  for (const row of entries || []) {
    if (String(row?.rosterId || '') !== id) continue;
    const at = Number(row.createdAt) || 0;
    stored.push({
      id: row.id || '',
      type: row.type || 'manual',
      points: Number(row.points) || 0,
      reason: String(row.reason || ''),
      comment: String(row.comment || ''),
      matchId: String(row.matchId || ''),
      createdByUid: String(row.createdByUid || ''),
      createdByName: String(row.createdByName || ''),
      createdAt: at,
      date: dayOf(at),
    });
  }
  const who = (uid) => (typeof nameOf === 'function' ? nameOf(uid) : '') || 'Organizador';
  const extra = [];
  const pushVirtual = (row) => {
    if (stored.some((item) => sameStored(item, row))) return;
    extra.push(row);
  };
  const seenLift = new Set();
  const pushLift = (ownerUid, item, at) => {
    const note = String(item?.note || '').trim();
    const date = String(item?.date || '');
    const lifted = String(item?.lifted || '');
    if (!note || !date || !lifted) return;
    const key = `${ownerUid}|${date}|${note}|${lifted}|${item?.liftNote || ''}`;
    if (seenLift.has(key)) return;
    seenLift.add(key);
    const liftAt = Number(at) || endOfDay(lifted);
    const susAt = Math.min(endOfDay(date) || liftAt - 1, liftAt - 1);
    const name = who(ownerUid);
    pushVirtual({
      type: 'suspension', points: 0, reason: note, comment: '', matchId: '',
      createdByUid: ownerUid, createdByName: name, createdAt: susAt, date,
    });
    pushVirtual({
      type: 'lift', points: 0, reason: 'Suspensión levantada', comment: String(item?.liftNote || '').trim(), matchId: '',
      createdByUid: ownerUid, createdByName: name, createdAt: liftAt, date: lifted,
    });
  };
  for (const row of suspensions || []) {
    if (String(row?.rosterId || '') !== id) continue;
    const ownerUid = String(row.ownerUid || '');
    if (row.suspended === true) {
      const date = String(row.suspensionDate || '');
      pushVirtual({
        type: 'suspension', points: 0, reason: String(row.suspensionNote || '').trim(), comment: '', matchId: '',
        createdByUid: ownerUid, createdByName: who(ownerUid), createdAt: endOfDay(date) || Number(now) || 0, date,
      });
    }
    for (const item of Array.isArray(row.history) ? row.history : []) pushLift(ownerUid, item, 0);
  }
  for (const item of suspensionHistory || []) {
    if (String(item?.rosterId || '') !== id) continue;
    pushLift(String(item.ownerUid || ''), item, item.at);
  }
  return [...stored, ...extra].sort((a, b) => (b.createdAt - a.createdAt) || String(b.date).localeCompare(String(a.date)));
}

export function behaviorLine(entry) {
  const date = numericDate(entry?.date) || (entry?.createdAt ? numericDate(dayOf(entry.createdAt)) : '');
  const comment = String(entry?.comment || '').trim();
  let reason = String(entry?.reason || '').trim();
  if (entry?.type === 'suspension') reason = reason ? `Suspendido · ${reason}` : 'Suspendido';
  if (entry?.type === 'lift') reason = 'Suspensión levantada';
  const points = ADJUSTMENT.has(entry?.type) ? formatBehaviorPoints(entry?.points) : '';
  const who = String(entry?.createdByName || '').trim();
  return [date, reason, points, comment, who].filter(Boolean).join(' · ');
}

export function behaviorLog(actor, person, entry) {
  const detail = [formatBehaviorPoints(entry?.points), entry?.reason, entry?.comment].filter(Boolean).join(' · ').slice(0, 200);
  return blankLog({
    section: 'partidos',
    type: 'ajuste de comportamiento',
    matchId: String(entry?.matchId || ''),
    matchLabel: 'Comportamiento',
    playerName: person?.name || '',
    detail,
    editors: ['*'],
  }, actor);
}
