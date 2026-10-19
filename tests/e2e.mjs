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
// Fuerza modo demo: config.js del repo tiene la config real de Firebase y estas
// pruebas no deben leer ni escribir Firestore.
await ctx.route('**/config.js', async (route) => {
  const res = await route.fetch();
  const body = (await res.text()).replace(
    /export const firebaseConfig = \{[\s\S]*?\n\};/,
    `export const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.firebasestorage.app",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID",
};`,
  );
  await route.fulfill({ status: 200, contentType: 'text/javascript', body });
});
await ctx.route(/firestore\.googleapis\.com|firebaseio\.com|identitytoolkit\.googleapis\.com/, (route) => {
  console.error('BLOCKED', route.request().url());
  return route.abort();
});
const page = await ctx.newPage();
await page.clock.install({ time: NOW });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('dialog', (d) => d.accept());

await page.goto(BASE);
await page.waitForSelector('#login-form');
check('Pide entrar al abrir por primera vez', await page.isVisible('text=Entrar') && await page.isVisible('#login-forgot'));
await page.fill('#login-email', 'gustavo@demo.local');
await page.click('#login-forgot');
check('Olvidé mi contraseña', (await page.textContent('#login-err')).includes('no se envían mails'));
await page.fill('#login-email', 'gustavo@demo.local');
await page.fill('#login-password', 'mala');
await page.click('#login-form button[type=submit]');
await page.waitForFunction(() => (document.querySelector('#login-err')?.textContent || '').includes('incorrectos'));
await page.fill('#login-email', 'gustavo@demo.local');
await page.fill('#login-password', 'demo-gustavo');
await page.click('#login-form button[type=submit]');
await page.waitForSelector('#btn-who');
await page.waitForSelector('text=No hay partidos en los próximos 7 días');
check('Banner de modo demo visible', await page.isVisible('#demo-banner'));
const demoMode = await page.evaluate(() => window.__app?.store?.mode);
check('Modo demo (no escribe en Firestore)', demoMode === 'demo', String(demoMode));
if (demoMode !== 'demo') { await browser.close(); process.exit(1); }
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
check('Todos figuran sin respuesta', (await page.textContent('#confirm-sum')).includes('Sin respuesta: 3'));
const juanAtAdd = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  return Object.values(db.players).find((p) => p.name === 'Juan Pérez');
});
check('El token se crea al anotar, sin abrir el recordatorio', juanAtAdd?.confirmToken?.length >= 16 && !juanAtAdd.reminderSentAt);

// Recordatorio y página de confirmación (mismo origen, modo demo)
await page.click('#btn-remind');
await page.waitForSelector('#remind-list a[data-send]');
const remindLink = page.locator('#remind-list .remind-row', { hasText: 'Juan Pérez' }).locator('a');
const remindHref = await remindLink.getAttribute('href');
const remindText = decodeURIComponent(remindHref.split('text=')[1]);
check('Recordatorio abre wa.me de Juan', remindHref.startsWith('https://wa.me/5491112345678?text='), remindHref.slice(0, 80));
check('El mensaje saluda, da día, hora, lugar, nota y link',
  remindText.includes('¡Hola Juan!') && remindText.includes('jueves 22/10 a las 21:00 hs')
  && remindText.includes('Polideportivo Colegiales') && remindText.includes('(Cancha 2)')
  && remindText.includes('confirmar.html?m='));
const [popup] = await Promise.all([page.waitForEvent('popup'), remindLink.click()]);
await popup.close();
await page.waitForFunction(() => [...document.querySelectorAll('#remind-list .remind-row')].some((r) => r.textContent.includes('Juan') && r.textContent.includes('Enviado')));
check('Marca recordatorio enviado', true);
const juan = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const found = Object.entries(db.players).find(([, p]) => p.name === 'Juan Pérez');
  return { id: found[0], ...found[1] };
});
check('Token del link guardado en el jugador', juan.confirmToken && juan.confirmToken.length >= 16 && remindText.includes(`t=${juan.confirmToken}`) && juan.reminderSentAt > 0);
const publicCard = await page.evaluate((token) => JSON.parse(localStorage.getItem('f7c-demo-db')).confirmations[token], juan.confirmToken);
check('La ficha pública no tiene teléfono', publicCard && publicCard.name === 'Juan Pérez' && publicCard.phone == null && !JSON.stringify(publicCard).includes('549'));
await page.click('dialog.sheet [data-close]');

const bad = await ctx.newPage();
await bad.goto(`${BASE}confirmar.html?m=${encodeURIComponent(juan.matchId)}&p=${encodeURIComponent(juan.id)}&t=token-falso-que-no-coincide`);
await bad.waitForSelector('text=Este link no es válido');
check('Token incorrecto no confirma', (await page.evaluate((id) => JSON.parse(localStorage.getItem('f7c-demo-db')).players[id].confirmed, juan.id)) == null);
await bad.close();

const confirmPage = await ctx.newPage();
await confirmPage.goto(`${BASE}confirmar.html?m=${encodeURIComponent(juan.matchId)}&p=${encodeURIComponent(juan.id)}&t=${encodeURIComponent(juan.confirmToken)}`);
await confirmPage.waitForSelector('#btn-si');
check('confirmar.html no pide ¿Quién sos?', (await confirmPage.locator('text=¿Quién sos?').count()) === 0);
const confirmBody = await confirmPage.locator('body').innerText();
check('La página no muestra teléfonos ni a los otros', !confirmBody.includes('549') && !confirmBody.includes('1234') && !confirmBody.includes('Pedro') && confirmBody.includes('Juan Pérez') && confirmBody.includes('Cancha 2'), confirmBody.replace(/\s+/g, ' ').slice(0, 180));
await confirmPage.click('#btn-si');
await confirmPage.waitForSelector('#thanks:not([hidden])');
check('Agradece el sí', (await confirmPage.textContent('#thanks')).includes('jugás'));
await page.waitForFunction(() => document.querySelector('#slots .slot')?.innerText.includes('Confirmó'));
check('El organizador ve ✅ Confirmó al instante', (await page.textContent('#slots .slot:has-text("Juan Pérez")')).includes('Confirmó'));
await confirmPage.click('#btn-no');
await confirmPage.waitForFunction(() => (document.querySelector('#thanks')?.textContent || '').includes('no jugás'));
await page.waitForFunction(() => (document.querySelector('#confirm-sum')?.textContent || '').includes('No juegan: 1'));
check('Se puede cambiar a No juego', (await page.textContent('#slots .slot:has-text("Juan Pérez")')).includes('No juega'));
await confirmPage.close();

// Número inválido
await page.click('#btn-add-player');
await page.fill('#player-form [name=name]', 'Error');
await page.fill('#player-form [name=phone]', '123');
await page.click('#player-form button[type=submit]');
check('Valida número inválido', (await page.textContent('#pf-err')).includes('inválido'));
await page.click('#player-form [data-close]');

// Cambiar de cuenta a Martín
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'martin@demo.local');
await page.fill('#login-password', 'demo-martin');
await page.click('#login-form button[type=submit]');
await page.waitForSelector('#btn-who');
await page.waitForSelector('#btn-add-player');
check('Sesión de Martín', (await page.textContent('#btn-who')).includes('Martín'));
check('La sesión queda en el navegador', (await page.evaluate(() => JSON.parse(localStorage.getItem('f7c-demo-auth')).session.name)) === 'Martín');
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

// Pagos
await page.click('.slot:has-text("Juan Pérez") .pay-btn');
await page.waitForSelector('#pay-form');
check('El formulario de pago arranca sin monto', await page.isHidden('#pay-details'));
await page.click('#pay-form [data-paid="si"]');
await page.click('#pay-form button[type=submit]');
check('Pago exige monto', (await page.textContent('#pay-err')).includes('monto'));
await page.fill('#pay-form [name=amount]', '5.000');
await page.click('#pay-form button[type=submit]');
check('Pago exige medio', (await page.textContent('#pay-err')).includes('Efectivo'));
await page.click('#pay-form [data-method="transferencia"]');
await page.click('#pay-form button[type=submit]');
await page.waitForSelector('.slot:has-text("Juan Pérez") .pay-line.ok');
const juanPay = (await page.textContent('.slot:has-text("Juan Pérez") .pay-line')).replace(/\s+/g, ' ');
check('Juan: Pagó $5.000 · Transferencia', juanPay.includes('Pagó $5.000') && juanPay.includes('Transferencia'), juanPay);

await page.click('.slot:has-text("Pedro G.") .pay-btn');
await page.click('#pay-form [data-paid="no"]');
check('Si no pagó se oculta el monto', await page.isHidden('#pay-details'));
await page.click('#pay-form button[type=submit]');
await page.waitForSelector('.slot:has-text("Pedro G.") .pay-line.no');
check('Pedro: No pagó', (await page.textContent('.slot:has-text("Pedro G.") .pay-line')).includes('No pagó'));
check('Nico sigue sin estado de pago', (await page.$$('.slot:has-text("Nico Ruiz") .pay-line')).length === 0);
const rec = (await page.textContent('#collected')).replace(/\s+/g, ' ');
check('Total recaudado 1/3', rec.includes('Recaudado: $5.000') && rec.includes('1/3 pagaron'), rec);

await page.click('#btn-copy');
const clipPay = await page.evaluate(() => navigator.clipboard.readText());
check('La lista copiada incluye los pagos',
  clipPay.includes('1. Juan Pérez — Pagó $5.000 · Transferencia')
  && clipPay.includes('Pedro G. — No pagó')
  && clipPay.includes('3. Nico Ruiz\n')
  && clipPay.includes('Recaudado: $5.000 · 1/3 pagaron'),
  clipPay.split('\n').filter((l) => l.includes('Juan') || l.includes('Pedro') || l.includes('Nico') || l.includes('Recaudado')).join(' | '));

const stored = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  return Object.values(db.players).find((p) => p.name === 'Juan Pérez');
});
check('El pago queda en el jugador (localStorage)', stored?.paid === true && stored.amount === 5000 && stored.method === 'transferencia' && stored.paidUpdatedBy === 'Martín' && stored.receivedBy === 'Martín');
await page.click('.slot:has-text("Juan Pérez") .pay-btn');
check('Cobró arranca en quien está usando la app', await page.$eval('#pay-form [data-receiver="Martín"]', (el) => el.classList.contains('primary')));
await page.click('#pay-form [data-close]');

// Otra pestaña del mismo navegador ve el cambio al guardarlo
const page2 = await ctx.newPage();
page2.on('dialog', (d) => d.accept());
await page2.goto(page.url());
await page2.waitForSelector('.slot:has-text("Juan Pérez") .pay-line.ok');
check('Otra pestaña ve el pago ya cargado', (await page2.textContent('.slot:has-text("Juan Pérez") .pay-line')).includes('Transferencia'));
await page.click('.slot:has-text("Juan Pérez") .pay-btn');
await page.fill('#pay-form [name=amount]', '4500');
await page.click('#pay-form [data-method="efectivo"]');
await page.click('#pay-form button[type=submit]');
await page2.waitForFunction(() => document.body.innerText.includes('Efectivo') && document.body.innerText.includes('$4.500'));
check('La otra pestaña se actualiza sola', (await page2.textContent('#collected')).replace(/\s+/g, ' ').includes('Recaudado: $4.500'));
await page2.close();

await page.click('#btn-mine');
await page.waitForFunction(() => document.querySelector('#btn-mine')?.textContent === 'Todos');
check('Mis oculta a quien no anoté ni cobré', (await page.locator('#slots .name', { hasText: 'Pedro G.' }).count()) === 0);
check('Mis muestra a quien anoté y a quien le cobré',
  (await page.locator('#slots .name', { hasText: 'Nico Ruiz' }).count()) === 1
  && (await page.locator('#slots .name', { hasText: 'Juan Pérez' }).count()) === 1);
check('El cupo sigue siendo el del partido', (await page.textContent('#slot-count')) === '3/14');
const mineText = (await page.textContent('#mine-stats')).replace(/\s+/g, ' ');
check('Estadística propia del partido', mineText.includes('Anotaste 1') && mineText.includes('Cobraste $4.500'), mineText);
await page.click('#btn-mine');
await page.waitForSelector('#slots .name:text-is("Pedro G.")');

// Lista de espera con lugares libres: queda al final, no ocupa un cupo
await page.click('#btn-add-wait');
await page.fill('#player-form [name=name]', 'Espera Cero');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#wait-list .name:text-is("Espera Cero")');
check('Anotar en espera no ocupa un lugar libre', (await page.textContent('#slot-count')) === '3/14');
check('Con un solo suplente, ↑ y ↓ están deshabilitadas',
  await page.isDisabled('#wait-list [data-wait-up]') && await page.isDisabled('#wait-list [data-wait-down]'));

// Completar el cupo
for (let i = 4; i <= 14; i++) {
  await page.click('#btn-add-player');
  await page.fill('#player-form [name=name]', `Jugador ${i}`);
  await page.click('#player-form button[type=submit]');
  await page.waitForSelector(`#slots .name:text-is("Jugador ${i}")`);
}
check('14/14 y se puede seguir anotando (van a la espera)', (await page.textContent('#slot-count')) === '14/14' && !(await page.isDisabled('#btn-add-player')));
check('El total pasa a 1/14', (await page.textContent('#collected')).replace(/\s+/g, ' ').includes('Recaudado: $4.500 · 1/14 pagaron'));
check('Cero sigue en espera al llenarse el partido', (await page.textContent('#wait-list')).includes('Espera Cero') && !(await page.locator('#slots').getByText('Espera Cero', { exact: true }).count()));

await page.click('#btn-add-player');
await page.fill('#player-form [name=name]', 'Espera Ana');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#wait-list .name:text-is("Espera Ana")');
await page.click('#btn-add-wait');
await page.fill('#player-form [name=name]', 'Espera Beto');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#wait-list .name:text-is("Espera Beto")');
const namesBefore = await page.$$eval('#wait-list .name', (els) => els.map((e) => e.textContent));
check('Los nuevos quedan al final, en orden de llegada', JSON.stringify(namesBefore) === JSON.stringify(['Espera Cero', 'Espera Ana', 'Espera Beto']), namesBefore.join(', '));
const arrows = async () => page.$$eval('#wait-list .slot', (rows) => rows.map((row) => ({
  name: row.querySelector('.name').textContent,
  up: row.querySelector('[data-wait-up]').disabled,
  down: row.querySelector('[data-wait-down]').disabled,
})));
let arrowState = await arrows();
check('↑ deshabilitada en el primero y ↓ en el último', arrowState[0].up && !arrowState[0].down && arrowState.at(-1).down && !arrowState.at(-1).up, JSON.stringify(arrowState));
check('Subir al partido está deshabilitado con el cupo lleno', await page.isDisabled('#btn-promote'));

await page.locator('#wait-list .slot', { hasText: 'Espera Beto' }).locator('[data-wait-up]').click();
await page.waitForFunction(() => {
  const names = [...document.querySelectorAll('#wait-list .name')].map((e) => e.textContent);
  return names[1] === 'Espera Beto';
});
await page.locator('#wait-list .slot', { hasText: 'Espera Beto' }).locator('[data-wait-up]').click();
await page.waitForFunction(() => document.querySelector('#wait-list .name')?.textContent === 'Espera Beto');
arrowState = await arrows();
check('Reordenar con ↑ deja a Beto primero y le deshabilita la flecha', arrowState[0].name === 'Espera Beto' && arrowState[0].up && arrowState.at(-1).down, JSON.stringify(arrowState));
const orders = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  return Object.values(db.players).filter((p) => p.waiting).sort((a, b) => a.waitOrder - b.waitOrder).map((p) => p.name);
});
check('waitOrder queda guardado', JSON.stringify(orders) === JSON.stringify(['Espera Beto', 'Espera Cero', 'Espera Ana']), orders.join(', '));

const pageWait = await ctx.newPage();
pageWait.on('dialog', (d) => d.accept());
await pageWait.goto(page.url());
await pageWait.waitForFunction(() => document.querySelector('#wait-list .name')?.textContent === 'Espera Beto');
check('La otra pestaña ve el mismo orden', (await pageWait.textContent('#wait-list .name')) === 'Espera Beto');
await pageWait.close();

await page.locator('#slots .slot', { hasText: 'Jugador 14' }).locator('.more-btn').click();
await page.click('#pm-del');
await page.waitForSelector('#slots .name:text-is("Espera Beto")');
check('Subir al partido se lleva al primero de la espera', !(await page.locator('#wait-list').getByText('Espera Beto', { exact: true }).count()) && (await page.textContent('#slot-count')) === '14/14');
const left = await page.$$eval('#wait-list .name', (els) => els.map((e) => e.textContent));
check('La espera sigue en el orden que quedó', JSON.stringify(left) === JSON.stringify(['Espera Cero', 'Espera Ana']), left.join(', '));

// Volver al inicio: contador
await page.click('#btn-back');
await page.waitForSelector('.match-card');
check('Inicio muestra 14/14 en la tarjeta', (await page.textContent('.match-card:has-text("Jueves 22/10") .count')).replace(/\s/g, '') === '14/14');

// Persistencia tras recargar
await page.reload();
await page.waitForSelector('.match-card');
check('Datos persisten tras recargar (sin volver a pedir la contraseña)', (await page.$$('.match-card')).length === 5 && (await page.locator('#login-form').count()) === 0);
check('Sigue en modo demo tras recargar', (await page.evaluate(() => window.__app?.store?.mode)) === 'demo');
await page.click('.match-card:has-text("Jueves 22/10")');
await page.waitForSelector('.slot:has-text("Juan Pérez") .pay-line.ok');
check('El pago persiste tras recargar', (await page.textContent('.slot:has-text("Juan Pérez") .pay-line')).includes('Efectivo') && (await page.textContent('#collected')).includes('$4.500'));
await page.click('#btn-back');
await page.waitForSelector('.match-card');

// Borrar partido
await page.click('.match-card:has-text("Lunes 26/10")');
await page.click('#btn-del-match');
await page.waitForFunction(() => document.querySelectorAll('.match-card').length === 4);
check('Borrar partido', true);

// Cartel de 2 horas. El reloj está fijo en lunes 19/10 13:00.
check('Un partido a varios días no muestra el cartel', (await page.locator('.remind-banner').count()) === 0);
await page.click('#btn-add-match');
await page.fill('#match-form [name=date]', '2026-10-19');
await page.fill('#match-form [name=time]', '15:05');
await page.fill('#match-form [name=note]', 'Cancha 1');
await page.click('#match-form button[type=submit]');
await page.waitForSelector('.match-card:has-text("Lunes 19/10")');
check('A más de 2 horas tampoco hay cartel', (await page.locator('.remind-banner').count()) === 0);
await page.click('.match-card:has-text("Lunes 19/10")');
await page.click('#btn-add-player');
await page.fill('#player-form [name=name]', 'Ana Hoy');
await page.fill('#player-form [name=phone]', '11 5555-0101');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('.slot .name:text-is("Ana Hoy")');
check('Sigue sin cartel hasta que falten 2 horas', (await page.locator('.remind-banner').count()) === 0);
await page.evaluate(() => {
  window.__notes = [];
  const Real = window.Notification;
  function Wrapped(title, opts) {
    window.__notes.push({ title, body: opts && opts.body || '' });
    try { return new Real(title, opts); } catch { return { onclick: null, close() {} }; }
  }
  Wrapped.permission = 'granted';
  Wrapped.requestPermission = () => Promise.resolve('granted');
  window.Notification = Wrapped;
});
await page.clock.fastForward(6 * 60 * 1000);
await page.waitForSelector('.remind-banner');
const bannerText = (await page.textContent('.remind-banner')).replace(/\s+/g, ' ');
check('Cartel en el partido al cumplirse las 2 horas', bannerText.includes('Faltan 2 horas: mandá los recordatorios') && bannerText.includes('0 de 1 enviados'), bannerText);
const notes = await page.evaluate(() => window.__notes);
check('Aviso local solo porque la app estaba abierta y el permiso ya estaba', notes.some((n) => n.title === 'Faltan 2 horas: mandá los recordatorios'), JSON.stringify(notes));
await page.click('.remind-banner');
await page.waitForSelector('#remind-list a[data-send]');
check('El cartel abre el mismo envío', (await page.textContent('#remind-list')).includes('Ana Hoy'));
await page.click('dialog.sheet [data-close]');
await page.click('#btn-back');
await page.waitForSelector('.remind-banner');
check('El mismo cartel está en el inicio', (await page.textContent('.remind-banner')).includes('Faltan 2 horas: mandá los recordatorios'));
await page.click('.remind-banner');
await page.waitForSelector('#remind-list a[data-send]');
const [soonPopup] = await Promise.all([page.waitForEvent('popup'), page.click('#remind-list a[data-send]')]);
await soonPopup.close();
await page.waitForFunction(() => !document.querySelector('.remind-banner'));
check('El cartel se va cuando el recordatorio quedó enviado', (await page.locator('.remind-banner').count()) === 0);
await page.click('dialog.sheet [data-close]');

// Plantel guardado y búsqueda rápida
await page.click('#btn-roster');
await page.waitForSelector('#btn-add-roster');
check('Pantalla Jugadores desde el inicio', (await page.textContent('h2')).includes('Jugadores'));
await page.click('#btn-add-roster');
await page.fill('#roster-form [name=name]', 'Ernesto Pereira');
await page.fill('#roster-form [name=phone]', '11 2222-3333');
await page.click('#roster-form button[type=submit]');
await page.waitForSelector('#roster-list .name:text-is("Ernesto Pereira")');
await page.click('#btn-add-roster');
await page.fill('#roster-form [name=name]', 'José Pérez');
await page.fill('#roster-form [name=phone]', '11 4444-5555');
await page.click('#roster-form button[type=submit]');
await page.waitForSelector('#roster-list .name:text-is("José Pérez")');
await page.fill('#roster-q', 'jose');
await page.waitForFunction(() => {
  const names = [...document.querySelectorAll('#roster-list .name')].map((e) => e.textContent);
  return names.length === 1 && names[0] === 'José Pérez';
});
check('Buscar jose encuentra a José Pérez', true);
await page.click('#btn-back');
await page.waitForSelector('.match-card');
await page.click('.match-card:has-text("Martes 20/10")');
await page.click('#btn-add-player');
await page.fill('#roster-find', 'ERN');
await page.waitForSelector('#roster-hits .roster-hit:has-text("Ernesto Pereira")');
check('ERN encuentra a Ernesto Pereira', (await page.textContent('#roster-hits')).includes('Ernesto Pereira') && !(await page.textContent('#roster-hits')).includes('José'));
await page.fill('#roster-find', 'pereira');
await page.waitForSelector('#roster-hits .roster-hit:has-text("Ernesto Pereira")');
check('El apellido pereira también lo encuentra', true);
await page.fill('#roster-find', '2222-3333');
await page.waitForSelector('#roster-hits .roster-hit:has-text("Ernesto Pereira")');
check('Un tramo del teléfono lo encuentra', (await page.textContent('#roster-hits')).includes('Ernesto Pereira'));
await page.click('#roster-hits .roster-hit');
await page.waitForSelector('#slots .name:text-is("Ernesto Pereira")');
check('Tocarlo lo anota en el partido', (await page.textContent('#slot-count')) === '1/14');
await page.click('#btn-add-player');
await page.fill('#player-form [name=name]', 'Luis Gómez');
await page.fill('#player-form [name=phone]', '11 6666-7777');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#slots .name:text-is("Luis Gómez")');
await page.click('#btn-back');
await page.click('#btn-roster');
await page.waitForSelector('#roster-list .name:text-is("Luis Gómez")');
check('El jugador nuevo del partido quedó en Jugadores', (await page.$$eval('#roster-list .name', (els) => els.map((e) => e.textContent).sort().join(','))).includes('Ernesto Pereira') && (await page.locator('#roster-list .name', { hasText: 'Luis Gómez' }).count()) === 1);
await page.locator('#roster-list .slot', { hasText: 'Ernesto Pereira' }).locator('[data-roster-edit]').click();
await page.fill('#roster-form [name=name]', 'Ernesto P.');
await page.click('#roster-form button[type=submit]');
await page.waitForSelector('#roster-list .name:text-is("Ernesto P.")');
check('Se puede editar un jugador guardado', true);
await page.locator('#roster-list .slot', { hasText: 'Luis Gómez' }).locator('[data-roster-del]').click();
await page.waitForFunction(() => !document.body.innerText.includes('Luis Gómez'));
check('Se puede borrar un jugador guardado', (await page.locator('#roster-list .name', { hasText: 'Luis Gómez' }).count()) === 0);
await page.click('#btn-add-roster');
await page.fill('#roster-form [name=name]', 'Otro Pérez');
await page.fill('#roster-form [name=phone]', '11 4444-5555');
await page.click('#roster-form button[type=submit]');
check('No duplica el mismo WhatsApp', (await page.textContent('#rf-err')).includes('ya tiene ese WhatsApp'));
await page.click('#roster-form [data-close]');
await page.click('#btn-back');
await page.waitForSelector('.match-card');

// Perfil: tocar al jugador, nivel, posiciones, nota y estadística de un partido ya jugado
await page.click('.match-card:has-text("Martes 20/10")');
await page.click('#btn-edit-match');
await page.fill('#match-form [name=date]', '2026-10-15');
await page.fill('#match-form [name=time]', '21:00');
await page.click('#match-form button[type=submit]');
await page.waitForFunction(() => document.querySelector('h1')?.textContent.includes('Jueves 15/10'));
await page.locator('#slots .who', { hasText: 'Ernesto Pereira' }).click();
await page.waitForSelector('#profile');
check('Tocarlo abre el perfil con WhatsApp', (await page.getAttribute('#profile-wa', 'href')).startsWith('https://wa.me/5491122223333'));
check('Cuenta el partido pasado en la lista principal', (await page.textContent('#stat-times')).includes('Jugó 1 vez'));
check('Mayormente jueves · 21:00', (await page.textContent('#stat-summary')).includes('Mayormente jueves · 21:00'));
for (let i = 0; i < 8; i++) await page.click('#level-up');
await page.waitForFunction(() => document.querySelector('#level-val')?.textContent === '8');
check('Nivel de juego 8', true);
await page.click('[data-pos="Defensa"]');
await page.click('[data-pos="Mediocampo"]');
check('Posiciones Defensa y Mediocampo', (await page.locator('[data-pos="Defensa"].on').count()) === 1 && (await page.locator('[data-pos="Ataque"].on').count()) === 0 && (await page.locator('[data-pos="Mediocampo"].on').count()) === 1);
await page.click('#btn-add-note');
await page.fill('#note-form [name=text]', 'Hizo un gol');
await page.click('#note-form button[type=submit]');
await page.waitForSelector('.pnote:has-text("Hizo un gol")');
check('La nota muestra la fecha del partido', (await page.textContent('.pnote')).includes('Jueves 15/10') && (await page.textContent('.pnote')).includes('Hizo un gol'));
await page.click('#btn-back');
await page.click('#btn-roster');
await page.locator('#roster-list .who', { hasText: 'Ernesto P.' }).click();
await page.waitForSelector('#profile');
check('Desde Jugadores es el mismo perfil', (await page.textContent('#level-val')) === '8' && (await page.textContent('#notes')).includes('Hizo un gol'));
await page.click('#btn-back');
await page.waitForSelector('#btn-roster');

// Resumen de pagos (sigue la sesión de Martín) y alta de usuarios (solo el admin)
await page.click('#btn-pagos');
await page.waitForSelector('#pay-summary');
const orgTotals = (await page.textContent('#org-totals')).replace(/\s+/g, ' ');
check('Totales por organizador', orgTotals.includes('Martín') && orgTotals.includes('Gustavo') && orgTotals.includes('$4.500'), orgTotals);
const juanPayRow = async () => (await page.locator('#pay-summary .pay-row', { hasText: 'Juan Pérez' }).innerText()).replace(/\s+/g, ' ');
let juanMoney = await juanPayRow();
check('Pagos: Juan le pagó $4.500 a Martín', juanMoney.includes('Martín: $4.500') && juanMoney.includes('Anotó Gustavo: 1 vez'), juanMoney);
await page.click('#pay-filter [data-pay-filter="Martín"]');
juanMoney = await juanPayRow();
check('El filtro de Pagos deja solo a Martín', juanMoney.includes('Martín: $4.500') && !juanMoney.includes('Gustavo'), juanMoney);
await page.click('#pay-filter [data-pay-filter=""]');
await page.locator('#pay-summary .pay-row', { hasText: 'Juan Pérez' }).locator('[data-pay-open]').click();
await page.waitForSelector('#ledger-total');
const ledgerText = (await page.locator('#ledger').innerText()).replace(/\s+/g, ' ');
check('El perfil suma el mes y el cobrador', ledgerText.includes('Pagó $4.500') && ledgerText.includes('Oct 2026: $4.500') && ledgerText.includes('Martín: $4.500') && ledgerText.includes('Anotó Gustavo: 1 vez'), ledgerText);
await page.click('#pay-filter [data-pay-filter="Martín"]');
await page.waitForFunction(() => {
  const signed = document.querySelector('#ledger-signups')?.innerText || '';
  const by = document.querySelector('#ledger-by')?.innerText || '';
  return by.includes('Martín: $4.500') && signed.includes('Anotó Martín: 1 vez') && !signed.includes('Gustavo') && !by.includes('Gustavo');
});
check('El filtro del perfil deja el cobro y las anotaciones de Martín', (await page.textContent('#ledger-months')).includes('Oct 2026: $4.500'));
await page.click('#btn-back');
await page.waitForSelector('#btn-roster');

await page.evaluate(() => { location.hash = '#/usuarios'; });
await page.waitForFunction(() => (document.body.innerText || '').includes('Solo el administrador puede crear o desactivar organizadores'));
check('Martín no crea ni borra organizadores', (await page.locator('#user-form').count()) === 0 && (await page.locator('[data-user-del]').count()) === 0);
await page.click('#btn-back');
await page.waitForSelector('#btn-add-match');
check('Martín sigue pudiendo agregar partidos', await page.isVisible('#btn-add-match'));

await page.click('#btn-settings');
check('Un organizador no administra usuarios', (await page.locator('#set-users').count()) === 0);
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'gustavo@demo.local');
await page.fill('#login-password', 'demo-gustavo');
await page.click('#login-form button[type=submit]');
await page.waitForSelector('#btn-who');
await page.waitForSelector('#btn-add-match');
await page.click('#btn-settings');
await page.click('#set-users');
await page.waitForSelector('#user-form');
await page.fill('#user-form [name=name]', 'Lucía');
await page.fill('#user-form [name=email]', 'lucia@demo.local');
await page.fill('#user-form [name=password]', 'demo-lucia');
await page.click('#user-form button[type=submit]');
await page.waitForFunction(() => (document.querySelector('#user-list')?.innerText || '').includes('Lucía'));
check('El admin crea un organizador', true);
await page.locator('#user-list .slot', { hasText: 'Lucía' }).locator('[data-user-active]').click();
await page.waitForFunction(() => (document.querySelector('#user-list')?.innerText || '').includes('desactivado'));
check('El admin desactiva un organizador', true);
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'lucia@demo.local');
await page.fill('#login-password', 'demo-lucia');
await page.click('#login-form button[type=submit]');
await page.waitForFunction(() => (document.querySelector('#login-err')?.textContent || '').includes('desactivada'));
check('Una cuenta desactivada no entra', true);
await page.fill('#login-email', 'gustavo@demo.local');
await page.fill('#login-password', 'demo-gustavo');
await page.click('#login-form button[type=submit]');
await page.waitForSelector('#user-list');
await page.locator('#user-list .slot', { hasText: 'Lucía' }).locator('[data-user-active]').click();
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('#user-list .slot')].find((el) => el.innerText.includes('Lucía'));
  return row && !row.innerText.includes('desactivado');
});
await page.locator('#user-list .slot', { hasText: 'Lucía' }).locator('[data-user-del]').click();
await page.waitForFunction(() => !(document.querySelector('#user-list')?.innerText || '').includes('Lucía'));
check('El admin borra un organizador', true);

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
