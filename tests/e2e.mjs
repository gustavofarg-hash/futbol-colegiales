// Prueba end-to-end en modo demo con Playwright (Chromium headless, 390x844).
// Uso: node tests/e2e.mjs [baseUrl]   (requiere `npm i playwright` en algún lado accesible)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:18431/';
const NOW = new Date('2026-10-19T13:00:00-03:00'); // lunes 19/10/2026 13:00 (BA)
const results = [];
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond, extra }); console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  locale: 'es-AR', timezoneId: 'America/Buenos_Aires', permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();
await page.clock.install({ time: NOW });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());

await page.goto(BASE);
await page.waitForSelector('dialog[open] [data-who]');
check('Pide "¿Quién sos?" al abrir por primera vez', await page.isVisible('text=¿Quién sos?'));
await page.click('[data-who="Gustavo"]');
check('Banner de modo demo visible', await page.isVisible('#demo-banner'));
check('Arranca sin partidos', await page.isVisible('text=No hay partidos en los próximos 7 días'));
check('Chip de organizador', (await page.textContent('#btn-who')).includes('Gustavo'));

// Agregar partido
await page.click('#btn-add-match');
await page.fill('#match-form [name=date]', '2026-10-22');
await page.fill('#match-form [name=time]', '21:00');
await page.fill('#match-form [name=note]', 'Cancha 2');
await page.click('#match-form button[type=submit]');
await page.waitForSelector('.match-card');
let cardText = (await page.textContent('.match-card')).replace(/\s+/g, ' ');
check('Partido agregado aparece en la lista', /Jueves 22\/10/.test(cardText) && /21:00 hs/.test(cardText) && /0\/14/.test(cardText), cardText.trim());

// Importar desde texto
await page.click('#btn-import');
await page.fill('#imp-text', `[19/10/26, 12:40:10] Martín: Buenas! Esta semana:
mañana 19 hs
miércoles 20:00
jueves 22/10 21hs (ya está cargado)
sábado 24 de octubre a las 18
y el lunes 26/10 21hs`);
await page.click('#imp-parse');
await page.waitForSelector('#imp-list');
const labels = await page.$$eval('#imp-list li .lbl', (els) => els.map((e) => e.textContent));
check('Importación detecta 5 partidos', labels.length === 5, labels.join(' | '));
const exp = ['Martes 20/10 · 19:00 hs', 'Miércoles 21/10 · 20:00 hs', 'Jueves 22/10 · 21:00 hs', 'Sábado 24/10 · 18:00 hs', 'Lunes 26/10 · 21:00 hs'];
check('Fechas/horas parseadas correctamente', JSON.stringify(labels) === JSON.stringify(exp));
const dupOff = await page.$eval('#imp-list li:nth-child(3) input[type=checkbox]', (e) => !e.checked);
check('Duplicado ("ya existe") viene destildado', dupOff);
check('Botón dice "Importar 4"', (await page.textContent('#imp-save')).trim() === 'Importar 4');
await page.click('#imp-save');
await page.waitForFunction(() => document.querySelectorAll('.match-card').length === 5);
const order = await page.$$eval('.match-card .match-title', (els) => els.map((e) => e.textContent));
check('Lista ordenada cronológicamente', JSON.stringify(order) === JSON.stringify(['Martes 20/10', 'Miércoles 21/10', 'Jueves 22/10', 'Sábado 24/10', 'Lunes 26/10']), order.join(', '));
check('Partido a más de 7 días va a "Más adelante"', (await page.$$('#list-later .match-card')).length === 1 && (await page.$$('#list-next .match-card')).length === 4);
check('Badge "Mañana" en el partido del martes', (await page.textContent('#list-next .match-card >> nth=0')).includes('Mañana'));

// Detalle y jugadores
await page.click('.match-card:has-text("Jueves 22/10")');
await page.waitForSelector('#slots');
check('Detalle muestra 14 lugares', (await page.$$('#slots > li')).length === 14);
const players = [
  ['Juan Pérez', '11 1234-5678', '5491112345678'],
  ['Pedro Gómez', '011 15 4444-3333', '5491144443333'],
  ['Lucas Díaz', '+54 9 351 555-1234', '5493515551234'],
];
for (const [name, phone] of players) {
  await page.click('#btn-add-player');
  await page.fill('#player-form [name=name]', name);
  await page.fill('#player-form [name=phone]', phone);
  await page.click('#player-form button[type=submit]');
  await page.waitForSelector(`.slot .name:text-is("${name}")`);
}
check('Contador 3/14', (await page.textContent('#slot-count')) === '3/14');
check('Siguen 14 lugares (3 ocupados + 11 libres)', (await page.$$('#slots > li')).length === 14 && (await page.$$('.slot.free')).length === 11);
const hrefs = await page.$$eval('.wa-btn', (els) => els.map((e) => e.getAttribute('href')));
const msg = encodeURIComponent('¡Hola Juan! Te anoté para el fútbol 7 en Polideportivo Colegiales el jueves 22/10 a las 21:00 hs. (Cancha 2) ¿Confirmás? ⚽');
check('Link wa.me Juan correcto', hrefs[0] === `https://wa.me/5491112345678?text=${msg}`, hrefs[0]);
players.forEach(([n, , wa], i) => check(`Número normalizado ${n} → ${wa}`, hrefs[i]?.startsWith(`https://wa.me/${wa}?text=`)));
check('Cada jugador muestra "Agregó: Gustavo"', (await page.$$('.tag.g')).length === 3);

// Número inválido
await page.click('#btn-add-player');
await page.fill('#player-form [name=name]', 'Error');
await page.fill('#player-form [name=phone]', '123');
await page.click('#player-form button[type=submit]');
check('Valida número inválido', (await page.textContent('#pf-err')).includes('inválido'));
await page.click('#player-form [data-close]');

// Cambiar organizador a Martín
await page.click('#btn-settings');
await page.click('#set-who');
await page.click('[data-who="Martín"]');
check('Organizador cambiado a Martín', (await page.textContent('#btn-who')).includes('Martín'));
check('Organizador guardado en localStorage', (await page.evaluate(() => localStorage.getItem('f7c-who'))) === 'Martín');
await page.click('#btn-add-player');
await page.fill('#player-form [name=name]', 'Nico Ruiz');
await page.fill('#player-form [name=phone]', '1234-5678');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('.slot .name:text-is("Nico Ruiz")');
check('Jugador agregado por Martín muestra "Agregó: Martín"', (await page.textContent('.slot:has-text("Nico Ruiz") .tag')).includes('Martín'));

// Editar y quitar
await page.click('.slot:has-text("Pedro Gómez") .more-btn');
await page.click('#pm-edit');
await page.fill('#player-form [name=name]', 'Pedro G.');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('.slot .name:text-is("Pedro G.")');
check('Editar jugador', true);
await page.click('.slot:has-text("Lucas Díaz") .more-btn');
await page.click('#pm-del');
await page.waitForFunction(() => !document.body.innerText.includes('Lucas Díaz'));
check('Quitar jugador', (await page.textContent('#slot-count')) === '3/14');

// Copiar lista
await page.click('#btn-copy');
const clip = await page.evaluate(() => navigator.clipboard.readText());
check('Copiar lista como texto', clip.includes('Jueves 22/10 · 21:00 hs') && clip.includes('1. Juan Pérez') && clip.includes('14. ') && clip.includes('Faltan 11'), JSON.stringify(clip.split('\n').slice(0, 5)));

// Completar el cupo
for (let i = 4; i <= 14; i++) {
  await page.click('#btn-add-player');
  await page.fill('#player-form [name=name]', `Jugador ${i}`);
  await page.click('#player-form button[type=submit]');
  await page.waitForSelector(`.slot .name:text-is("Jugador ${i}")`);
}
check('14/14 y botón "Completo" deshabilitado', (await page.textContent('#slot-count')) === '14/14' && await page.isDisabled('#btn-add-player'));

// Volver al inicio: contador
await page.click('#btn-back');
await page.waitForSelector('.match-card');
check('Inicio muestra 14/14 en la tarjeta', (await page.textContent('.match-card:has-text("Jueves 22/10") .count')).replace(/\s/g, '') === '14/14');

// Persistencia tras recargar
await page.reload();
await page.waitForSelector('.match-card');
check('Datos persisten tras recargar (sin volver a preguntar "¿Quién sos?")', (await page.$$('.match-card')).length === 5 && !(await page.isVisible('dialog[open]')));

// Borrar partido
await page.click('.match-card:has-text("Lunes 26/10")');
await page.click('#btn-del-match');
await page.waitForFunction(() => document.querySelectorAll('.match-card').length === 4);
check('Borrar partido', true);

// PWA
const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
check('Manifest válido con íconos 192/512 + maskable', manifest.icons.length === 3 && manifest.display === 'standalone');
const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
check('Service worker activo', sw);
for (const ic of manifest.icons) {
  const st = await page.evaluate(async (u) => (await fetch(u)).status, ic.src);
  check(`Ícono ${ic.src} accesible`, st === 200);
}

check('Sin errores de JS', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} OK`);
process.exit(failed.length ? 1 : 0);
