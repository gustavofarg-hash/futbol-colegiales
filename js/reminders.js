// Recordatorios y links de confirmación. Puro: lo usan la app, la página
// confirmar.html y las pruebas. No abre WhatsApp ni escribe en Firestore.
import { labelDate, toEpoch } from './dates.js';

export const CONFIRM_ORIGIN = 'https://gustavofarg-hash.github.io/futbol-colegiales';

/** Token opaco (base64url, 18 bytes). No se puede adivinar. */
export function newConfirmToken() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  let raw = '';
  for (const b of bytes) raw += String.fromCharCode(b);
  return btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function confirmPageUrl({ matchId, playerId, token, origin = CONFIRM_ORIGIN }) {
  const base = origin.endsWith('/') ? origin : `${origin}/`;
  const url = new URL('confirmar.html', base);
  url.searchParams.set('m', matchId);
  url.searchParams.set('p', playerId);
  url.searchParams.set('t', token);
  return url.href;
}

export function reminderMessage({ player, match, venue, confirmUrl }) {
  const first = String(player?.name || '').trim().split(/\s+/)[0] || 'hola';
  const when = `${labelDate(match.date)} a las ${match.time} hs`;
  const note = match.note ? ` (${match.note})` : '';
  return `¡Hola ${first}! Te escribo por el fútbol 7 en ${venue} el ${when}${note}. ¿Confirmás que jugás? Respondé en este link: ${confirmUrl}`;
}

export function waReminderUrl(phone, text) {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/**
 * Documento público de confirmación. No lleva teléfono: la página anónima
 * solo puede leer este documento, y el id es el token del link.
 */
export function confirmationRecord({ playerId, player, match }) {
  const confirmed = player?.confirmed === 'si' || player?.confirmed === 'no' ? player.confirmed : null;
  return {
    playerId,
    matchId: player?.matchId || match?.id || '',
    name: player?.name || '',
    date: match?.date || player?.matchDate || '',
    time: match?.time || '',
    note: match?.note || '',
    confirmed,
    confirmedAt: typeof player?.confirmedAt === 'number' ? player.confirmedAt : null,
  };
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
  if (player?.confirmed === 'si') return { cls: 'ok', text: '✅ Confirmó' };
  if (player?.confirmed === 'no') return { cls: 'no', text: '❌ No juega' };
  return { cls: 'pending', text: '⏳ Sin respuesta' };
}

export function confirmSummary(players) {
  let si = 0;
  let no = 0;
  let pending = 0;
  for (const p of players || []) {
    if (p.confirmed === 'si') si += 1;
    else if (p.confirmed === 'no') no += 1;
    else pending += 1;
  }
  return {
    si, no, pending,
    text: `Confirmados: ${si} · No juegan: ${no} · Sin respuesta: ${pending}`,
  };
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

/** Jugadores a los que se les puede abrir un chat de WhatsApp. */
export function reminderAudience(players) {
  return (players || []).filter((p) => String(p?.phone || '').trim());
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
  if (!withinReminderWindow(match, now)) return false;
  const prog = reminderProgress(players);
  return prog.total > 0 && prog.pending > 0;
}

/** Partidos que cruzaron la marca de 2 horas entre dos instantes (la app estaba abierta). */
export function matchesCrossingReminderWindow(matches, previousNow, now) {
  return (matches || []).filter((m) => !withinReminderWindow(m, previousNow) && withinReminderWindow(m, now));
}

/**
 * Lista para mandar o para un script externo. Cada ítem: { name, waUrl, confirmUrl }.
 * Omite a quien no tenga teléfono o confirmToken: el token tiene que estar ya
 * guardado en el jugador (se crea al anotarlo).
 */
export function reminderLinks({ match, players, venue, origin } = {}) {
  const out = [];
  if (!match?.id) return out;
  for (const p of players || []) {
    const phone = String(p?.phone || '').trim();
    const token = p?.confirmToken;
    if (!phone || !token || !p.id) continue;
    const confirmUrl = confirmPageUrl({ matchId: match.id, playerId: p.id, token, origin });
    const text = reminderMessage({ player: p, match, venue: venue || 'Polideportivo Colegiales', confirmUrl });
    out.push({ name: p.name, waUrl: waReminderUrl(phone, text), confirmUrl });
  }
  return out;
}
