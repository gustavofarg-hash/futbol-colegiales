// Recordatorios y links de confirmación. Puro: lo usan la app, la página
// confirmar.html y las pruebas. No abre WhatsApp ni escribe en Firestore.
import { labelDate } from './dates.js';

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
