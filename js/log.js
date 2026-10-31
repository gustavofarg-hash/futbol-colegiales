// Registro. Puro: arma las líneas y dice quién puede verlas.
// Cada línea se escribe una vez. No se edita. El acceso queda copiado
// del partido en ese momento, porque un partido borrado ya no existe.
import { isRestricted } from './access.js';
import { addDays, capitalize, labelDate, toEpoch, todayISO } from './dates.js';
import { formatARS, hasPaymentDirection, paymentParts } from './payments.js';
import { venueLabel } from './venues.js';

export const LOG_LIMIT = 200;
/** Días hacia atrás, sin contar hoy. El rango es ese día inclusive hasta hoy. */
export const LOG_DAYS = 20;

const METHODS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  credito: 'Crédito',
};

function clean(value, max) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);
}

function unique(ids) {
  const out = [];
  for (const id of ids || []) {
    const item = String(id || '').trim();
    if (item && !out.includes(item)) out.push(item);
  }
  return out;
}

/**
 * Quién puede ver la línea: quien podía ver el partido o anotar y quitar
 * jugadores, más el creador y quien anotó el evento. `*` = todos.
 * Se copia al escribir. Las líneas viejas no se reescriben: el registro
 * no se edita, y mirar el permiso de ahora cambiaría la historia.
 */
export function editorsOf(match, actorUid = '') {
  const me = clean(actorUid, 128);
  if (!match) return me ? [me] : ['*'];
  const creator = clean(match.createdByUid, 128);
  if (!isRestricted(match)) return ['*'];
  const viewers = (Array.isArray(match.viewers) ? match.viewers : []).filter((id) => id && id !== '*');
  const adders = Array.isArray(match.adders) ? match.adders : null;
  const openAdd = !adders || !adders.length || adders.includes('*');
  const adderIds = openAdd ? [] : adders.filter((id) => id && id !== '*');
  return unique([...viewers, ...adderIds, creator, me]).slice(0, 31);
}

export function canSeeLog(entry, uid) {
  const editors = Array.isArray(entry?.editors) ? entry.editors : [];
  if (editors.includes('*')) return true;
  return !!uid && editors.includes(uid);
}

export function matchLogFields(match, venues) {
  const date = clean(match?.date, 10);
  const time = clean(match?.time, 5);
  const place = match ? venueLabel(match, venues) : '';
  const when = date ? `${capitalize(labelDate(date))} · ${time || '--:--'}` : 'Partido';
  return {
    matchId: clean(match?.id, 80),
    matchDate: date,
    matchTime: time,
    matchLabel: clean(place ? `${when} · ${place}` : when, 160),
    editors: editorsOf(match),
  };
}

export function playerLogFields(player, mates) {
  const playerName = clean(player?.name, 80) || 'Sin nombre';
  const invitedBy = clean(player?.invitedBy, 80);
  if (!invitedBy) return { playerName, hostName: '' };
  const host = (mates || []).find((item) => item?.id === invitedBy);
  const hostName = clean(player?.invitedByName || host?.name, 80);
  return { playerName, hostName };
}

export function blankLog(partial, actor) {
  const editors = editorsOf(partial?.match, actor?.uid);
  const base = {
    at: Date.now(),
    actorUid: clean(actor?.uid, 128),
    actorName: clean(actor?.name, 40) || 'Organizador',
    section: 'partidos',
    type: '',
    matchId: '',
    matchDate: '',
    matchTime: '',
    matchLabel: '',
    editors,
    playerName: '',
    hostName: '',
    detail: '',
    amount: 0,
    method: '',
  };
  const next = { ...base, ...partial };
  delete next.match;
  next.editors = unique(next.editors).slice(0, 31);
  if (!next.editors.length) next.editors = next.actorUid ? [next.actorUid] : ['*'];
  next.amount = Math.max(0, Math.round(Number(next.amount) * 100) / 100) || 0;
  next.detail = clean(next.detail, 200);
  next.playerName = clean(next.playerName, 80);
  next.hostName = clean(next.hostName, 80);
  next.matchLabel = clean(next.matchLabel, 160);
  next.type = clean(next.type, 40);
  next.actorName = clean(next.actorName, 40) || 'Organizador';
  return next;
}

export function weekRange(now = new Date()) {
  const today = todayISO(now);
  return { from: addDays(today, -LOG_DAYS), to: today };
}

export function rangeMillis(range) {
  const from = range?.from || '';
  const to = range?.to || '';
  const start = from ? toEpoch(from, '00:00') : 0;
  const end = to ? toEpoch(addDays(to, 1), '00:00') - 1 : Number.MAX_SAFE_INTEGER;
  return { start, end };
}

export function inLogRange(entry, range) {
  const at = Number(entry?.at);
  if (!Number.isFinite(at)) return false;
  const { start, end } = rangeMillis(range || {});
  return at >= start && at <= end;
}

function storedPrice(match) {
  if (!match || match.price == null || match.price === '') return null;
  const n = Number(match.price);
  return Number.isFinite(n) ? n : null;
}

function placeText(match) {
  return [clean(match?.venueName, 80), clean(match?.court, 20)].filter(Boolean).join(' ');
}

/** Cambios de día, hora, precio o sede. Vacío si no hubo ninguno. */
export function matchEditDetail(before, after) {
  const bits = [];
  if ((before?.date || '') !== (after?.date || '') || (before?.time || '') !== (after?.time || '')) {
    bits.push(`Horario ${before?.date || '—'} ${before?.time || ''} → ${after?.date || '—'} ${after?.time || ''}`);
  }
  if (storedPrice(before) !== storedPrice(after)) {
    const from = storedPrice(before) == null ? '—' : formatARS(storedPrice(before));
    const to = storedPrice(after) == null ? '—' : formatARS(storedPrice(after));
    bits.push(`Precio ${from} → ${to}`);
  }
  if ((before?.venueId || '') !== (after?.venueId || '') || placeText(before) !== placeText(after)) {
    bits.push(`Sede ${placeText(before) || '—'} → ${placeText(after) || '—'}`);
  }
  return bits.join(' · ').slice(0, 200);
}

const MONEY = [
  ['cash', 'efectivo'],
  ['transfer', 'transferencia'],
  ['credit', 'credito'],
];

function collectorNames(player, method) {
  if (!player) return [];
  const one = (value) => {
    const name = clean(value, 40);
    return name ? [name] : [];
  };
  if (method === 'efectivo') {
    return one(hasPaymentDirection(player) ? player.cashTo : player.receivedBy);
  }
  if (method === 'transferencia') {
    const parts = Array.isArray(player.transferParts) ? player.transferParts : [];
    if (parts.length > 1) {
      const names = [];
      for (const part of parts) {
        const name = clean(part?.to, 40);
        if (name && !names.some((have) => have.toLowerCase() === name.toLowerCase())) names.push(name);
      }
      return names;
    }
    return one(hasPaymentDirection(player) ? player.transferTo : player.receivedBy);
  }
  if (method === 'credito') return one(player.creditTo);
  return [];
}

function joinCollectors(names) {
  return names.filter(Boolean).join(' · ').slice(0, 80);
}

/** Antes y después. Si se borró, el después es «nadie». Si no cambió, un solo nombre. */
function collectorShift(beforeNames, afterNames, removed) {
  const before = joinCollectors(beforeNames);
  const after = joinCollectors(afterNames);
  if (removed) return before ? `${before} → nadie` : '';
  if (!before || before === after) return after;
  if (!after) return `${before} → nadie`;
  return `${before} → ${after}`;
}

/**
 * Una línea por medio cuyo monto cambió, o cuyo cobrador cambió.
 * Subir un monto es un pago por la diferencia. Bajarlo es una edición o un borrado.
 * En una edición o un borrado, paidTo dice quién cobraba y quién cobra ahora.
 * Una transferencia repartida es una sola línea con todos los que cobraron.
 */
export function paymentLines(before, after) {
  const prev = paymentParts(before);
  const next = paymentParts(after);
  const lines = [];
  for (const [key, method] of MONEY) {
    const oldAmount = prev[key] || 0;
    const newAmount = next[key] || 0;
    const beforeNames = collectorNames(before, method);
    const afterNames = collectorNames(after, method);
    const sameWho = joinCollectors(beforeNames) === joinCollectors(afterNames);
    if (oldAmount === newAmount && sameWho) continue;
    if (newAmount === 0) {
      lines.push({
        type: 'pago borrado',
        method,
        amount: oldAmount,
        detail: '',
        paidTo: collectorShift(beforeNames, [], true),
      });
    } else if (oldAmount === 0 || (newAmount > oldAmount && sameWho)) {
      lines.push({
        type: 'pago',
        method,
        amount: Math.round((newAmount - oldAmount) * 100) / 100,
        detail: '',
        paidTo: joinCollectors(afterNames),
      });
    } else {
      lines.push({
        type: 'pago editado',
        method,
        amount: newAmount || oldAmount,
        detail: oldAmount !== newAmount ? `antes ${formatARS(oldAmount)}` : '',
        paidTo: collectorShift(beforeNames, afterNames, false),
      });
    }
  }
  return lines;
}

function datedMatch(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
  return `${capitalize(labelDate(date))} · ${time || '--:--'}`;
}

/**
 * Partido guardado en la línea. No busca el partido vivo: si lo borraron,
 * queda la copia. Una línea vieja sin esa copia arma la fecha y la hora,
 * o un texto corto si no hay nada más.
 */
export function pagoMatchText(entry) {
  const label = clean(entry?.matchLabel, 160);
  if (label && label !== 'Sin partido') return label;
  const fromParts = datedMatch(clean(entry?.matchDate, 10), clean(entry?.matchTime, 5));
  if (fromParts) return fromParts;
  if (entry?.type === 'crédito cargado') return 'Carga de crédito';
  if (clean(entry?.matchId, 80)) return 'Partido';
  return '';
}

export function logText(entry) {
  const player = entry?.playerName
    ? (entry.hostName ? `${entry.playerName} (invitado de ${entry.hostName})` : entry.playerName)
    : '';
  if (entry?.section === 'pagos') {
    const method = METHODS[entry.method] || entry.method || '';
    const money = formatARS(entry.amount || 0);
    const match = pagoMatchText(entry);
    if (entry.type === 'crédito cargado') return [match, player, `${method} ${money}`].filter(Boolean).join(' · ');
    if (entry.type === 'pago borrado') return [match, player, `${method} borrado ${money}`].filter(Boolean).join(' · ');
    if (entry.type === 'pago editado') return [match, player, `${method} ${money}`, entry.detail].filter(Boolean).join(' · ');
    return [match, player, `${method} ${money}`].filter(Boolean).join(' · ');
  }
  return [entry?.matchLabel, player, entry?.detail].filter(Boolean).join(' · ');
}

export function partidoEntry(actor, match, venues, extra = {}) {
  const fields = matchLogFields(match, venues);
  fields.editors = editorsOf(match, actor?.uid);
  return blankLog({ ...fields, section: 'partidos', ...extra }, actor);
}

export function pagoEntry(actor, match, venues, player, mates, line) {
  const fields = matchLogFields(match || { id: player?.matchId || '' }, venues);
  fields.editors = editorsOf(match, actor?.uid);
  if (!match) fields.matchLabel = 'Sin partido';
  const entry = blankLog({
    ...fields,
    section: 'pagos',
    type: line?.type || 'pago',
    method: line?.method || '',
    amount: line?.amount || 0,
    detail: line?.detail || '',
    ...playerLogFields(player, mates),
  }, actor);
  const fromLine = clean(line?.paidTo, 80);
  const fromPlayer = joinCollectors(collectorNames(player, entry.method));
  let paidTo = fromLine || fromPlayer;
  if (entry.method === 'credito' && !paidTo) paidTo = clean(actor?.name, 40);
  if (paidTo) entry.paidTo = paidTo;
  if (line?.solo === true) {
    const uid = clean(actor?.uid, 128);
    entry.editors = uid ? [uid] : entry.editors;
    entry.matchId = '';
    entry.matchDate = '';
    entry.matchTime = '';
    entry.matchLabel = '';
  }
  return entry;
}

export function logWhen(entry) {
  const at = Number(entry?.at);
  if (!Number.isFinite(at)) return '';
  const date = todayISO(new Date(at));
  const time = new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at));
  return `${date.split('-').reverse().join('/')} · ${time}`;
}
