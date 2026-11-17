// Texto del aviso cuando el organizador confirma un alta del jugador.
// Lo usan la página del jugador, el WhatsApp y las pruebas. No abre nada.
import { capitalize, labelDate } from './dates.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** «lunes 19/10 21:00 en Polideportivo Colegiales» */
export function confirmSlot({ date, time, place } = {}) {
  const day = DAY.test(String(date || '')) ? capitalize(labelDate(date)) : '';
  const clock = String(time || '').trim();
  const where = String(place || '').trim() || 'Polideportivo Colegiales';
  const when = [day, clock].filter(Boolean).join(' ');
  return when ? `${when} en ${where}` : where;
}

export function confirmBannerText(slot) {
  return `¡Te confirmaron para el ${confirmSlot(slot)}!`;
}

export function confirmWhatsAppText(firstName, slot) {
  const who = String(firstName || '').trim() || 'jugador';
  return `Hola ${who}, quedaste confirmado para el ${confirmSlot(slot)}.`;
}

/** Altas ya confirmadas de esta ficha que el jugador todavía no cerró. */
export function unseenConfirmations({ players, matches, rosterId, seenIds } = {}) {
  const id = String(rosterId || '').trim();
  const seen = new Set(seenIds || []);
  const byId = new Map((matches || []).filter((match) => match?.id).map((match) => [match.id, match]));
  return (players || []).filter((player) => {
    if (!player || player.selfSignup !== true || player.waiting === true || player.tentative === true) return false;
    if (id && player.rosterId !== id) return false;
    if (!player.id || seen.has(player.id)) return false;
    return byId.has(player.matchId);
  }).map((player) => ({ player, match: byId.get(player.matchId) }));
}
