// Comportamiento del jugador. Puro: no escribe en Firestore.
// El promedio arranca en 10. Cada ajuste suma sus puntos y queda entre 0 y 10.
// falta y baja son para anotar desde el partido; suspensión y levantamiento
// se muestran acá aunque sigan guardados en su colección.
import { todayISO, numericDate, toEpoch, clockTime, labelDate, capitalize, TZ } from './dates.js';
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
  let reason = entry?.type === 'falta' ? faltaReasonText(entry?.reason) : bajaReasonText(entry?.reason);
  if (entry?.type === 'suspension') reason = reason ? `Suspendido · ${reason}` : 'Suspendido';
  if (entry?.type === 'lift') reason = 'Suspensión levantada';
  const points = ADJUSTMENT.has(entry?.type) ? formatBehaviorPoints(entry?.points) : '';
  const who = String(entry?.createdByName || '').trim();
  return [date, reason, points, comment, who].filter(Boolean).join(' · ');
}

const LOG_TYPES = { falta: 'falta', baja: 'puntos por baja' };

export function behaviorLog(actor, person, entry) {
  const detail = [formatBehaviorPoints(entry?.points), entry?.reason, entry?.comment].filter(Boolean).join(' · ').slice(0, 200);
  const matchLabel = String(entry?.matchLabel || '').trim().slice(0, 160);
  return blankLog({
    section: 'partidos',
    type: LOG_TYPES[entry?.type] || 'ajuste de comportamiento',
    matchId: String(entry?.matchId || ''),
    matchLabel: matchLabel || 'Comportamiento',
    playerName: person?.name || '',
    detail,
    editors: ['*'],
  }, actor);
}

export function behaviorDeleteLog(actor, person, entry) {
  const detail = [formatBehaviorPoints(entry?.points), faltaReasonText(entry?.type === 'falta' ? entry?.reason : bajaReasonText(entry?.reason))].filter(Boolean).join(' · ').slice(0, 200);
  return blankLog({
    section: 'partidos',
    type: 'entrada borrada',
    matchId: String(entry?.matchId || ''),
    matchLabel: 'Comportamiento',
    playerName: person?.name || '',
    detail,
    editors: ['*'],
  }, actor);
}

const HOUR = 60 * 60 * 1000;

export const BAJA_TIERS = Object.freeze([
  { id: 'before', points: 0, label: 'Se bajó el día anterior o antes' },
  { id: 'over3', points: -0.5, label: 'Se bajó el mismo día, más de 3 h antes' },
  { id: 'h3to1', points: -2, label: 'Se bajó entre 3 h y 1 h antes' },
  { id: 'under1', points: -4, label: 'Se bajó con menos de 1 h' },
  { id: 'started', points: -8, label: 'No fue sin avisar' },
]);

const BAJA_REASON_ALIASES = {
  'Día anterior o antes': 'Se bajó el día anterior o antes',
  'Mismo día, más de 3 h antes': 'Se bajó el mismo día, más de 3 h antes',
  'Entre 3 h y 1 h antes': 'Se bajó entre 3 h y 1 h antes',
  'Menos de 1 h antes': 'Se bajó con menos de 1 h',
  'Después del inicio': 'No fue sin avisar',
  'Después del inicio, conviene suspender': 'No fue sin avisar',
};

/** El texto nuevo, también si la entrada guardada todavía dice la frase vieja. */
export function bajaReasonText(reason) {
  const text = String(reason || '').trim();
  return BAJA_REASON_ALIASES[text] || text;
}

/** Motivo de sancionar. «No avisó» viejo se lee «Faltó sin aviso». */
export function faltaReasonText(reason) {
  const text = bajaReasonText(reason);
  return text === 'No avisó' ? 'Faltó sin aviso' : text;
}

function tierById(id) {
  return BAJA_TIERS.find((row) => row.id === id) || BAJA_TIERS[0];
}

function baClock(now) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const hour = parts.find((part) => part.type === 'hour')?.value || '00';
  const minute = parts.find((part) => part.type === 'minute')?.value || '00';
  return `${hour}:${minute}`;
}

function gapText(ms) {
  if (!(ms > 0)) return 'ya empezó';
  const total = Math.round(ms / 60000);
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days >= 1) return `falta ${days} ${days === 1 ? 'día' : 'días'}`;
  if (hours >= 1 && mins) return `falta ${hours} h ${mins} min`;
  if (hours >= 1) return `falta ${hours} h`;
  return `falta ${mins} min`;
}

export function formatSignedPoints(value) {
  const n = Math.round(Number(value) * 10) / 10;
  if (!Number.isFinite(n) || n === 0) return '0';
  const digits = Number.isInteger(n) ? 0 : 1;
  const abs = Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return n < 0 ? `−${abs}` : `+${abs}`;
}

/** Lo que se resta al quitar o bajar a la espera, según el inicio del partido en Buenos Aires. */
export function bajaDeduction({ date, time, now = new Date() } = {}) {
  const today = todayISO(now);
  const day = String(date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day > today) return { ...tierById('before'), suggestSuspend: false };
  if (day < today) return { ...tierById('started'), suggestSuspend: true };
  const start = toEpoch(day, clockTime(time) || '00:00');
  const ms = start - now.getTime();
  if (!(ms > 0)) return { ...tierById('started'), suggestSuspend: true };
  if (ms < HOUR) return { ...tierById('under1'), suggestSuspend: false };
  if (ms <= 3 * HOUR) return { ...tierById('h3to1'), suggestSuspend: false };
  return { ...tierById('over3'), suggestSuspend: false };
}

export function bajaPreview({ name, date, time, now = new Date() } = {}) {
  const tier = bajaDeduction({ date, time, now });
  const start = /^\d{4}-\d{2}-\d{2}$/.test(String(date || '')) ? toEpoch(date, clockTime(time) || '00:00') : now.getTime();
  const when = `${capitalize(labelDate(date) || '')} · ${clockTime(time) || '--:--'} hs`.trim();
  const reason = tier.label;
  return {
    ...tier,
    reason,
    headline: [String(name || '').trim(), when].filter(Boolean).join(' · '),
    nowLine: `Ahora son las ${baClock(now)} · ${gapText(start - now.getTime())}`,
    box: `Corresponde: ${formatSignedPoints(tier.points)} (${reason})`,
  };
}

function pointText(n, signed) {
  const digits = Number.isInteger(n) ? 0 : 1;
  const abs = Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (signed && n < 0) return `−${abs}`;
  if (signed && n > 0) return `+${abs}`;
  return abs;
}

/** Lo que se muestra en «Puntos a restar»: de 0 a 10, sin signo. */
export function formatPointMagnitude(points) {
  const n = Math.abs(Number(points) || 0);
  const clamped = Math.min(10, Math.max(0, Math.round(n * 2) / 2));
  return pointText(clamped, false);
}

/** − y + mueven de a 0,5. Sin signo, queda entre 0 y 10. Con signo, entre −10 y 10. */
export function stepPointInput(value, delta, { signed = false } = {}) {
  const raw = String(value ?? '').trim().replace('−', '-').replace(',', '.');
  const n = Number(raw);
  const base = Number.isFinite(n) ? (signed ? n : Math.abs(n)) : 0;
  let next = Math.round((base + Number(delta || 0)) * 2) / 2;
  next = signed ? Math.min(10, Math.max(-10, next)) : Math.min(10, Math.max(0, next));
  return pointText(next, signed);
}

/** Puntos a restar: el campo es positivo. Se guarda en negativo. 0 no anota. */
export function parseBajaPoints(value) {
  const raw = String(value ?? '').trim().replace('−', '-').replace(',', '.').replace(/^\+/, '');
  if (!raw || raw === '-') return { ok: false, error: 'Poné los puntos.' };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { ok: false, error: 'Los puntos no son válidos.' };
  const step = half(Math.abs(n));
  if (step == null || Math.abs(step - Math.abs(n)) > 0.001) return { ok: false, error: 'Los puntos van de a 0,5.' };
  if (step > 10) return { ok: false, error: 'Los puntos van de 0 a 10.' };
  return { ok: true, points: step === 0 ? 0 : -step };
}
