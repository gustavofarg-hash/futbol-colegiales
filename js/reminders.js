// Recordatorios y links de confirmación. Puro: lo usan la app, la página
// confirmar.html y las pruebas. No abre WhatsApp ni escribe en Firestore.
import { attendanceWhen, clockTime, confirmScheduleText, confirmSlotLabel, labelDate, todayISO, toEpoch } from './dates.js';
import { sameOrganizer } from './organizers.js';
import { givenName, personKey } from './roster.js';
import { playerAccess } from './access.js';
import { waSendUrl } from './phone.js';
import { isShortCode, shortConfirmUrl } from './short.js';
import { publicAppOrigin } from './trial.js';
import { courtLabel, footballPhrase } from './venues.js';

export const CONFIRM_ORIGIN = 'https://gustavofarg-hash.github.io/futbol-colegiales';

/** Token opaco (base64url, 18 bytes). No se puede adivinar. */
export function newConfirmToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let raw = '';
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function confirmPageUrl({ matchId, playerId, token, origin = publicAppOrigin() }) {
  const base = origin.endsWith('/') ? origin : `${origin}/`;
  const url = new URL('confirmar.html', base);
  url.searchParams.set('m', matchId);
  url.searchParams.set('p', playerId);
  url.searchParams.set('t', token);
  return url.href;
}

/** WhatsApp para confirmar asistencia. El link es el de esa persona, corto o largo. */
export function attendanceMessage({ player, roster, when, time, confirmUrl, slots, now }) {
  const first = givenName(player, roster);
  const hello = first ? `¡Hola ${first}!` : '¡Hola!';
  const many = Array.isArray(slots) && slots.length >= 2 ? confirmScheduleText(slots, now) : '';
  const slot = many || [String(when || '').trim(), clockTime(time)].filter(Boolean).join(' ');
  const ask = slot ? `¿Confirmás que jugás ${slot}?` : '¿Confirmás que jugás?';
  const link = String(confirmUrl || '').trim();
  return link ? `${hello} ${ask}\n\nRespondé en este link: ${link}` : `${hello} ${ask}`;
}

export function reminderMessage({ player, match, confirmUrl, roster, now, slots }) {
  return attendanceMessage({
    player,
    roster,
    when: attendanceWhen(match?.date, now),
    time: match?.time,
    confirmUrl,
    slots,
    now,
  });
}

export function waReminderUrl(phone, text, opts = {}) {
  return waSendUrl({ phone, text, ...opts });
}

/**
 * Documento público de confirmación. No lleva teléfono: la página anónima
 * solo puede leer este documento, y el id es el token del link.
 */
export function confirmationRecord({ playerId, player, match }) {
  const confirmed = player?.confirmed === 'si' || player?.confirmed === 'no' ? player.confirmed : null;
  return {
    ...confirmationIdentity({ playerId, player, match }),
    confirmed,
    confirmedAt: typeof player?.confirmedAt === 'number' ? player.confirmedAt : null,
  };
}

/**
 * Lo que escribe un organizador. Sin `confirmed` ni `confirmedAt`: un merge
 * no puede borrar el «Sí, juego» que guardó la página anónima.
 */
export function confirmationIdentity({ playerId, player, match }) {
  return {
    playerId,
    matchId: player?.matchId || match?.id || '',
    name: player?.name || '',
    date: match?.date || player?.matchDate || '',
    time: match?.time || '',
    note: match?.note || '',
    notes: String(match?.notes || '').slice(0, 2000),
    venue: String(match?.venueName || '').trim().slice(0, 80) || 'Polideportivo Colegiales',
    cancelled: match?.cancelled === true,
    viewers: playerAccess(match).viewers,
  };
}

/**
 * La lista muestra la ficha del token. Si esa ficha ya tiene sí o no, gana.
 * Si todavía no tiene respuesta, se deja lo que hubiera en el jugador.
 * Una ficha de otro token, aunque repita el playerId, no cuenta.
 */
export function overlayConfirmations(players, cards) {
  const byToken = new Map();
  for (const card of cards || []) if (card?.id) byToken.set(card.id, card);
  return (players || []).map((player) => {
    const card = player?.confirmToken ? byToken.get(player.confirmToken) : null;
    if (!card) return player;
    if (card.confirmed !== 'si' && card.confirmed !== 'no') return player;
    return {
      ...player,
      confirmed: card.confirmed,
      confirmedAt: typeof card.confirmedAt === 'number' ? card.confirmedAt : (player.confirmedAt ?? null),
    };
  });
}

const CONFIRM_ALSO_MAX = 12;

/** Partidos próximos en los que esta persona está anotada, sin lista de espera. */
export function upcomingConfirmSlots({ players, matches, player, now = new Date() } = {}) {
  const today = todayISO(now);
  const key = personKey(player, players);
  if (!key) return [];
  const byId = new Map((matches || []).map((match) => [match.id, match]));
  const rows = [];
  for (const other of players || []) {
    const token = String(other?.confirmToken || '');
    if (token.length < 16 || !other?.id) continue;
    if (other.waiting === true || other.noPlay === true) continue;
    if (personKey(other, players) !== key) continue;
    const match = byId.get(other.matchId);
    if (!match || match.cancelled === true) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(match.date || '')) || match.date < today) continue;
    const time = clockTime(match.time);
    if (!time) continue;
    rows.push({ token, playerId: other.id, date: match.date, time });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.playerId.localeCompare(b.playerId));
  return rows.slice(0, CONFIRM_ALSO_MAX);
}

/** Lo que la página puede mostrar: horarios de hoy en adelante, sin repetir el token. */
export function visibleConfirmSlots(list, now = new Date()) {
  const today = todayISO(now);
  const out = [];
  const seen = new Set();
  for (const row of list || []) {
    const token = String(row?.token || '');
    const playerId = String(row?.playerId || '');
    const date = String(row?.date || '');
    const time = clockTime(row?.time);
    if (token.length < 16 || token.length > 80 || !playerId || playerId.length > 80) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || !time) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    const confirmed = row?.confirmed === 'si' || row?.confirmed === 'no' ? row.confirmed : null;
    out.push({ token, playerId, date, time, confirmed });
  }
  return out;
}

export function confirmSlotText(slot, now = new Date()) {
  return confirmSlotLabel(slot?.date, slot?.time, now);
}

/** Si todos contestaron lo mismo, esa respuesta. Si falta alguna, null. */
export function sharedConfirmAnswer(slots) {
  if (!slots?.length) return null;
  const first = slots[0]?.confirmed;
  if (first !== 'si' && first !== 'no') return null;
  return slots.every((slot) => slot?.confirmed === first) ? first : null;
}

/** El link solo vale si el token del jugador coincide y es de ese partido. */
export function confirmationAllowed(player, matchId, token) {
  return !!player
    && player.matchId === matchId
    && typeof token === 'string'
    && token.length >= 16
    && player.confirmToken === token;
}

export function confirmStatus(player) {
  // En la lista de espera no confirman si juegan: no hay estado hasta que suben.
  if (player?.waiting === true) return null;
  if (player?.tentative === true) {
    if (player.confirmed === 'no') {
      return { cls: 'reserved', text: 'Reservado · a confirmar', note: 'No juega · se puede liberar el lugar' };
    }
    return { cls: 'reserved', text: 'Reservado · a confirmar' };
  }
  if (player?.confirmed === 'si') return { cls: 'ok', text: '✅ Confirmó' };
  if (player?.confirmed === 'no') return { cls: 'no', text: '❌ No juega' };
  return { cls: 'pending', text: '⏳ Sin respuesta' };
}

/** El sí del link suelta el lugar reservado. El no lo deja reservado. */
export function reservationClearedByAnswer(player) {
  return player?.tentative === true && player?.confirmed === 'si';
}

export function confirmSummary(players) {
  let si = 0;
  let no = 0;
  let pending = 0;
  let hold = 0;
  for (const p of players || []) {
    if (p?.waiting === true) continue;
    if (p?.tentative === true) hold += 1;
    if (p?.confirmed === 'si' && p?.tentative !== true) si += 1;
    else if (p?.confirmed === 'no') no += 1;
    else if (p?.tentative !== true) pending += 1;
  }
  const holdText = hold > 0 ? ` · A confirmar: ${hold}` : '';
  return {
    si, no, pending, hold,
    text: `Confirmados: ${si}${holdText} · No juegan: ${no} · Sin respuesta: ${pending}`,
  };
}

/** Aviso para quien sube de la lista de espera. No manda el mensaje: solo lo arma. */
export function promotionMessage({ player, match, venue, confirmUrl }) {
  const name = String(player?.name || '').trim() || 'hola';
  const when = labelDate(match?.date);
  const time = match?.time || '--:--';
  const court = courtLabel(match);
  const place = court ? `${venue} (${court})` : venue;
  return `¡Hola ${name}! Se hizo un lugar en el ${footballPhrase(match)} en ${place} el ${when} a las ${time} hs. ¿Confirmás tu presencia? ¿Querés que te deje anotado? Respondé en este link: ${confirmUrl}`;
}

/** El cartel aparece cuando el partido empieza en 2 horas o menos. */
export const REMINDER_LEAD_MS = 2 * 60 * 60 * 1000;

export function matchStartsAt(match) {
  if (typeof match?.startsAt === 'number' && Number.isFinite(match.startsAt)) return match.startsAt;
  if (match?.date) return toEpoch(match.date, match.time);
  return NaN;
}

/** Falta el saque y está a 2 horas o menos. */
export function withinReminderWindow(match, now = Date.now()) {
  const start = matchStartsAt(match);
  if (!Number.isFinite(start)) return false;
  const left = start - now;
  return left >= 0 && left <= REMINDER_LEAD_MS;
}

export function reminderDueAt(match) {
  const start = matchStartsAt(match);
  if (!Number.isFinite(start)) return null;
  return start - REMINDER_LEAD_MS;
}

/**
 * Jugadores que anotó esta persona. «Gustavo» y «Martín» viejos coinciden
 * con la cuenta del mismo nombre, sin importar mayúsculas ni acentos.
 */
export function playersForOrganizer(players, organizer) {
  if (!organizer) return [];
  return (players || []).filter((player) => sameOrganizer(player?.addedBy, organizer));
}

/** Quien juega y tiene WhatsApp. La lista de espera no juega: no entra. */
export function reminderAudience(players) {
  return (players || []).filter((p) => p?.waiting !== true && String(p?.phone || '').trim());
}

/** Todavía no dijeron si juegan. Quien ya confirmó o avisó que no, no entra. */
export function unconfirmedForReminder(players) {
  return (players || []).filter((p) => p && p.waiting !== true && p.noPlay !== true && p.confirmed !== 'si' && p.confirmed !== 'no');
}

export function reminderProgress(players) {
  const audience = reminderAudience(players);
  const sent = audience.filter((p) => p.reminderSentAt).length;
  return {
    total: audience.length,
    sent,
    pending: audience.length - sent,
    done: audience.length > 0 && sent === audience.length,
  };
}

/** Cartel solo si el partido entra en la ventana y todavía falta avisar a alguien con WhatsApp. */
export function needsReminderBanner(match, players, now = Date.now()) {
  if (match?.cancelled === true) return false;
  if (!withinReminderWindow(match, now)) return false;
  const prog = reminderProgress(players);
  return prog.total > 0 && prog.pending > 0;
}

/** Partidos que cruzaron la marca de 2 horas entre dos instantes (la app estaba abierta). */
export function matchesCrossingReminderWindow(matches, previousNow, now) {
  return (matches || []).filter((m) => m?.cancelled !== true && !withinReminderWindow(m, previousNow) && withinReminderWindow(m, now));
}

/** Aviso de que el partido no se juega. Sin link para confirmar. */
export function cancelMessage({ player, match, venue }) {
  const name = String(player?.name || '').trim() || 'hola';
  const when = labelDate(match?.date);
  const time = match?.time || '--:--';
  const court = courtLabel(match);
  const place = `${venue || 'Polideportivo Colegiales'}${court ? ` (${court})` : ''}`;
  const reason = String(match?.notes || '').trim();
  const why = reason ? ` Motivo: ${reason}` : '';
  return `Hola ${name}, se canceló el partido de ${footballPhrase(match)} en ${place} del ${when} a las ${time} hs.${why}`;
}

/** Un link por jugador con teléfono. No abre WhatsApp. */
export function cancelLinks({ match, players, venue, choice, android } = {}) {
  const out = [];
  for (const p of players || []) {
    const phone = String(p?.phone || '').trim();
    if (!phone || !p?.id) continue;
    const text = cancelMessage({ player: p, match, venue });
    out.push({ id: p.id, name: p.name, phone, text, waUrl: waSendUrl({ phone, text, choice, android }) });
  }
  return out;
}

/**
 * Lista para mandar o para un script externo. Cada ítem: { name, waUrl, confirmUrl }.
 * Omite a quien no tenga teléfono o confirmToken: el token tiene que estar ya
 * guardado en el jugador (se crea al anotarlo).
 */
export function reminderLinks({ match, players, venue, origin, choice, android, roster, now, allPlayers, matches } = {}) {
  const out = [];
  if (!match?.id) return out;
  const pool = allPlayers || players;
  const calendar = matches || [match];
  for (const p of players || []) {
    if (p?.waiting === true) continue;
    const phone = String(p?.phone || '').trim();
    const token = p?.confirmToken;
    if (!phone || !token || !p.id) continue;
    const confirmUrl = isShortCode(p.shortCode)
      ? shortConfirmUrl(p.shortCode, origin)
      : confirmPageUrl({ matchId: match.id, playerId: p.id, token, origin });
    const slots = upcomingConfirmSlots({ players: pool, matches: calendar, player: p, now });
    const text = reminderMessage({ player: p, match, confirmUrl, roster, now, slots });
    out.push({ id: p.id, name: p.name, phone, text, waUrl: waSendUrl({ phone, text, choice, android }), confirmUrl });
  }
  return out;
}
