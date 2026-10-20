// Perfil del jugador. Puro: las pruebas calculan las estadísticas sin Firebase.
// El perfil es un documento de roster. Con WhatsApp se agrupa por teléfono;
// sin número, por el id del plantel o por el nombre.
import { DIAS, capitalize, labelDate, todayISO, toEpoch, weekdayOf } from './dates.js';
import { formatARS } from './payments.js';
import { playerMatchesPerson } from './roster.js';

export const POSITIONS = ['Arquero', 'Defensa', 'Mediocampo', 'Ataque'];
export const MAX_NOTES = 20;
export const MAX_NOTE_TEXT = 400;

export function startsAtOf(match) {
  if (typeof match?.startsAt === 'number' && Number.isFinite(match.startsAt)) return match.startsAt;
  if (match?.date) return toEpoch(match.date, match.time);
  return NaN;
}

function asPerson({ phone, rosterId, name } = {}) {
  return { id: rosterId || '', phone: phone || '', name: name || '' };
}

function mainAppearances(who, players, matches) {
  const person = asPerson(who);
  if (!person.phone && !person.id && !person.name) return [];
  const byId = new Map((matches || []).map((m) => [m.id, m]));
  return (players || [])
    .filter((p) => playerMatchesPerson(p, person) && p.waiting !== true)
    .map((player) => ({ player, match: byId.get(player.matchId) }))
    .filter((row) => row.match && Number.isFinite(startsAtOf(row.match)));
}

/** Partidos ya jugados, lista principal, la misma persona. El más reciente primero. */
export function playedMatches({ phone, rosterId, name, players, matches, now = Date.now() }) {
  return mainAppearances({ phone, rosterId, name }, players, matches)
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
export function playerStats({ phone, rosterId, name, players, matches, now = Date.now() }) {
  const played = playedMatches({ phone, rosterId, name, players, matches, now });
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
export function playerRecord({ phone, rosterId, name, players, matches }) {
  const rows = mainAppearances({ phone, rosterId, name }, players, matches).map((row) => row.player);
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

/**
 * Partidos que todavía se pueden anotar: misma ventana que el inicio
 * (fecha de hoy en adelante, y que no hayan empezado hace más de 2 horas).
 */
export function upcomingMatches(matches, now = Date.now()) {
  const today = todayISO(new Date(now));
  return [...(matches || [])]
    .filter((match) => match?.date >= today && startsAtOf(match) > now - 2 * 3600e3)
    .sort((a, b) => startsAtOf(a) - startsAtOf(b) || String(a.id).localeCompare(String(b.id)));
}

/**
 * Estado de anotar a esta persona en un partido.
 * state: anotado | espera | lleno | libre.
 * Si ya está (teléfono, id del plantel o, sin número, el mismo nombre), no se vuelve a anotar.
 * Si no quedan lugares en la lista principal, va a la espera.
 */
export function matchSignupState({ phone, rosterId, name, match, players }) {
  const cap = match?.capacity || 14;
  const mates = (players || []).filter((player) => player.matchId === match?.id);
  const person = asPerson({ phone, rosterId, name });
  const same = mates.filter((player) => playerMatchesPerson(player, person));
  const mainCount = mates.filter((player) => player.waiting !== true).length;
  const spots = Math.max(0, cap - mainCount);
  if (same.length) {
    const onMain = same.some((player) => player.waiting !== true);
    const found = onMain ? same.find((player) => player.waiting !== true) : same[0];
    return {
      state: onMain ? 'anotado' : 'espera',
      label: onMain ? 'Anotado' : 'En espera',
      willWait: !onMain,
      spots,
      existing: true,
      playerId: found?.id || null,
    };
  }
  if (spots === 0) {
    return { state: 'lleno', label: 'Completo · va a la espera', willWait: true, spots: 0, existing: false, playerId: null };
  }
  const label = spots === 1 ? 'Queda 1' : `Quedan ${spots}`;
  return { state: 'libre', label, willWait: false, spots, existing: false, playerId: null };
}

export function noteWhen(note, matches) {
  const match = (matches || []).find((m) => m.id === note?.matchId);
  return whenLabel(match || { date: note?.matchDate, time: note?.matchTime });
}
