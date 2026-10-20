// Recordatorios y links de confirmación. Puro: lo usan la app, la página
// confirmar.html y las pruebas. No abre WhatsApp ni escribe en Firestore.
import { labelDate, toEpoch } from './dates.js';
import { sameOrganizer } from './organizers.js';

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

/** El link solo vale si el token del jugador coincide y es de ese partido. */
export function confirmationAllowed(player, matchId, token) {
  return !!player
    && player.matchId === matchId
    && typeof token === 'string'
    && token.length >= 16
    && player.confirmToken === token;
}

export function confirmStatus(player) {
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
  return `¡Hola ${name}! Se hizo un lugar en el fútbol 7 en ${venue} el ${when} a las ${time} hs. ¿Confirmás tu presencia? ¿Querés que te deje anotado? Respondé en este link: ${confirmUrl}`;
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
