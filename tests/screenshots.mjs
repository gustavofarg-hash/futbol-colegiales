// Genera capturas con datos de EJEMPLO (solo en el navegador de prueba; la app se publica vacía).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const BASE = process.argv[2] || 'http://localhost:8765/';
const OUT = new URL('../screenshots/', import.meta.url).pathname;
const NOW = new Date('2026-10-19T13:00:00-03:00');

const t = NOW.getTime();
const M = (date, time, note = '') => ({ date, time, startsAt: Date.parse(`${date}T${time}:00-03:00`), note, capacity: 14, source: 'manual', createdBy: 'Gustavo', updatedBy: 'Gustavo', createdAt: t, updatedAt: t });
const names = ['Juan Pérez', 'Pedro Gómez', 'Lucas Díaz', 'Nico Ruiz', 'Martín Sosa', 'Facu López', 'Santi Romero', 'Tomi Álvarez', 'Fede Torres', 'Mati Herrera', 'Leo Medina', 'Gonza Castro', 'Rodri Molina', 'Seba Ortiz'];
const db = { matches: {
  '2026-10-20_2100': M('2026-10-20', '21:00'),
  '2026-10-22_2100': M('2026-10-22', '21:00', 'Cancha 2 · traer pechera oscura'),
  '2026-10-23_2000': M('2026-10-23', '20:00'),
  '2026-10-25_1100': M('2026-10-25', '11:00', 'Domingo a la mañana'),
}, players: {} };
const add = (mid, n, offset = 0) => { for (let i = 0; i < n; i++) db.players[`${mid}-${i}`] = { matchId: mid, matchDate: mid.slice(0, 10), name: names[(i + offset) % 14], phone: '54911' + String(40000000 + i * 1234567 + offset).slice(0, 8), addedBy: i % 3 === 1 ? 'Martín' : 'Gustavo', createdAt: t + i, updatedAt: t + i }; };
add('2026-10-20_2100', 14); add('2026-10-22_2100', 9, 0); add('2026-10-23_2000', 5, 3); add('2026-10-25_1100', 2, 6);

const browser = await chromium.launch();
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-AR', timezoneId: 'America/Buenos_Aires', colorScheme: scheme });
  const page = await ctx.newPage();
  await page.clock.install({ time: NOW });
  await page.addInitScript((d) => { localStorage.setItem('f7c-demo-db', JSON.stringify(d)); localStorage.setItem('f7c-who', 'Gustavo'); }, db);
  await page.goto(BASE);
  await page.waitForSelector('.match-card');
  await page.screenshot({ path: `${OUT}home${scheme === 'dark' ? '-dark' : ''}.png` });
  await page.click('.match-card:has-text("Jueves 22/10")');
  await page.waitForSelector('#slots');
  await page.screenshot({ path: `${OUT}partido${scheme === 'dark' ? '-dark' : ''}.png` });
  if (scheme === 'light') {
    await page.screenshot({ path: `${OUT}partido-completo-scroll.png`, fullPage: true });
    await page.click('#btn-add-player');
    await page.fill('#player-form [name=name]', 'Ale Benítez');
    await page.fill('#player-form [name=phone]', '11 5555-4321');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}agregar-jugador.png` });
    await page.click('#player-form [data-close]');
    await page.click('#btn-back');
    await page.click('#btn-import');
    await page.fill('#imp-text', 'Martín: Buenas! Se juega mañana 21 hs, el miércoles 20:00 y jueves 22/10 21hs ⚽');
    await page.click('#imp-parse');
    await page.waitForSelector('#imp-list');
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}importar-preview.png` });
  }
  await ctx.close();
}
// Pantalla inicial vacía con "¿Quién sos?"
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, locale: 'es-AR', timezoneId: 'America/Buenos_Aires' });
const page = await ctx.newPage();
await page.goto(BASE);
await page.waitForSelector('dialog[open] [data-who]');
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}primer-uso-quien-sos.png` });
await browser.close();
console.log('ok');
