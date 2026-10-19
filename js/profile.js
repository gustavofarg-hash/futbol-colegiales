// Perfil del jugador. Puro: las pruebas calculan las estadísticas sin Firebase.
// El perfil se guarda en el documento de roster con el mismo teléfono.
import { DIAS, capitalize, labelDate, toEpoch, weekdayOf } from './dates.js';
import { formatARS } from './payments.js';

export const POSITIONS = ['Arquero', 'Defensa', 'Mediocampo', 'Ataque'];
export const MAX_NOTES = 20;
export const MAX_NOTE_TEXT = 400;

export function startsAtOf(match) {
  if (typeof match?.startsAt === 'number' && Number.isFinite(match.startsAt)) return match.startsAt;
  if (match?.date) return toEpoch(match.date, match.time);
  return NaN;
}

function mainAppearances(phone, players, matches) {
  if (!phone) return [];
  const byId = new Map((matches || []).map((m) => [m.id, m]));
  return (players || [])
    .filter((p) => p.phone === phone && p.waiting !== true)
    .map((player) => ({ player, match: byId.get(player.matchId) }))
    .filter((row) => row.match && Number.isFinite(startsAtOf(row.match)));
}

/** Partidos ya jugados, lista principal, mismo teléfono. El más reciente primero. */
export function playedMatches({ phone, players, matches, now = Date.now() }) {
  return mainAppearances(phone, players, matches)
    .filter((row) => startsAtOf(row.match) < now)
    .sort((a, b) => startsAtOf(b.match) - startsAtOf(a.match) || String(b.match.id).localeCompare(String(a.match.id)));
}

function topValues(values) {
  const counts = new Map();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  let best = [];
  let n = 0;
  for (const [value, count] of counts) {
    if (count > n) { best = [value]; n = count; }
    else if (count === n) best.push(value);
  }
  return best;
}

function whenLabel(match) {
  if (!match?.date) return '';
  const time = match.time ? ` · ${match.time}` : '';
  return `${capitalize(labelDate(match.date))}${time}`;
}

/**
 * Estadísticas de partidos pasados en la lista principal.
 * summary: "Mayormente jueves · 21:00", o "" si todavía no jugó.
 */
export function playerStats({ phone, players, matches, now = Date.now() }) {
  const played = playedMatches({ phone, players, matches, now });
  const dates = played.map(({ match }) => ({
    date: match.date,
    time: match.time || '',
    label: whenLabel(match),
  }));
  const weekdays = topValues(played.map(({ match }) => DIAS[weekdayOf(match.date)]));
  const times = topValues(played.map(({ match }) => match.time).filter(Boolean));
  let summary = '';
  if (played.length && weekdays.length) {
    const day = weekdays.join(' y ');
    summary = times.length ? `Mayormente ${day} · ${times.join(' y ')}` : `Mayormente ${day}`;
  }
  return { played: played.length, dates, weekdays, times, summary };
}

/** Pagos y confirmaciones de la lista principal, pasados y futuros. */
export function playerRecord({ phone, players, matches }) {
  const rows = mainAppearances(phone, players, matches).map((row) => row.player);
  const paid = rows.filter((p) => p.paid === true);
  const paidTotal = paid.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const confirmed = rows.filter((p) => p.confirmed === 'si').length;
  const declined = rows.filter((p) => p.confirmed === 'no').length;
  const answered = confirmed + declined;
  return {
    paidCount: paid.length,
    paidTotal,
    paidText: paid.length ? `Pagó ${formatARS(paidTotal)} en ${paid.length} ${paid.length === 1 ? 'partido' : 'partidos'}` : 'Sin pagos cargados',
    confirmed,
    declined,
    confirmText: answered ? `Confirmó ${confirmed} de ${answered}` : 'Sin respuestas de confirmación',
  };
}

export function sortedNotes(notes) {
  return [...(notes || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || String(b.id).localeCompare(String(a.id)));
}

export function noteWhen(note, matches) {
  const match = (matches || []).find((m) => m.id === note?.matchId);
  return whenLabel(match || { date: note?.matchDate, time: note?.matchTime });
}
