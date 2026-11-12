// Quién suele jugar el mismo día de la semana y la misma hora.
// Solo mira los partidos y jugadores que ya están cargados.
import { addDays, toISODate, weekdayOf } from './dates.js';
import { personKey } from './roster.js';

function addMonths(iso, months) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return toISODate(target.getUTCFullYear(), target.getUTCMonth() + 1, Math.min(d, last));
}

function clock(time) {
  const text = String(time || '').trim();
  return text.length >= 5 ? text.slice(0, 5) : text;
}

function playedSlot(player) {
  if (!player || player.waiting === true || player.noPlay === true || player.confirmed === 'no') return false;
  return true;
}

/**
 * Jugadores que no están en este partido y que, en los últimos 3 meses,
 * jugaron otros partidos del mismo día de semana y la misma hora.
 * Orden: más veces primero. `sample` es la aparición más reciente, para el teléfono.
 */
export function usualPlayers({ match, matches, players, today } = {}) {
  const date = String(match?.date || '');
  const time = clock(match?.time);
  const from = addMonths(today, -3);
  if (!match?.id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !time || !from) return [];
  const day = weekdayOf(date);
  const here = new Set();
  for (const player of players || []) {
    if (player?.matchId !== match.id) continue;
    const key = personKey(player, players);
    if (key) here.add(key);
  }
  const byKey = new Map();
  const seen = new Set();
  for (const other of matches || []) {
    if (!other?.id || other.id === match.id || other.cancelled === true) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(other.date || '')) continue;
    if (other.date < from || other.date >= today) continue;
    if (weekdayOf(other.date) !== day || clock(other.time) !== time) continue;
    for (const player of players || []) {
      if (player?.matchId !== other.id || !playedSlot(player)) continue;
      const key = personKey(player, players);
      if (!key || here.has(key)) continue;
      const once = `${other.id}:${key}`;
      if (seen.has(once)) continue;
      seen.add(once);
      const row = byKey.get(key) || { key, name: player.name || '', count: 0, sample: player, date: '' };
      row.count += 1;
      if (other.date >= row.date) {
        row.date = other.date;
        row.name = player.name || row.name;
        row.sample = player;
      }
      byKey.set(key, row);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || String(a.name).localeCompare(String(b.name), 'es'))
    .map(({ key, name, count, sample }) => ({ key, name, count, sample }));
}

export function usualWindowStart(today) {
  return addMonths(today, -3) || addDays(today, -92);
}
