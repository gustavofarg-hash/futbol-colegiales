// Parser "best effort" de mensajes de WhatsApp en español para detectar partidos.
// Ej: "jueves 22/10 21hs", "miércoles 20:00", "mañana 19 hs", "sábado 24 de octubre a las 18"
import { todayISO, addDays, weekdayOf, toISODate, isValidDate, diffDays } from './dates.js';

const DAY_WORDS = {
  domingo: 0, dom: 0,
  lunes: 1, lun: 1,
  martes: 2,
  miercoles: 3, mie: 3, mier: 3,
  jueves: 4, jue: 4,
  viernes: 5, vie: 5,
  sabado: 6, sab: 6,
};
const MONTHS = {
  enero: 1, ene: 1, febrero: 2, feb: 2, marzo: 3, abril: 4, abr: 4, mayo: 5, junio: 6, jun: 6,
  julio: 7, jul: 7, agosto: 8, ago: 8, septiembre: 9, setiembre: 9, sep: 9, sept: 9, set: 9,
  octubre: 10, oct: 10, noviembre: 11, nov: 11, diciembre: 12, dic: 12,
};

const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Encabezado de mensaje exportado/copiado de WhatsApp:
// "[19/10/26, 13:05:12] Martín: ..." o "19/10/2026 13:05 - Martín: ..."
const WA_HEADER = /^\s*\[?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::\d{2})?\s*(?:[ap]\.?\s?m\.?)?\]?\s*(?:-\s*)?(?:[^:\n]{1,40}:\s)?/i;

function fullYear(y) { y = Number(y); return y < 100 ? 2000 + y : y; }

/** Busca anclas de fecha en una línea normalizada. */
function findAnchors(line, refISO) {
  const anchors = [];
  const ref = refISO;
  const refYear = Number(ref.slice(0, 4));
  const push = (a) => {
    // fusionar con un ancla anterior pegada (ej: "jueves 22/10")
    const prev = anchors[anchors.length - 1];
    if (prev && a.start - prev.end <= 4 && (prev.kind === 'weekday') !== (a.kind === 'weekday')) {
      const explicit = prev.kind === 'weekday' ? a : prev;
      const wd = prev.kind === 'weekday' ? prev : a;
      const merged = { ...explicit, start: prev.start, end: a.end };
      if (weekdayOf(explicit.date) !== wd.weekday) merged.warning = 'El día de la semana no coincide con la fecha';
      anchors[anchors.length - 1] = merged;
      return;
    }
    anchors.push(a);
  };

  const resolveDM = (d, m, y) => {
    let year = y ? fullYear(y) : refYear;
    if (!isValidDate(year, m, d)) return null;
    let iso = toISODate(year, m, d);
    if (!y && diffDays(ref, iso) < -60) iso = toISODate(year + 1, m, d);
    return iso;
  };

  const tokens = [];
  let mm;
  // dd/mm(/aa) o dd-mm
  const reDM = /(?<![\d/:.])(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?![\d/:])/g;
  while ((mm = reDM.exec(line))) {
    const iso = resolveDM(Number(mm[1]), Number(mm[2]), mm[3]);
    if (iso) tokens.push({ kind: 'date', date: iso, hasYear: !!mm[3], start: mm.index, end: mm.index + mm[0].length });
  }
  // "22 de octubre"
  const reDeMes = new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${Object.keys(MONTHS).join('|')})\\b`, 'g');
  while ((mm = reDeMes.exec(line))) {
    const iso = resolveDM(Number(mm[1]), MONTHS[mm[2]]);
    if (iso) tokens.push({ kind: 'date', date: iso, start: mm.index, end: mm.index + mm[0].length });
  }
  // días de la semana
  const reDay = new RegExp(`\\b(${Object.keys(DAY_WORDS).join('|')})\\b\\.?(?:\\s+(\\d{1,2})(?![\\d/:.hH]|\\s*(?:hs|h|hrs|horas)\\b|\\s+a\\s+\\d))?`, 'g');
  while ((mm = reDay.exec(line))) {
    const weekday = DAY_WORDS[mm[1]];
    let date = null;
    let end = mm.index + mm[1].length;
    // "jueves 22" -> día del mes
    if (mm[2]) {
      const dnum = Number(mm[2]);
      for (let i = 0; i < 45; i++) {
        const c = addDays(ref, i);
        if (Number(c.slice(8)) === dnum && weekdayOf(c) === weekday) { date = c; end = mm.index + mm[0].length; break; }
      }
    }
    if (!date) {
      let delta = (weekday - weekdayOf(ref) + 7) % 7;
      date = addDays(ref, delta);
    }
    tokens.push({ kind: 'weekday', weekday, date, start: mm.index, end });
  }
  // hoy / mañana / pasado mañana (pero no "de la mañana")
  const reRel = /\b(pasado\s+manana|manana|hoy|esta\s+noche)\b/g;
  while ((mm = reRel.exec(line))) {
    const before = line.slice(Math.max(0, mm.index - 6), mm.index);
    if (mm[1] === 'manana' && /\b(la|por|a)\s+$/.test(before)) continue; // "de la mañana", "por la mañana"
    const add = mm[1].startsWith('pasado') ? 2 : mm[1] === 'manana' ? 1 : 0;
    tokens.push({ kind: 'relative', date: addDays(ref, add), start: mm.index, end: mm.index + mm[0].length });
  }

  tokens.sort((a, b) => a.start - b.start);
  // eliminar solapados (ej: "22 de octubre" y "22/10" no se solapan, pero sí reDay con número)
  const clean = [];
  for (const t of tokens) {
    const last = clean[clean.length - 1];
    if (last && t.start < last.end) continue;
    clean.push(t);
  }
  clean.forEach(push);
  return anchors;
}

/** Busca horarios en una línea normalizada. */
function findTimes(line) {
  const out = [];
  const add = (h, m, start, end, ctx) => {
    h = Number(h); m = Number(m || 0);
    if (/(pm|de la (noche|tarde))/.test(ctx) && h < 12) h += 12;
    else if (!/(am|de la manana)/.test(ctx) && h >= 1 && h <= 7) h += 12; // nadie juega a las 3 am
    if (h > 23 || m > 59) return;
    if (out.some((o) => start < o.end && end > o.start)) return;
    out.push({ time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, start, end });
  };
  let mm;
  // "20 a 21", "20hs a 21hs", "20:30 a 21:00": el partido arranca en la primera hora.
  const reRange = /(?<![\d/])(\d{1,2})(?::(\d{2}))?\s*(?:hs|h|hrs|horas)?\s+a\s+(\d{1,2})(?::(\d{2}))?\s*(?:hs|h|hrs|horas)?(?![\d/])/g;
  while ((mm = reRange.exec(line))) {
    const end = mm.index + mm[0].length;
    add(mm[1], mm[2], mm.index, end, line.slice(end, end + 16));
  }
  const after = (i) => line.slice(i, i + 16);
  // 21:00, 21:30hs, 20.30 hs, 21 hs, 21h, 21hs
  const reHM = /(?<![\d/])(\d{1,2})(?::(\d{2})|\.(\d{2})(?=\s*(?:hs|h|hrs|horas)\b))?\s*(hs|h|hrs|horas|hr)?\b/g;
  while ((mm = reHM.exec(line))) {
    const hasColon = mm[2] != null;
    const hasDotSuffix = mm[3] != null;
    const hasSuffix = !!mm[4];
    const before = line.slice(Math.max(0, mm.index - 7), mm.index);
    const aLas = /\ba\s+las?\s*$/.test(before) || /\b(desde|tipo|para)\s+las?\s*$/.test(before);
    const end0 = mm.index + mm[0].length;
    // "20 y 21hs", "20, 21 o 22 hs": número suelto seguido de otro horario con sufijo
    const listed = /^\s*(?:y|o|,|\/)\s*\d{1,2}(?::\d{2})?(?:\s*(?:y|o|,|\/)\s*\d{1,2}(?::\d{2})?)*\s*(?:hs|h|hrs|horas)\b/.test(line.slice(end0));
    if (!(hasColon || hasDotSuffix || hasSuffix || aLas || listed)) continue;
    // no confundir con "22/10" (ya filtrado por lookbehind) ni con números de teléfono
    if (/\d{3,}/.test(line.slice(mm.index + mm[0].length, mm.index + mm[0].length + 4).replace(/\s/g, '')) && !hasSuffix) continue;
    const end = mm.index + mm[0].length;
    add(mm[1], mm[2] ?? mm[3], mm.index, end, after(end));
  }
  // "21 y 30", "21 y media"
  const reYMedia = /\b(\d{1,2})\s+y\s+(media|cuarto|30|15|45)\b/g;
  while ((mm = reYMedia.exec(line))) {
    const before = line.slice(Math.max(0, mm.index - 7), mm.index);
    if (!/\ba\s+las?\s*$/.test(before)) continue;
    const m = { media: 30, cuarto: 15 }[mm[2]] ?? Number(mm[2]);
    const end = mm.index + mm[0].length;
    // reemplaza el horario "a las 21" detectado antes
    for (let i = out.length - 1; i >= 0; i--) if (out[i].start === mm.index) out.splice(i, 1);
    add(mm[1], m, mm.index, end, after(end));
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * Analiza un texto y devuelve una lista de partidos candidatos:
 * [{ date: 'YYYY-MM-DD', time: 'HH:MM' | '', source: 'línea original', warning? }]
 */
export function parseMatchesFromText(text, { now = new Date(), refDate } = {}) {
  const baseRef = refDate || todayISO(now);
  const results = [];
  let lastAnchor = null; // ancla de una línea anterior sin horario
  let lastAnchorUsed = false;
  let lastAnchorLine = '';

  const flushPending = () => {
    if (lastAnchor && !lastAnchorUsed) {
      results.push({ date: lastAnchor.date, time: '', source: lastAnchorLine, warning: 'No se encontró horario' });
    }
    lastAnchor = null;
  };

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    let line = rawLine;
    let ref = baseRef;
    const h = WA_HEADER.exec(line);
    if (h) {
      const y = fullYear(h[3]);
      // WhatsApp en Argentina usa d/m/aa
      if (isValidDate(y, Number(h[2]), Number(h[1]))) ref = toISODate(y, Number(h[2]), Number(h[1]));
      line = line.slice(h[0].length);
    }
    const n = norm(line);
    if (!n.trim()) continue;
    let anchors = findAnchors(n, ref);
    const times = findTimes(n);
    if (anchors.some((anchor) => anchor.hasYear)) {
      for (const date of anchors.filter((anchor) => anchor.hasYear)) {
        const weekday = anchors.find((anchor) => anchor.kind === 'weekday' && anchor.start < date.start);
        if (weekday && weekdayOf(date.date) !== weekday.weekday && !date.warning) {
          date.warning = 'El día de la semana no coincide con la fecha';
        }
      }
      anchors = anchors.filter((anchor) => anchor.kind === 'date');
    }
    const src = rawLine.trim().slice(0, 140);

    if (!anchors.length) {
      if (times.length && lastAnchor) {
        times.forEach((t) => results.push({ date: lastAnchor.date, time: t.time, source: lastAnchorLine + ' / ' + src, warning: lastAnchor.warning }));
        lastAnchorUsed = true;
      }
      continue;
    }
    flushPending();
    anchors.forEach((a, i) => {
      const next = anchors[i + 1];
      let mine = times.filter((t) => t.start >= a.end && (!next || t.start < next.start));
      // horarios antes de la primera ancla de la línea ("21hs jueves")
      if (i === 0) mine = times.filter((t) => t.start < a.start).concat(mine);
      if (mine.length) {
        mine.forEach((t) => results.push({ date: a.date, time: t.time, source: src, warning: a.warning }));
        if (i === anchors.length - 1) { lastAnchor = a; lastAnchorUsed = true; lastAnchorLine = src; }
      } else if (i === anchors.length - 1) {
        lastAnchor = a; lastAnchorUsed = false; lastAnchorLine = src;
      } else {
        results.push({ date: a.date, time: '', source: src, warning: 'No se encontró horario' });
      }
    });
  }
  flushPending();

  // deduplicar
  const seen = new Set();
  return results.filter((r) => {
    const k = r.date + '|' + r.time;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  }).map((r) => (r.warning ? r : { date: r.date, time: r.time, source: r.source }));
}

function playerLine(line) {
  const match = String(line || '').trim().match(/^(?:\d{1,2}|[•*])\s*[.)]\s+(.+)$/);
  if (!match) return null;
  let rest = match[1].trim().replace(/\s+/g, ' ');
  let phone = '';
  const tail = rest.match(/^(.*?)(?:\s+[-–|]\s*|\s+)(\+?\d[\d\s().-]{6,}\d)\s*$/);
  if (tail) {
    const digits = tail[2].replace(/\D/g, '');
    const name = tail[1].trim().replace(/[-–|:]+$/, '').trim();
    if (name && digits.length >= 8 && digits.length <= 15) {
      rest = name;
      phone = tail[2].trim();
    }
  }
  rest = rest.slice(0, 60).trim();
  if (!rest) return null;
  return { name: rest, phone };
}

function directPlayedMatch(line, opts) {
  const found = parseMatchesFromText(line, opts).find((item) => item.date && item.time);
  if (!found) return null;
  return { date: found.date, time: found.time, source: line.trim().slice(0, 140) };
}

function waPlayedMatch(line) {
  const h = WA_HEADER.exec(String(line || '').trim());
  if (!h) return null;
  const y = fullYear(h[3]);
  const month = Number(h[2]);
  const day = Number(h[1]);
  if (!isValidDate(y, month, day)) return null;
  const hour = Number(h[4]);
  const minute = h[5];
  if (hour > 23) return null;
  return {
    date: toISODate(y, month, day),
    time: `${String(hour).padStart(2, '0')}:${minute}`,
    source: String(line).trim().slice(0, 140),
  };
}

function nextPlayerLine(lines, start) {
  for (let i = start; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    return !!playerLine(line);
  }
  return false;
}

/**
 * Partidos ya jugados, con la lista numerada de quienes jugaron.
 * Un encabezado con fecha y hora abre un partido. Otro encabezado empieza el siguiente.
 */
export function parsePlayedMatchesFromText(text, opts = {}) {
  const lines = String(text || '').split(/\r?\n/);
  const blocks = [];
  let current = null;
  const begin = (match) => {
    current = { date: match.date, time: match.time, source: match.source, players: [] };
    blocks.push(current);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;
    const player = playerLine(line);
    if (player && current) {
      const key = player.name.toLowerCase();
      if (!current.players.some((item) => item.name.toLowerCase() === key)) current.players.push(player);
      continue;
    }
    const direct = directPlayedMatch(line, opts);
    if (direct) { begin(direct); continue; }
    const header = waPlayedMatch(line);
    if (header && nextPlayerLine(lines, i + 1)) begin(header);
  }
  return blocks;
}
