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
check('El texto arranca en Normal', await page.evaluate(() => getComputedStyle(document.documentElement).fontSize) === '18px');
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
check('Al entrar no obliga a elegir WhatsApp', (await page.locator('#wa-choice').count()) === 0);
await page.click('#btn-settings');
await page.waitForSelector('#wa-choice');
check('En Ajustes se elige el WhatsApp', (await page.textContent('#wa-choice')).includes('¿Desde qué WhatsApp querés mandar los mensajes?'));
check('Avisa que Dual Messenger deja elegir', (await page.textContent('#wa-choice-note')).includes('Si tenés dos WhatsApp (Dual Messenger), el celular te va a dejar elegir'));
check('Por defecto pregunta cada vez', (await page.locator('#wa-choice-ask').getAttribute('aria-pressed')) === 'true' && await page.evaluate(() => localStorage.getItem('f7c-wa-from') == null));
check('Las apps forzadas no distinguen el dual', (await page.textContent('#wa-choice-force')).includes('No distinguen el WhatsApp dual'));
await page.click('#wa-choice-business');
check('Guarda WhatsApp Business en este dispositivo', await page.evaluate(() => localStorage.getItem('f7c-wa-from') === 'business'));
const androidLink = await page.evaluate(async () => {
  const { waSendUrl } = await import('./js/phone.js');
  const ask = waSendUrl({ phone: '5491112345678', text: 'Hola Juan', choice: 'ask', android: true });
  const business = waSendUrl({ phone: '5491112345678', text: 'Hola Juan', choice: 'business', android: true });
  return { ask, business };
});
const androidFallback = decodeURIComponent(androidLink.business.split('S.browser_fallback_url=')[1].replace(/;end$/, ''));
check('Preguntar cada vez es un wa.me plano, sin package', androidLink.ask === 'https://wa.me/5491112345678?text=Hola%20Juan' && !androidLink.ask.includes('package='), androidLink.ask);
check('En Android el intent apunta a WhatsApp Business y cae a wa.me',
  androidLink.business.startsWith('intent://wa.me/5491112345678?text=Hola%20Juan#Intent;scheme=https;package=com.whatsapp.w4b;')
  && androidFallback === 'https://wa.me/5491112345678?text=Hola%20Juan', androidLink.business.slice(0, 120));
await page.click('#wa-choice-ask');
check('Se puede volver a que el celular pregunte', await page.evaluate(() => localStorage.getItem('f7c-wa-from') === 'ask'));
await page.click('dialog.sheet [data-close]');
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
await page.click('#btn-remind');
await page.waitForSelector('#remind-list .name');
let remindNames = await page.$$eval('#remind-list .name', (els) => els.map((e) => e.textContent));
check('Enviar recordatorios arranca en mis jugadores',
  remindNames.includes('Nico Ruiz') && !remindNames.includes('Juan Pérez') && (await page.locator('[data-remind-scope="mine"].on').count()) === 1,
  remindNames.join(', '));
await page.click('[data-remind-scope="all"]');
await page.waitForFunction(() => [...document.querySelectorAll('#remind-list .name')].some((e) => e.textContent === 'Juan Pérez'));
const allReminders = await page.textContent('#remind-list');
check('Todos muestra quién ya fue recordado', allReminders.includes('Juan Pérez') && allReminders.includes('Enviado') && allReminders.includes('Nico Ruiz'));
await page.click('dialog.sheet [data-close]');

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
check('El efectivo arranca en el precio del partido', await page.$eval('#pay-form [name=cash]', (el) => el.value.replace(/\./g, '') === '5000'));
await page.fill('#pay-form [name=cash]', '');
await page.fill('#pay-form [name=transfer]', '');
await page.click('#pay-form button[type=submit]');
check('Pago exige monto', (await page.textContent('#pay-err')).includes('monto'));
await page.fill('#pay-form [name=transfer]', '5.000');
await page.fill('#pay-form [name=cash]', '');
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
check('Cobró arranca en quien está usando la app', await page.$eval('#pay-form [name=transferTo]', (el) => el.value === 'Martín'));
await page.click('#pay-form [data-close]');

// Otra pestaña del mismo navegador ve el cambio al guardarlo
const page2 = await ctx.newPage();
page2.on('dialog', (d) => d.accept());
await page2.goto(page.url());
await page2.waitForSelector('.slot:has-text("Juan Pérez") .pay-line.ok');
check('Otra pestaña ve el pago ya cargado', (await page2.textContent('.slot:has-text("Juan Pérez") .pay-line')).includes('Transferencia'));
await page.click('.slot:has-text("Juan Pérez") .pay-btn');
await page.fill('#pay-form [name=cash]', '4500');
await page.fill('#pay-form [name=transfer]', '');
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
const ceroText = (await page.locator('#wait-list .slot', { hasText: 'Espera Cero' }).innerText()).replace(/\s+/g, ' ');
check('La lista de espera no muestra sin respuesta', !ceroText.includes('Sin respuesta') && !ceroText.includes('Confirmó'), ceroText);
const ceroSum = await page.textContent('#confirm-sum');
check('La espera no suma al pendiente de confirmar', ceroSum.includes('No juegan: 1') && ceroSum.includes('Sin respuesta: 2'), ceroSum);
const ceroMatch = await page.evaluate(() => location.hash);
await page.locator('#wait-list .who', { hasText: 'Espera Cero' }).click();
await page.waitForSelector('#profile-phone');
check('El perfil de quien solo está en espera no dice sin respuesta', (await page.locator('#stat-confirm').count()) === 0);
await page.evaluate((hash) => { location.hash = hash; }, ceroMatch);
await page.waitForSelector('#wait-list .name:text-is("Espera Cero")');
check('Con un solo suplente, ↑ y ↓ están deshabilitadas',
  await page.isDisabled('#wait-list [data-wait-up]') && await page.isDisabled('#wait-list [data-wait-down]'));
const barIds = await page.$$eval('.match-actions > *', (els) => els.map((el) => el.id));
check('La barra es compartir, espera y agregar', JSON.stringify(barIds) === JSON.stringify(['btn-share', 'btn-add-wait', 'btn-add-player']), barIds.join(','));
check('Compartir lista es un ícono con nombre', (await page.getAttribute('#btn-share', 'aria-label')) === 'Compartir lista'
  && await page.evaluate(() => getComputedStyle(document.querySelector('#btn-share svg')).display !== 'none'));
check('La espera ya no tiene la botonera de la sección', (await page.locator('.wait-tools').count()) === 0);
check('La fila de espera no tiene botón de pago', (await page.locator('#wait-list .pay-btn').count()) === 0);
check('Subir al partido de esa fila está habilitado', !(await page.isDisabled('#wait-list [data-promote]')));

// Completar el cupo
for (let i = 4; i <= 14; i++) {
  await page.click('#btn-add-player');
  await page.fill('#player-form [name=name]', `Jugador ${i}`);
  await page.click('#player-form button[type=submit]');
  await page.waitForSelector(`#slots .name:text-is("Jugador ${i}")`);
}
check('14/14 y se puede seguir anotando (van a la espera)', (await page.textContent('#slot-count')) === '14/14' && !(await page.isDisabled('#btn-add-player')));
check('Agregar jugador no cambia de nombre con el cupo lleno', (await page.textContent('#btn-add-player')).includes('Agregar jugador'));
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
const promoteOff = await page.$$eval('#wait-list [data-promote]', (els) => els.length === 3 && els.every((el) => el.disabled));
check('Subir al partido está deshabilitado con el cupo lleno', promoteOff);

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
await page.click('#btn-add-player');
await page.fill('#player-form [name=name]', 'Reserva Tarde');
await page.check('#player-tentative');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#toast');
check('Sin lugar no se reserva ni se anota', (await page.textContent('#toast')).includes('No hay lugar libre para reservar')
  && (await page.locator('#player-form').count()) === 1
  && !(await page.locator('#wait-list').getByText('Reserva Tarde', { exact: true }).count()));
await page.click('#player-form [data-close]');

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

// Lugar reservado y aviso de WhatsApp al subir. El lunes está vacío.
await page.click('.match-card:has-text("Lunes 26/10")');
await page.waitForSelector('#btn-add-player');
await page.click('#btn-add-wait');
check('Anotar en espera no ofrece lugar reservado', (await page.locator('#player-tentative').count()) === 0);
await page.click('#player-form [data-close]');
await page.click('#btn-add-player');
check('El alta al partido ofrece lugar reservado', await page.isVisible('#player-tentative'));
await page.fill('#player-form [name=name]', 'Reserva Luis');
await page.fill('#player-form [name=phone]', '11 6666-0101');
await page.check('#player-tentative');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#slots .name:text-is("Reserva Luis")');
const luisRow = (await page.locator('#slots .slot', { hasText: 'Reserva Luis' }).innerText()).replace(/\s+/g, ' ');
check('Reservado ocupa cupo, no va a la espera y no figura confirmado',
  (await page.textContent('#slot-count')) === '1/14'
  && (await page.locator('#wait-list').getByText('Reserva Luis', { exact: true }).count()) === 0
  && luisRow.includes('Reservado · a confirmar')
  && !luisRow.includes('Confirmó')
  && !luisRow.includes('Sin respuesta'), luisRow);
check('El resumen cuenta A confirmar', (await page.textContent('#confirm-sum')).includes('A confirmar: 1') && (await page.textContent('#confirm-sum')).includes('Sin respuesta: 0'));
const luisStored = await page.evaluate(() => {
  const person = Object.values(JSON.parse(localStorage.getItem('f7c-demo-db')).players).find((p) => p.name === 'Reserva Luis');
  return { tentative: person.tentative, at: typeof person.tentativeAt === 'number', waiting: person.waiting, token: person.confirmToken };
});
check('Guarda tentative y tentativeAt', luisStored.tentative === true && luisStored.at && luisStored.waiting !== true && luisStored.token.length >= 16);
const luisIds = await page.evaluate(() => {
  const found = Object.entries(JSON.parse(localStorage.getItem('f7c-demo-db')).players).find(([, p]) => p.name === 'Reserva Luis');
  return { id: found[0], matchId: found[1].matchId };
});
const luisNo = await ctx.newPage();
await luisNo.goto(`${BASE}confirmar.html?m=${encodeURIComponent(luisIds.matchId)}&p=${encodeURIComponent(luisIds.id)}&t=${encodeURIComponent(luisStored.token)}`);
await luisNo.waitForSelector('#btn-no');
await luisNo.click('#btn-no');
await page.waitForFunction(() => document.body.innerText.includes('se puede liberar el lugar'));
check('Si dice que no, el lugar reservado se puede liberar', (await page.locator('#slots .slot', { hasText: 'Reserva Luis' }).innerText()).includes('Reservado · a confirmar'));
await luisNo.close();
await page.locator('#slots .slot', { hasText: 'Reserva Luis' }).locator('.confirm-spot').click();
await page.waitForFunction(() => !document.body.innerText.includes('Reservado · a confirmar'));
check('Confirmar lugar saca el badge', (await page.locator('.reserved-badge').count()) === 0);
await page.click('#btn-add-wait');
await page.fill('#player-form [name=name]', 'Avisa Teo');
await page.fill('#player-form [name=phone]', '11 6666-2222');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#wait-list .name:text-is("Avisa Teo")');
const teoWait = (await page.locator('#wait-list .slot', { hasText: 'Avisa Teo' }).innerText()).replace(/\s+/g, ' ');
check('En espera no figura sin respuesta', !teoWait.includes('Sin respuesta') && !teoWait.includes('Confirmó'), teoWait);
const teoSum = await page.textContent('#confirm-sum');
check('En espera no entra en el resumen', teoSum.includes('Sin respuesta: 0') && teoSum.includes('No juegan: 1'), teoSum);
const [teoPopup] = await Promise.all([
  page.waitForEvent('popup'),
  page.locator('#wait-list .slot', { hasText: 'Avisa Teo' }).locator('[data-promote]').click(),
]);
await page.waitForSelector('#slots .name:text-is("Avisa Teo")');
const teoRow = (await page.locator('#slots .slot', { hasText: 'Avisa Teo' }).innerText()).replace(/\s+/g, ' ');
check('Al subir al partido vuelve la confirmación', teoRow.includes('Sin respuesta') && (await page.textContent('#confirm-sum')).includes('Sin respuesta: 1'), teoRow);
const teoUrl = teoPopup.url();
check('Avisar por WhatsApp abre el chat sin mandar solo', /(?:wa\.me\/|phone=)5491166662222/.test(teoUrl), teoUrl.slice(0, 100));
const teoText = decodeURIComponent(new URL(teoUrl).searchParams.get('text') || '');
check('El mensaje usa el nombre, el día, la hora y el link',
  teoText.startsWith('¡Hola Avisa Teo!')
  && teoText.includes('Polideportivo Colegiales')
  && teoText.includes('lunes 26/10')
  && teoText.includes('21:00')
  && teoText.includes('confirmar.html?m=')
  && teoText.includes(luisStored.token) === false
  && teoText.includes('t='), teoText.slice(0, 180));
await teoPopup.close();
await page.click('#btn-add-wait');
await page.fill('#player-form [name=name]', 'Sin Fono');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#wait-list .name:text-is("Sin Fono")');
const noPhonePopup = page.waitForEvent('popup', { timeout: 1000 }).catch(() => null);
await page.locator('#wait-list .slot', { hasText: 'Sin Fono' }).locator('[data-promote]').click();
await page.waitForSelector('#slots .name:text-is("Sin Fono")');
await page.waitForFunction(() => (document.querySelector('#toast')?.textContent || '').includes('no tiene WhatsApp'));
check('Sin teléfono muestra un cartel y no abre WhatsApp', (await noPhonePopup) == null);
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

await page.click('.match-card:has-text("Miércoles 21/10")');
await page.click('#btn-add-player');
await page.fill('#player-form [name=name]', 'Ciro Sinwa');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#slots .name:text-is("Ciro Sinwa")');
check('Sin WhatsApp igual se anota', !((await page.textContent('#toast')) || '').includes('hace falta un WhatsApp'));
await page.locator('#slots .who', { hasText: 'Ciro Sinwa' }).click();
await page.waitForSelector('#profile');
check('El perfil abre sin WhatsApp', (await page.textContent('#profile-phone')).includes('Sin número') && (await page.locator('#profile-wa').count()) === 0 && (await page.locator('#profile-add-phone').count()) === 1);
check('Sin número se puede anotar en otros partidos', await page.isVisible('#signup-list'));
await page.click('#profile-add-phone');
await page.fill('#phone-form [name=phone]', '11 7777-8888');
await page.click('#phone-form button[type=submit]');
await page.waitForSelector('#profile-wa');
check('Desde el perfil se carga el WhatsApp', (await page.getAttribute('#profile-wa', 'href')).startsWith('https://wa.me/5491177778888'));
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

// Pago partido y transfiere después, con Gustavo. No toca el $4.500 de Juan.
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card:has-text("Lunes 19/10")');
await page.click('.match-card:has-text("Lunes 19/10")');
await page.waitForSelector('.slot:has-text("Ana Hoy") .pay-btn');
await page.click('.slot:has-text("Ana Hoy") .pay-btn');
await page.click('#pay-form [data-paid="si"]');
await page.fill('#pay-form [name=cash]', '2000');
await page.fill('#pay-form [name=transfer]', '3000');
await page.fill('#pay-form [name=pending]', '1500');
await page.click('#pay-form button[type=submit]');
await page.waitForSelector('.slot:has-text("Ana Hoy") .pay-pending');
const anaPay = (await page.locator('.slot', { hasText: 'Ana Hoy' }).innerText()).replace(/\s+/g, ' ');
check('Fila con efectivo, transferencia y transfiere después',
  anaPay.includes('Pagó $5.000') && anaPay.includes('Efectivo $2.000') && anaPay.includes('Transferencia $3.000') && anaPay.includes('Transfiere después $1.500'), anaPay);
const recSplit = (await page.textContent('#collected')).replace(/\s+/g, ' ');
check('Recaudado no suma lo pendiente', recSplit.includes('Recaudado: $5.000') && recSplit.includes('Transfiere después: $1.500'), recSplit);
await page.click('#btn-copy');
const clipSplit = await page.evaluate(() => navigator.clipboard.readText());
check('La lista copiada incluye transfiere después', clipSplit.includes('Transfiere después $1.500') && clipSplit.includes('Transfiere después: $1.500'), clipSplit);
await page.evaluate(() => { location.hash = '#/pagos'; });
await page.waitForSelector('#pending-list');
const pendingScreen = (await page.locator('#pending-list').innerText()).replace(/\s+/g, ' ');
check('Pagos lista a quien transfiere después', pendingScreen.includes('Ana Hoy') && pendingScreen.includes('Transfiere después $1.500') && (await page.textContent('#pending-total')).includes('$1.500'), pendingScreen);
await page.click('#btn-back');
await page.click('.match-card:has-text("Lunes 19/10")');
await page.click('.slot:has-text("Ana Hoy") .pay-btn');
await page.click('#btn-receive-pending');
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('.slot')].find((el) => el.innerText.includes('Ana Hoy'));
  return row && !row.innerText.includes('Transfiere después') && row.innerText.includes('$6.500');
});
check('Marcar la transferencia la suma a lo cobrado', (await page.textContent('#collected')).replace(/\s+/g, ' ').includes('Recaudado: $6.500'));
const anaStored = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('f7c-demo-db')).players).find((p) => p.name === 'Ana Hoy'));
check('Quedó como transferencia cobrada por Gustavo', anaStored.pendingTransfer == null && anaStored.transfer === 4500 && anaStored.cash === 2000 && anaStored.amount === 6500 && anaStored.transferReceivedBy === 'Gustavo' && anaStored.paid === true);

// Anotar a un jugador en otro partido desde su perfil
await page.evaluate(() => { location.hash = '#/jugadores'; });
await page.waitForSelector('#roster-list .name:text-is("Juan Pérez")');
await page.locator('#roster-list .who', { hasText: 'Juan Pérez' }).click();
await page.waitForSelector('#signup-list');
const juevesRow = page.locator('#signup-list .signup-row', { hasText: 'Jueves 22/10' });
check('El jueves figura Anotado', (await juevesRow.innerText()).includes('Anotado'));
check('El casillero del jueves está marcado y no se puede volver a anotar', await juevesRow.locator('input').isChecked() && await juevesRow.locator('input').isDisabled());
const sabadoRow = page.locator('#signup-list .signup-row', { hasText: 'Sábado 24/10' });
check('El sábado muestra los lugares libres', (await sabadoRow.innerText()).includes('Quedan'));
check('El perfil ofrece lugar reservado', await page.isVisible('#signup-tentative'));
await page.check('#signup-tentative');
await sabadoRow.locator('input[type=checkbox]').check();
check('El botón dice Anotar en 1 partido', (await page.textContent('#btn-signup')).trim() === 'Anotar en 1 partido');
await page.click('#btn-signup');
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('#signup-list .signup-row')].find((el) => el.innerText.includes('Sábado'));
  return row && row.innerText.includes('Anotado');
});
const sabadoPlayers = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('f7c-demo-db')).players).filter((p) => p.name === 'Juan Pérez' && p.matchDate === '2026-10-24'));
check('El sábado usa la misma alta: Gustavo, token y sin duplicar el teléfono', sabadoPlayers.length === 1 && sabadoPlayers[0].addedBy === 'Gustavo' && sabadoPlayers[0].phone === '5491112345678' && sabadoPlayers[0].confirmToken.length >= 16 && sabadoPlayers[0].waiting !== true && sabadoPlayers[0].tentative === true);
const sabadoCard = await page.evaluate((token) => JSON.parse(localStorage.getItem('f7c-demo-db')).confirmations[token], sabadoPlayers[0].confirmToken);
check('La ficha del sábado no tiene teléfono', sabadoCard && sabadoCard.name === 'Juan Pérez' && sabadoCard.phone == null && !JSON.stringify(sabadoCard).includes('549'));
await page.locator('#signup-list .signup-row', { hasText: 'Sábado 24/10' }).locator('[data-open-match]').click();
await page.waitForSelector('#slots .name:text-is("Juan Pérez")');
check('Tocar el sábado abre el partido', (await page.textContent('h1')).includes('Sábado 24/10'));
check('En el sábado se ve el lugar reservado', (await page.locator('#slots .slot', { hasText: 'Juan Pérez' }).innerText()).includes('Reservado · a confirmar'));
await page.evaluate(() => { location.hash = '#/jugadores'; });
await page.locator('#roster-list .who', { hasText: 'Juan Pérez' }).click();
await page.waitForSelector('#signup-list .signup-row:has-text("Sábado 24/10") [data-signup-remove]');
await page.locator('#signup-list .signup-row', { hasText: 'Sábado 24/10' }).locator('[data-signup-remove]').click();
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('#signup-list .signup-row')].find((el) => el.innerText.includes('Sábado'));
  return row && !row.innerText.includes('Anotado');
});
check('Quitar lo saca solo de ese partido', await page.evaluate(() => !Object.values(JSON.parse(localStorage.getItem('f7c-demo-db')).players).some((p) => p.name === 'Juan Pérez' && p.matchDate === '2026-10-24')));

const pickIds = await page.evaluate(async () => {
  const store = window.__app.store;
  const who = window.__app.who;
  const open = await store.addMatch({ date: '2026-10-29', time: '19:00', note: '', capacity: 14 }, who);
  const tight = await store.addMatch({ date: '2026-10-30', time: '19:00', note: '', capacity: 1 }, who);
  return { open, tight };
});
await page.waitForSelector('#signup-list .signup-row:has-text("29/10") input');
const row29 = page.locator('#signup-list .signup-row', { hasText: '29/10' });
const row30 = page.locator('#signup-list .signup-row', { hasText: '30/10' });
await row29.locator('input[type=checkbox]').check();
await row30.locator('input[type=checkbox]').check();
await page.check('#signup-tentative');
check('El botón dice Anotar en 2 partidos', (await page.textContent('#btn-signup')).trim() === 'Anotar en 2 partidos');
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const juan = Object.values(db.players).find((p) => p.name === 'Juan Pérez');
  juan.updatedAt = Date.now();
  localStorage.setItem('f7c-demo-db', JSON.stringify(db));
  window.__app.store._emit();
});
await page.waitForFunction(() => {
  const on = (label) => {
    const row = [...document.querySelectorAll('#signup-list .signup-row')].find((el) => el.innerText.includes(label));
    const input = row?.querySelector('input[type=checkbox]');
    return !!(input && input.checked && !input.disabled);
  };
  return on('29/10') && on('30/10') && document.querySelector('#signup-tentative')?.checked
    && document.querySelector('#btn-signup')?.textContent.trim() === 'Anotar en 2 partidos';
});
check('La selección sigue después de una actualización en vivo', true);
await row30.locator('input[type=checkbox]').uncheck();
await page.evaluate(() => window.__app.store._emit());
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('#signup-list .signup-row')].find((el) => el.innerText.includes('30/10'));
  const input = row?.querySelector('input[type=checkbox]');
  return input && !input.checked && document.querySelector('#btn-signup')?.textContent.trim() === 'Anotar en 1 partido';
});
check('Destildar uno sobrevive al refresh', await row29.locator('input[type=checkbox]').isChecked() && await page.isChecked('#signup-tentative'));
await row30.locator('input[type=checkbox]').check();
await page.evaluate((id) => window.__app.store.deleteMatch(id), pickIds.open);
await page.waitForFunction(() => !document.querySelector('#signup-list')?.innerText.includes('29/10')
  && document.querySelector('#btn-signup')?.textContent.trim() === 'Anotar en 1 partido');
check('Si un partido desaparece, el resto sigue marcado', await row30.locator('input[type=checkbox]').isChecked() && await page.isChecked('#signup-tentative'));
await page.evaluate(async (id) => {
  await window.__app.store.addPlayer({ id, date: '2026-10-30', time: '19:00', capacity: 1 }, { name: 'Ocupa Cupo', phone: '' }, window.__app.who);
}, pickIds.tight);
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('#signup-list .signup-row')].find((el) => el.innerText.includes('30/10'));
  const input = row?.querySelector('input[type=checkbox]');
  return row && input && input.checked && !input.disabled && row.innerText.includes('espera')
    && document.querySelector('#btn-signup')?.textContent.trim() === 'Anotar en 1 partido';
});
check('Si el partido se llena, la selección sigue', true);
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card');
await page.evaluate(() => { location.hash = '#/jugadores'; });
await page.waitForSelector('#roster-list .name:text-is("Juan Pérez")');
await page.locator('#roster-list .who', { hasText: 'Juan Pérez' }).click();
await page.waitForSelector('#signup-list .signup-row:has-text("30/10") input');
check('Cerrar el perfil suelta la selección', !(await page.locator('#signup-list .signup-row', { hasText: '30/10' }).locator('input').isChecked()) && !(await page.isChecked('#signup-tentative')));
await page.evaluate((id) => window.__app.store.deleteMatch(id), pickIds.tight);
await page.waitForFunction(() => !document.querySelector('#signup-list')?.innerText.includes('30/10'));

// Precios y promo del mismo día. Gustavo sigue logueado. Al final vuelven los precios de siempre.
await page.click('#btn-settings');
await page.waitForSelector('#price-form');
check('Ajustes muestra los tres precios',
  await page.$eval('#price-form [name=matchPrice]', (el) => el.value) === '5000'
  && await page.$eval('#price-form [name=promo2Price]', (el) => el.value) === '9000'
  && await page.$eval('#price-form [name=promo3Price]', (el) => el.value) === '12000');
await page.fill('#price-form [name=matchPrice]', '6000');
await page.click('#price-form button[type=submit]');
await page.waitForFunction(() => JSON.parse(localStorage.getItem('f7c-demo-db'))?.settings?.prices?.matchPrice === 6000);
await page.click('dialog.sheet [data-close]');
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card:has-text("Jueves 22/10")');
await page.click('.match-card:has-text("Jueves 22/10")');
await page.waitForSelector('.slot:has-text("Nico Ruiz") .pay-btn');
await page.click('.slot:has-text("Nico Ruiz") .pay-btn');
await page.click('#pay-form [data-paid="si"]');
check('El pago usa el precio nuevo', await page.$eval('#pay-form [name=cash]', (el) => el.value.replace(/\./g, '') === '6000'));
check('El botón de un partido muestra el precio nuevo', (await page.textContent('#pay-prices')).includes('$6.000'));
await page.click('#pay-form [data-close]');
await page.click('#btn-settings');
await page.fill('#price-form [name=matchPrice]', '5000');
await page.fill('#price-form [name=promo2Price]', '9000');
await page.fill('#price-form [name=promo3Price]', '12000');
await page.click('#price-form button[type=submit]');
await page.waitForFunction(() => JSON.parse(localStorage.getItem('f7c-demo-db'))?.settings?.prices?.matchPrice === 5000);
await page.click('dialog.sheet [data-close]');
const promoIds = await page.evaluate(async () => {
  const store = window.__app.store;
  const a = await store.addMatch({ date: '2026-10-27', time: '19:00', note: '' }, window.__app.who);
  const b = await store.addMatch({ date: '2026-10-27', time: '21:00', note: '' }, window.__app.who);
  const match = { capacity: 14 };
  await store.addPlayer({ ...match, id: a, date: '2026-10-27' }, { name: 'Promo Uno', phone: '5491199990001' }, window.__app.who);
  await store.addPlayer({ ...match, id: b, date: '2026-10-27' }, { name: 'Promo Uno', phone: '5491199990001' }, window.__app.who);
  return { a, b };
});
await page.evaluate((id) => { location.hash = `#/partido/${id}`; }, promoIds.a);
await page.waitForSelector('.promo-badge');
check('Badge de promo 2 en el partido', (await page.textContent('.promo-badge')).includes('Promo 2 partidos por $9.000'));
await page.click('.slot:has-text("Promo Uno") .pay-btn');
await page.click('#pay-form [data-paid="si"]');
check('Sin aplicar, el monto es la parte de un partido', await page.$eval('#pay-form [name=cash]', (el) => el.value.replace(/\./g, '') === '4500'));
check('La hoja también muestra la promo', (await page.textContent('#pay-promo')).includes('Promo 2 partidos por $9.000'));
await page.click('#pay-apply-promo');
check('Aplicar a los dos partidos pone el total de la promo', await page.$eval('#pay-form [name=cash]', (el) => el.value.replace(/\./g, '') === '9000'));
await page.evaluate(() => window.__app.store.addOrganizer('Rita'));
await page.waitForFunction(() => [...document.querySelectorAll('#pay-form [name=cashTo] option')].some((opt) => opt.textContent === 'Rita'));
check('Un organizador nuevo aparece en el desplegable abierto', true);
await page.click('#pay-form button[type=submit]');
await page.waitForFunction(() => {
  const rows = Object.values(JSON.parse(localStorage.getItem('f7c-demo-db')).players).filter((p) => p.name === 'Promo Uno');
  return rows.length === 2 && rows.every((p) => p.paid === true && p.amount === 4500 && p.cashTo === 'Gustavo');
});
check('La promo se reparte en los dos partidos', true);
await page.evaluate((id) => { location.hash = `#/partido/${id}`; }, promoIds.b);
await page.waitForSelector('.promo-badge');
check('El otro partido del día también muestra la promo', (await page.textContent('.promo-badge')).includes('Promo 2 partidos por $9.000'));
await page.evaluate(async (ids) => {
  await window.__app.store.deleteMatch(ids.a);
  await window.__app.store.deleteMatch(ids.b);
}, promoIds);
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('#btn-add-match');

// Permisos: Solo yo no lo ve ni el admin (en demo, Gustavo es el admin).
await page.click('#btn-add-match');
await page.waitForSelector('#match-solo');
check('Crear partido ofrece Solo yo', (await page.textContent('#match-solo').catch?.(() => '') ) || (await page.locator('label:has(#match-solo)').innerText()).includes('tampoco el admin'));
check('Por defecto se puede elegir quién ve y quién anota', await page.isVisible('[data-view="martin"]') && await page.isVisible('[data-add="martin"]'));
await page.fill('#match-form [name=date]', '2026-11-03');
await page.fill('#match-form [name=time]', '21:00');
await page.fill('#match-form [data-limit="gustavo"]', '1');
await page.click('#match-form button[type=submit]');
await page.waitForSelector('.match-card:has-text("3/11")');
await page.click('.match-card:has-text("3/11")');
await page.waitForSelector('#btn-add-player');
await page.click('#btn-add-player');
await page.fill('#player-form [name=name]', 'Limite Uno');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#slots .name:text-is("Limite Uno")');
check('Al llegar al límite el botón lo explica', (await page.textContent('#btn-add-player')).includes('Llegaste a tu límite de 1 jugadores'));
await page.click('#btn-back');
await page.waitForSelector('.match-card');
await page.click('#btn-add-match');
await page.fill('#match-form [name=date]', '2026-11-04');
await page.fill('#match-form [name=time]', '18:00');
await page.fill('#match-form [name=note]', 'Privado');
await page.check('#match-solo');
check('Solo yo apaga los selectores', await page.locator('#match-access-fields').isHidden());
await page.click('#match-form button[type=submit]');
await page.waitForSelector('.match-card:has-text("4/11")');
check('El creador ve su partido Solo yo', (await page.textContent('body')).includes('Privado'));
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'martin@demo.local');
await page.fill('#login-password', 'demo-martin');
await page.click('#login-form button[type=submit]');
await page.waitForSelector('#btn-who');
await page.waitForSelector('.match-card');
check('Martín no ve el Solo yo de Gustavo', !(await page.locator('.match-card:has-text("4/11")').count()) && (await page.locator('.match-card:has-text("3/11")').count()) === 1);
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'gustavo@demo.local');
await page.fill('#login-password', 'demo-gustavo');
await page.click('#login-form button[type=submit]');
await page.waitForSelector('.match-card:has-text("4/11")');
await page.evaluate(async () => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const ids = Object.entries(db.matches).filter(([, m]) => m.date === '2026-11-03' || m.date === '2026-11-04').map(([id]) => id);
  for (const id of ids) await window.__app.store.deleteMatch(id);
});
await page.waitForFunction(() => !document.body.innerText.includes('4/11') && !document.body.innerText.includes('3/11'));

// Historial: hoy se queda en el inicio; lo de ayer no se borra
await page.evaluate(async () => {
  const who = window.__app.who;
  const uid = window.__app.uid;
  await window.__app.store.addMatch({ date: '2026-10-19', time: '10:00', note: 'Hoy temprano', capacity: 14 }, who);
  const pastId = await window.__app.store.addMatch({ date: '2026-10-18', time: '21:00', note: 'Ayer', capacity: 14 }, who);
  const past = window.__app.matches.find((m) => m.id === pastId);
  await window.__app.store.addPlayer(past, { name: 'Histórico Pérez', phone: '5491199990001' }, who);
  await window.__app.store.addPlayer(past, { name: 'Espera Vieja', phone: '' }, who, { waiting: true });
  await window.__app.store.addMatch({
    date: '2026-10-12', time: '19:00', note: 'Solo viejo', capacity: 14,
    access: { solo: true, viewers: [uid], adders: [uid], viewerNames: [], adderNames: [], limits: [], createdByUid: uid },
  }, who);
});
await page.waitForSelector('.match-card:has-text("Hoy temprano")');
check('Hoy temprano sigue en la lista principal', await page.locator('#list-next .match-card:has-text("Hoy temprano")').count() === 1);
check('El de ayer no aparece en el inicio', await page.locator('#list-next .match-card:has-text("Ayer"), #list-later .match-card:has-text("Ayer")').count() === 0);
check('El Solo yo viejo tampoco está en el inicio', await page.locator('.match-card:has-text("Solo viejo")').count() === 0);
const kept = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const match = Object.values(db.matches).find((m) => m.note === 'Ayer');
  const players = Object.values(db.players).filter((p) => p.matchId === Object.entries(db.matches).find(([, m]) => m.note === 'Ayer')?.[0]);
  const tokens = players.map((p) => p.confirmToken).filter(Boolean);
  return {
    match: !!match,
    players: players.length,
    confirmations: tokens.filter((token) => db.confirmations[token]).length,
  };
});
check('El partido de ayer, sus jugadores y las confirmaciones siguen guardados', kept.match && kept.players === 2 && kept.confirmations === 2, JSON.stringify(kept));
await page.click('#btn-historial');
await page.waitForSelector('#list-history .match-card');
const historyOrder = await page.$$eval('#list-history .match-title', (els) => els.map((e) => e.textContent));
const i18 = historyOrder.indexOf('Domingo 18/10');
const i15 = historyOrder.indexOf('Jueves 15/10');
const i12 = historyOrder.indexOf('Lunes 12/10');
check('El historial lista lo pasado, más reciente primero', i18 !== -1 && i15 !== -1 && i12 !== -1 && i18 < i15 && i15 < i12, historyOrder.join(', '));
const ayerCard = (await page.textContent('#list-history .match-card:has-text("Ayer")')).replace(/\s+/g, ' ');
check('La tarjeta trae hora y cantidad de jugadores', /21:00 hs/.test(ayerCard) && /1\/14/.test(ayerCard) && /1 en espera/.test(ayerCard), ayerCard.trim());
check('Hoy no entra al historial', await page.locator('#list-history .match-card:has-text("Hoy temprano")').count() === 0);
await page.click('#list-history .match-card:has-text("Ayer")');
await page.waitForSelector('#slots .name:text-is("Histórico Pérez")');
check('El detalle muestra jugadores y la lista de espera', await page.locator('#wait-list .name:text-is("Espera Vieja")').count() === 1 && await page.isVisible('#btn-add-player'));
await page.click('#slots .pay-btn');
await page.waitForSelector('#pay-form');
await page.click('#pay-form [data-paid="si"]');
await page.fill('#pay-form [name=cash]', '5000');
await page.fill('#pay-form [name=transfer]', '');
await page.click('#pay-form button[type=submit]');
await page.waitForFunction(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  return Object.values(db.players).some((p) => p.name === 'Histórico Pérez' && p.paid === true);
});
check('En el historial se puede registrar un pago tardío', true);
await page.click('#btn-back');
await page.waitForSelector('#list-history');
check('Volver desde un partido pasado vuelve al historial', await page.locator('#list-history').count() === 1);
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'martin@demo.local');
await page.fill('#login-password', 'demo-martin');
await page.click('#login-form button[type=submit]');
await page.waitForSelector('#btn-who');
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('#list-next');
check('Martín ve el de hoy en el inicio', await page.locator('#list-next .match-card:has-text("Hoy temprano")').count() === 1);
await page.click('#btn-historial');
await page.waitForSelector('#list-history');
check('Martín ve el partido de ayer', await page.locator('#list-history .match-card:has-text("Ayer")').count() === 1);
check('Martín no ve el Solo yo viejo', await page.locator('#list-history .match-card:has-text("Solo viejo")').count() === 0 && !(await page.locator('body').innerText()).includes('Solo viejo'));
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'gustavo@demo.local');
await page.fill('#login-password', 'demo-gustavo');
await page.click('#login-form button[type=submit]');
await page.waitForSelector('#btn-who');
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card:has-text("Hoy temprano")');

// Equipos: titulares, toque, azar, baja, WhatsApp, historial y solo lectura
const equipos = await page.evaluate(async () => {
  const who = window.__app.who;
  const uid = window.__app.uid;
  const id = await window.__app.store.addMatch({ date: '2026-10-27', time: '21:00', note: 'Para equipos', capacity: 14 }, who);
  const match = window.__app.matches.find((m) => m.id === id);
  const ana = await window.__app.store.addPlayer(match, { name: 'Equipo Ana', phone: '' }, who);
  const beto = await window.__app.store.addPlayer(match, { name: 'Equipo Beto', phone: '' }, who);
  const ciro = await window.__app.store.addPlayer(match, { name: 'Equipo Ciro', phone: '' }, who);
  await window.__app.store.addPlayer(match, { name: 'Equipo Espera', phone: '' }, who, { waiting: true });
  const roId = await window.__app.store.addMatch({
    date: '2026-10-28', time: '18:00', note: 'Solo anota Gustavo', capacity: 14,
    access: { solo: false, viewers: ['*'], adders: [uid], viewerNames: [], adderNames: [], limits: [], createdByUid: uid },
  }, who);
  const ro = window.__app.matches.find((m) => m.id === roId);
  const lectura = await window.__app.store.addPlayer(ro, { name: 'Lectura Luis', phone: '' }, who);
  await window.__app.store.setTeams(roId, { bib: [lectura], plain: [] }, who);
  const ayer = window.__app.matches.find((m) => m.note === 'Ayer');
  const hist = window.__app.players.find((p) => p.matchId === ayer.id && p.name === 'Histórico Pérez');
  await window.__app.store.setTeams(ayer.id, { bib: [hist.id], plain: [] }, who);
  return { id, ana, beto, ciro };
});
await page.evaluate((id) => { location.hash = `#/partido/${encodeURIComponent(id)}`; }, equipos.id);
await page.waitForSelector('#btn-teams');
await page.click('#btn-teams');
await page.waitForSelector('#team-unassigned');
check('La lista de espera no entra en los equipos', !(await page.locator('#team-board').innerText()).includes('Equipo Espera') && (await page.locator('#team-unassigned').innerText()).includes('Equipo Ana'));
await page.click('#team-unassigned [data-team-player]:has-text("Equipo Ana")');
await page.waitForSelector('#team-bib:has-text("Equipo Ana")');
check('Un toque lo manda a con pechera', (await page.textContent('#team-bib-count')) === '1' && (await page.textContent('#team-plain-count')) === '0');
check('Avisa si está desbalanceado', (await page.textContent('#team-balance')).includes('desbalanceado'));
await page.click('#team-bib [data-team-player]:has-text("Equipo Ana")');
await page.waitForSelector('#team-plain:has-text("Equipo Ana")');
check('Otro toque lo pasa a sin pechera', (await page.textContent('#team-plain-count')) === '1' && (await page.textContent('#team-bib-count')) === '0');
await page.click('#btn-teams-shuffle');
await page.waitForFunction(() => Number(document.querySelector('#team-bib-count')?.textContent) + Number(document.querySelector('#team-plain-count')?.textContent) === 3);
check('Mezclar reparte a los tres anotados', !(await page.locator('#team-board').innerText()).includes('Equipo Espera'));
const pageTeams = await ctx.newPage();
pageTeams.on('dialog', (d) => d.accept());
await pageTeams.goto(`${BASE}#/partido/${encodeURIComponent(equipos.id)}/equipos`);
await pageTeams.waitForSelector('#team-board');
await page.click('#btn-teams-clear');
await page.waitForFunction(() => document.querySelector('#team-bib-count')?.textContent === '0' && document.querySelector('#team-plain-count')?.textContent === '0');
await pageTeams.waitForFunction(() => document.querySelector('#team-bib-count')?.textContent === '0' && document.querySelector('#team-plain-count')?.textContent === '0');
check('La otra pestaña ve los equipos al instante', true);
await pageTeams.close();
await page.click('#team-unassigned [data-team-player]:has-text("Equipo Ana")');
await page.waitForSelector('#team-bib:has-text("Equipo Ana")');
await page.click('#team-unassigned [data-team-player]:has-text("Equipo Beto")');
await page.waitForSelector('#team-bib:has-text("Equipo Beto")');
await page.click('#team-bib [data-team-player]:has-text("Equipo Beto")');
await page.waitForSelector('#team-plain:has-text("Equipo Beto")');
await page.click('#team-unassigned [data-team-player]:has-text("Equipo Ciro")');
await page.waitForSelector('#team-bib:has-text("Equipo Ciro")');
const teamsHref = await page.getAttribute('#btn-teams-wa', 'href');
const teamsText = decodeURIComponent((teamsHref || '').split('text=')[1] || '');
check('Compartir equipos usa el link central de WhatsApp', teamsHref.startsWith('https://wa.me/?text=') && teamsText.includes('Con pechera') && teamsText.includes('Equipo Ana') && teamsText.includes('Sin pechera') && !teamsText.includes('Equipo Espera'), teamsHref.slice(0, 90));
await page.evaluate(async (ids) => {
  await window.__app.store.deletePlayer(ids.ciro);
  await window.__app.store.updatePlayer(ids.beto, { waiting: true, waitOrder: 1, rosterAt: null });
}, equipos);
await page.waitForFunction(() => !document.body.innerText.includes('Equipo Ciro') && !document.body.innerText.includes('Equipo Beto'));
const storedTeams = await page.evaluate((id) => JSON.parse(localStorage.getItem('f7c-demo-db')).matches[id].teams, equipos.id);
check('Al bajarse sale del equipo guardado', storedTeams.bib.includes(equipos.ana) && !storedTeams.bib.concat(storedTeams.plain).includes(equipos.ciro) && !storedTeams.bib.concat(storedTeams.plain).includes(equipos.beto), JSON.stringify(storedTeams));
await page.evaluate(() => { location.hash = '#/historial'; });
await page.waitForSelector('#list-history .match-card:has-text("Ayer")');
await page.click('#list-history .match-card:has-text("Ayer")');
await page.waitForSelector('#btn-teams');
await page.click('#btn-teams');
await page.waitForSelector('#team-bib:has-text("Histórico Pérez")');
check('Desde el historial se consultan los equipos', (await page.textContent('#team-bib-count')) === '1');
await page.click('#btn-back');
await page.waitForSelector('#slots');
check('Volver desde equipos vuelve al partido', await page.locator('#btn-teams').count() === 1);
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'martin@demo.local');
await page.fill('#login-password', 'demo-martin');
await page.click('#login-form button[type=submit]');
await page.waitForSelector('#btn-who');
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card:has-text("Solo anota Gustavo")');
await page.click('.match-card:has-text("Solo anota Gustavo")');
await page.waitForSelector('#btn-teams');
await page.click('#btn-teams');
await page.waitForSelector('#teams-readonly');
check('Quien no puede anotar ve los equipos y no los cambia', (await page.locator('#btn-teams-shuffle').count()) === 0 && (await page.locator('[data-team-player]').count()) === 0 && (await page.locator('#team-bib').innerText()).includes('Lectura Luis'));
check('Quien solo mira igual puede compartir por WhatsApp', (await page.getAttribute('#btn-teams-wa', 'href') || '').includes('wa.me/'));
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'gustavo@demo.local');
await page.fill('#login-password', 'demo-gustavo');
await page.click('#login-form button[type=submit]');
await page.waitForSelector('#btn-who');
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card:has-text("Hoy temprano")');

// PWA
const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
check('Manifest válido con íconos 192/512 + maskable', manifest.icons.length === 3 && manifest.display === 'standalone');
const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
check('Service worker activo', sw);
for (const ic of manifest.icons) {
  const st = await page.evaluate(async (u) => (await fetch(u)).status, ic.src);
  check(`Ícono ${ic.src} accesible`, st === 200);
}

check('A− y A+ están en el encabezado', await page.isVisible('#btn-text-smaller') && await page.isVisible('#btn-text-bigger'));
await page.click('#btn-text-bigger');
check('A+ pasa a Grande y se guarda en el teléfono', await page.evaluate(() => getComputedStyle(document.documentElement).fontSize === '20px' && localStorage.getItem('f7c-text-size') === '2'));
await page.click('#btn-settings');
await page.click('[data-text-size="4"]');
check('En Ajustes, Enorme agranda al instante', await page.evaluate(() => getComputedStyle(document.documentElement).fontSize === '24px' && localStorage.getItem('f7c-text-size') === '4'));
check('A+ queda deshabilitado en Enorme', await page.locator('#btn-text-bigger').isDisabled());
await page.click('dialog.sheet [data-close]');
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card');
await page.setViewportSize({ width: 360, height: 740 });
const overflowHome = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('Enorme en un teléfono de 360px no desborda el inicio', overflowHome <= 1, String(overflowHome));
await page.evaluate(() => { location.hash = '#/historial'; });
await page.waitForSelector('#list-history');
const overflowHistory = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('Enorme en 360px no desborda el historial', overflowHistory <= 1, String(overflowHistory));
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('#list-next .match-card');
await page.click('#list-next .match-card:has-text("22/10")');
await page.waitForSelector('#btn-add-player');
const overflowMatch = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('Enorme en 360px no desborda el partido', overflowMatch <= 1, String(overflowMatch));
await page.click('#btn-teams');
await page.waitForSelector('#team-board');
const overflowTeams = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('Enorme en 360px no desborda los equipos', overflowTeams <= 1, String(overflowTeams));
await page.click('#btn-back');
await page.waitForSelector('.pay-btn');
await page.click('.pay-btn');
await page.waitForSelector('#pay-form');
await page.click('#pay-form [data-paid="si"]');
const moneyRow = await page.evaluate(() => {
  const row = document.querySelector('#pay-form .pay-money');
  const input = row.querySelector('input');
  const select = row.querySelector('select');
  const ir = input.getBoundingClientRect();
  const sr = select.getBoundingClientRect();
  const rr = row.getBoundingClientRect();
  return {
    sameTop: Math.abs(ir.top - sr.top) < 2,
    inside: rr.right <= document.documentElement.clientWidth + 1,
    wide: ir.width > 20 && sr.width > 20,
  };
});
check('En 360px el monto y el desplegable van en una fila', moneyRow.sameTop && moneyRow.inside && moneyRow.wide, JSON.stringify(moneyRow));
await page.click('#pay-form [data-close]');
const confirmSize = await ctx.newPage();
await confirmSize.setViewportSize({ width: 360, height: 740 });
await confirmSize.goto(`${BASE}confirmar.html?m=x&p=y&t=token-corto`);
await confirmSize.waitForSelector('#btn-text-smaller');
check('confirmar.html usa el tamaño guardado', await confirmSize.evaluate(() => getComputedStyle(document.documentElement).fontSize) === '24px');
const overflowConfirm = await confirmSize.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('confirmar.html en 360px no desborda', overflowConfirm <= 1, String(overflowConfirm));
await confirmSize.close();

check('Sin errores de JS', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} OK`);
process.exit(failed.length ? 1 : 0);
