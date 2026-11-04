// Utilidades de fecha en zona America/Buenos_Aires (UTC-3, sin horario de verano)
export const TZ = 'America/Buenos_Aires';
export const TZ_OFFSET = '-03:00';

export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const DIAS_CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
export const DIAS_MAYUS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
export const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

const pad = (n) => String(n).padStart(2, '0');

/** Fecha de hoy (calendario) en Buenos Aires: { y, m (1-12), d } */
export function todayParts(now = new Date()) {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}
export function todayISO(now = new Date()) {
  const { y, m, d } = todayParts(now);
  return toISODate(y, m, d);
}
export function toISODate(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

/** Suma días a una fecha ISO (YYYY-MM-DD) */
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return toISODate(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}
export function weekdayOf(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
export function isValidDate(y, m, d) {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}
/** Instante (ms epoch) de una fecha+hora local de Buenos Aires */
export function toEpoch(date, time) {
  return Date.parse(`${date}T${time || '00:00'}:00${TZ_OFFSET}`);
}
export function diffDays(isoA, isoB) {
  return Math.round((Date.parse(isoB + 'T00:00:00Z') - Date.parse(isoA + 'T00:00:00Z')) / 86400000);
}

/** "JUEVES 29/10/2026" para un día YYYY-MM-DD ya calendario de Buenos Aires. */
export function compensationWhen(iso) {
  const name = DIAS_MAYUS[weekdayOf(iso)];
  const num = numericDate(iso);
  if (!name || !num) return '';
  return `${name} ${num}`;
}

/** "22/10/2026" a partir de YYYY-MM-DD. */
export function numericDate(iso) {
  const [y, m, d] = String(iso || '').split('-');
  if (!/^\d{4}$/.test(y || '') || !/^\d{2}$/.test(m || '') || !/^\d{2}$/.test(d || '')) return '';
  return `${d}/${m}/${y}`;
}

/** "Martes 03/11/2026". El ISO ya es el día de Buenos Aires, no un instante UTC. */
export function weekdayDate(iso) {
  const num = numericDate(iso);
  if (!num) return '';
  const name = DIAS[weekdayOf(iso)];
  if (!name) return '';
  return `${capitalize(name)} ${num}`;
}

/** "Mié" a partir del día corto. Vacío si la fecha no sirve. */
export function shortWeekday(iso) {
  if (!numericDate(iso)) return '';
  const raw = DIAS_CORTOS[weekdayOf(iso)];
  if (!raw) return '';
  const lower = raw.toLocaleLowerCase('es-AR');
  return lower.charAt(0).toLocaleUpperCase('es-AR') + lower.slice(1);
}

/** "04/11" sin año. */
export function dayMonth(iso) {
  const num = numericDate(iso);
  return num.length >= 5 ? num.slice(0, 5) : '';
}

/** "Miércoles 04/11". Día completo y fecha, sin año. */
export function matchTitleLabel(iso) {
  const dm = dayMonth(iso);
  if (!dm) return '';
  const name = DIAS[weekdayOf(iso)];
  if (!name) return '';
  return `${capitalize(name)} ${dm}`;
}

/** "Mié 04/11 20hs C2". court es la marca ("C2") o vacío. */
export function matchSwitchLabel(date, time, court = '') {
  return [shortWeekday(date), dayMonth(date), shortHour(time), String(court || '').trim()].filter(Boolean).join(' ');
}

/** "20hs" si es en punto, "19:30hs" si no. Vacío sin hora válida. */
export function shortHour(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time || '').trim());
  if (!match) return '';
  const hour = String(Number(match[1]));
  if (Number(match[1]) > 23 || Number(match[2]) > 59) return '';
  return match[2] === '00' ? `${hour}hs` : `${hour}:${match[2]}hs`;
}

/** "jueves 22/10" */
export function labelDate(iso) {
  const [, m, d] = iso.split('-').map(Number);
  return `${DIAS[weekdayOf(iso)]} ${pad(d)}/${pad(m)}`;
}
export function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
/** "Hoy", "Mañana" o "" */
export function relativeLabel(iso, now = new Date()) {
  const n = diffDays(todayISO(now), iso);
  if (n === 0) return 'Hoy';
  if (n === 1) return 'Mañana';
  return '';
}
