// Prueba end-to-end en modo demo con Playwright (Chromium headless, 390x844).
// Uso: node tests/e2e.mjs [baseUrl]   (requiere `npm i playwright` en algún lado accesible)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');

const BASE = process.argv[2] || 'http://127.0.0.1:18431/';
const NOW = new Date('2026-10-19T13:00:00-03:00'); // lunes 19/10/2026 13:00 (BA)
const results = [];
const check = (name, cond, extra = '') => { results.push({ name, ok: !!cond, extra }); console.log(`${cond ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`); };

async function viewState() {
  return page.evaluate(() => ({
    y: document.scrollingElement?.scrollTop || 0,
    hash: location.hash,
    search: document.querySelector('#roster-q')?.value ?? null,
    filter: document.querySelector('#pay-filter .chip.on')?.getAttribute('data-pay-filter') ?? null,
    signups: [...document.querySelectorAll('input[data-signup]')].map((el) => `${el.dataset.signup}:${el.checked ? 1 : 0}`).join(','),
    tentative: document.querySelector('#signup-tentative')?.checked ?? null,
    profile: document.querySelector('#profile h2.section')?.textContent || '',
    section: document.querySelector('#roster-section .chip.on')?.id || '',
  }));
}
function sameView(a, b) {
  return a.y === b.y && a.hash === b.hash && a.search === b.search && a.filter === b.filter
    && a.signups === b.signups && a.tentative === b.tentative && a.profile === b.profile && a.section === b.section;
}
async function assertStill(label) {
  const before = await viewState();
  await page.evaluate(() => {
    window.__viewMutations = 0;
    const view = document.getElementById('view');
    window.__viewObs?.disconnect();
    window.__viewObs = new MutationObserver(() => { window.__viewMutations += 1; });
    window.__viewObs.observe(view, { childList: true, subtree: true, characterData: true });
    const app = window.__app;
    app.store.syncDay(Date.now());
    app.store.setActor({ uid: app.uid, name: app.who });
    app.store._emit();
  });
  await page.waitForTimeout(500);
  const after = await viewState();
  const n = await page.evaluate(() => { window.__viewObs?.disconnect(); return window.__viewMutations; });
  check(label, n === 0 && sameView(before, after), `mut=${n} y=${before.y}->${after.y} hash=${after.hash} filtro=${after.filter} busca=${after.search} seccion=${after.section}`);
}
async function assertRepaintKeeps(label) {
  const before = await viewState();
  await page.evaluate(() => {
    window.__app.viewStamp = '';
    window.__app.store._emit();
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  const after = await viewState();
  check(label, sameView(before, after), `y=${before.y}->${after.y} filtro=${before.filter}->${after.filter} busca=${after.search} signups=${after.signups} perfil=${after.profile}`);
}

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
await ctx.route(/https:\/\/spoo\.me\//, (route) => route.abort());
await ctx.route(/https:\/\/da\.gd\//, (route) => route.abort());
const page = await ctx.newPage();
await page.clock.install({ time: NOW });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const text = m.text();
  // Los mocks de spoo.me y da.gd abortan o contestan 503. Chrome lo anota en la consola.
  if (/^Failed to load resource: (net::ERR_(FAILED|ABORTED)|the server responded with a status of 503 )/.test(text)) return;
  errors.push('console: ' + text);
});
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
await page.waitForFunction(() => window.__app?.who);
await page.evaluate(() => localStorage.setItem('f7c-wa-from', 'business'));
await page.reload();
await page.waitForFunction(() => window.__app?.who);
check('Ajustes no pregunta desde qué WhatsApp', (await page.locator('#wa-choice, #wa-choice-ask, #wa-choice-business').count()) === 0);
await page.click('#btn-settings');
const settingsText = await page.locator('#sheet').innerText();
check('Ajustes no ofrece Business ni Dual Messenger', !/Desde qué WhatsApp|Dual Messenger|WhatsApp Business|Que el celular pregunte/.test(settingsText), settingsText.replace(/\s+/g, ' ').slice(0, 180));
check('El admin ve hacer backup', await page.isVisible('#set-backup') && await page.isVisible('#set-restore') && await page.isVisible('#set-reset-db'));
check('Ajustes muestra la versión que corre', (await page.locator('#app-version').innerText()) === 'Versión f7c-v58');
check('Borra la elección vieja de WhatsApp', await page.evaluate(() => localStorage.getItem('f7c-wa-from') == null));
const plainLink = await page.evaluate(async () => {
  const { waSendUrl } = await import('./js/phone.js');
  return waSendUrl({ phone: '5491112345678', text: 'Hola Juan', choice: 'business', android: true });
});
check('Todos los envíos son wa.me, sin package', plainLink === 'https://wa.me/5491112345678?text=Hola%20Juan', plainLink);
await page.click('dialog.sheet [data-close]');
await page.waitForSelector('text=No hay partidos en los próximos 7 días');
check('Banner de modo demo visible', await page.isVisible('#demo-banner'));
const demoMode = await page.evaluate(() => window.__app?.store?.mode);
check('Modo demo (no escribe en Firestore)', demoMode === 'demo', String(demoMode));
if (demoMode !== 'demo') { await browser.close(); process.exit(1); }
check('Arranca sin partidos', await page.isVisible('text=No hay partidos en los próximos 7 días'));
check('La app se llama Mis Partidos', (await page.title()) === 'Mis Partidos' && (await page.textContent('.brand-title')) === 'Mis Partidos');
check('Bajo el título dice Agenda de partidos', (await page.textContent('#venue-name')) === 'Agenda de partidos');
await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/header-agenda.png' });
check('La lista no muestra sede y formato al pie', await page.locator('#view .footer-note').count() === 0 && !(await page.locator('#view').innerText()).includes('Fútbol 7 contra 7'));
check('El header no muestra Mis ni el nombre', (await page.locator('#btn-mine, #btn-who').count()) === 0 && await page.isVisible('#btn-text-smaller') && await page.isVisible('#btn-text-bigger'));
const tabLabels = await page.$$eval('#tabbar a', (els) => els.map((el) => el.textContent.trim()));
check('Tres pestañas fijas', JSON.stringify(tabLabels) === JSON.stringify(['Próximos partidos', 'Jugadores', 'Historial']), tabLabels.join(' | '));
check('Próximos partidos queda activo', await page.getAttribute('#tab-proximos', 'aria-current') === 'page');
await page.click('#btn-settings');
check('Ajustes dice quién entró', (await page.textContent('#set-who')).includes('Entraste como Gustavo'));
check('El filtro de lo propio arranca apagado', !(await page.isChecked('#set-mine')));
const settingsBars = await page.evaluate(() => {
  const tabs = document.querySelector('#tabbar').getBoundingClientRect();
  const body = document.querySelector('.sheet-body').getBoundingClientRect();
  const labels = [...document.querySelectorAll('#tabbar a')].map((el) => el.textContent.trim());
  return {
    labels,
    tabsInView: tabs.top >= 0 && tabs.bottom <= window.innerHeight && tabs.height >= 44,
    sheetBelow: body.top >= tabs.bottom - 1,
    inDialog: document.querySelector('#tabbar').parentElement?.id === 'sheet',
  };
});
check('En Ajustes las tres pestañas siguen visibles', settingsBars.tabsInView && settingsBars.inDialog && JSON.stringify(settingsBars.labels) === JSON.stringify(['Próximos partidos', 'Jugadores', 'Historial']), JSON.stringify(settingsBars));
check('La hoja de Ajustes no queda debajo de las pestañas', settingsBars.sheetBelow, JSON.stringify(settingsBars));
await page.click('#btn-historial');
await page.waitForSelector('#history-filter');
check('Desde Ajustes, Historial abre esa sección', (await page.evaluate(() => location.hash)) === '#/historial' && await page.locator('dialog.sheet[open]').count() === 0 && await page.getAttribute('#btn-historial', 'aria-current') === 'page');
await page.click('#tab-proximos');
await page.waitForSelector('text=No hay partidos en los próximos 7 días');

// Agregar partido
await page.click('#btn-add-match');
await page.waitForSelector('#match-venue');
check('Alta: Sede arranca en Polideportivo Colegiales', (await page.locator('#match-venue option:checked').innerText()).trim() === 'Polideportivo Colegiales');
check('Alta: Jugadores por equipo arranca en 7', await page.inputValue('#match-per-team') === '7');
check('Jugadores por equipo va de 5 a 11', JSON.stringify(await page.$$eval('#match-per-team option', (els) => els.map((el) => el.value))) === JSON.stringify(['5', '6', '7', '8', '9', '10', '11']));
await page.fill('#match-form [name=date]', '2026-10-22');
await page.fill('#match-form [name=time]', '21:00');
await page.fill('#match-form [name=note]', 'Cancha 2');
await page.click('#match-form button[type=submit]');
await page.waitForSelector('.match-card');
let cardText = (await page.textContent('.match-card')).replace(/\s+/g, ' ');
check('Partido agregado aparece en la lista', /JUE/.test(cardText) && /22/.test(cardText) && /OCT/.test(cardText) && !/Jueves/.test(cardText) && /21hs \(\$5\.000\)/.test(cardText) && !/Con pechera/.test(cardText) && /0\/14/.test(cardText) && !cardText.includes('Fútbol 7 contra 7'), cardText.trim());
check('La lista con partidos tampoco muestra el pie de sede y formato', await page.locator('#view .footer-note').count() === 0);
await page.click('.match-card');
await page.waitForSelector('#btn-add-player');
check('El detalle sigue mostrando la sede y el formato', (await page.textContent('#match-place'))?.replace(/\s+/g, ' ').trim() === 'Polideportivo Colegiales (F7)');
await page.evaluate(() => window.scrollTo(0, 600));
const matchBars = await page.evaluate(() => {
  const tabs = document.querySelector('#tabbar').getBoundingClientRect();
  const bar = document.querySelector('.actionbar').getBoundingClientRect();
  const share = document.querySelector('#btn-share').getBoundingClientRect();
  const add = document.querySelector('#btn-add-player').getBoundingClientRect();
  const inside = (el, box) => el.top >= box.top - 1 && el.bottom <= box.bottom + 1 && el.left >= box.left - 1 && el.right <= box.right + 1;
  return {
    tabsStuck: tabs.top >= 0 && tabs.bottom < window.innerHeight / 2 && tabs.bottom <= window.innerHeight,
    apart: bar.top >= tabs.bottom + 8,
    barInView: bar.top >= 0 && bar.bottom <= window.innerHeight + 1,
    share: inside(share, bar) && share.width > 20,
    add: inside(add, bar) && add.bottom <= window.innerHeight + 1,
  };
});
check('Al bajar el partido las pestañas siguen arriba', matchBars.tabsStuck, JSON.stringify(matchBars));
check('La barra de compartir y agregar no queda tapada', matchBars.apart && matchBars.barInView && matchBars.share && matchBars.add, JSON.stringify(matchBars));
await page.click('#btn-roster');
await page.waitForSelector('#roster-list');
check('Desde el partido, Jugadores abre el listado', (await page.evaluate(() => location.hash)) === '#/jugadores' && await page.getAttribute('#btn-roster', 'aria-current') === 'page');
await page.click('#tab-proximos');
await page.waitForSelector('.match-card');

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
const order = await page.$$eval('.match-card', (els) => els.map((e) => e.dataset.date));
check('Lista ordenada cronológicamente', JSON.stringify(order) === JSON.stringify(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-24', '2026-10-26']), order.join(', '));
check('El lunes 26/10 entra en los próximos 7 días', await page.locator('#list-next .match-card[data-date="2026-10-26"]').count() === 1 && await page.locator('#btn-later').count() === 0);
await page.evaluate(async () => {
  await window.__app.store.addMatch({ date: '2026-10-28', time: '21:00', note: 'Lejos', capacity: 14 }, window.__app.who);
});
await page.waitForSelector('#btn-later');
check('Ver más adelante muestra la cantidad', (await page.textContent('#btn-later')).replace(/\s+/g, ' ').trim() === 'Ver más adelante (1)');
check('Más adelante arranca cerrado', await page.locator('#list-later').count() === 0 && await page.locator('#list-next .match-card[data-date="2026-10-28"]').count() === 0);
await page.click('#btn-later');
await page.waitForSelector('#list-later .match-card[data-date="2026-10-28"]');
check('Ver más adelante despliega los que siguen', await page.locator('#list-next .match-card').count() === 5 && await page.locator('#list-later .match-card').count() === 1);
await page.click('#btn-later');
await page.waitForFunction(() => !document.querySelector('#list-later') && document.querySelector('#btn-later')?.textContent.includes('Ver más adelante'));
check('Badge "Mañana" en el partido del martes', (await page.textContent('#list-next .match-card >> nth=0')).includes('Mañana'));

// Detalle y jugadores
await page.click('.match-card[data-date="2026-10-22"]');
await page.waitForSelector('#slots');
check('Detalle muestra 14 lugares', (await page.$$('#slots > li')).length === 14);
await page.setViewportSize({ width: 390, height: 480 });
await page.evaluate(() => window.scrollTo(0, 220));
await page.waitForFunction(() => (document.scrollingElement?.scrollTop || 0) > 100);
await assertStill('El detalle de Próximos no se redibuja solo');
await assertRepaintKeeps('El detalle de Próximos conserva el scroll si los datos no cambian');
await page.evaluate(() => window.scrollTo(0, 0));
await page.setViewportSize({ width: 390, height: 844 });
const players = [
  ['Juan Pérez', '11 1234-5678', '5491112345678'],
  ['Pedro Gómez', '011 15 4444-3333', '5491144443333'],
  ['Lucas Díaz', '+54 9 351 555-1234', '5493515551234'],
];
await page.click('#btn-add-player');
await page.waitForSelector('#wa-share');
check('Alta del partido: Mostrar el WhatsApp para todos, destildado', (await page.locator('#wa-share-line').innerText()).replace(/\s+/g, ' ').trim() === 'Mostrar el WhatsApp para todos' && !(await page.isChecked('#wa-share')));
check('Se anotó con arranca en Gustavo', (await page.locator('#signed-up-with option:checked').innerText()).trim() === 'Gustavo');
await page.click('#player-form [data-close]');
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
const juanHrefText = decodeURIComponent(new URL(hrefs[0]).searchParams.get('text') || '');
const juanShort = juanHrefText.match(/\/c\/\?k=([0-9A-Za-z]{8})/)?.[1] || '';
const juanLink = await page.evaluate((code) => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const found = Object.entries(db.players).find(([, p]) => p.name === 'Juan Pérez');
  return { id: found[0], player: found[1], link: db.links?.[code] || null };
}, juanShort);
check('Link wa.me Juan correcto',
  hrefs[0].startsWith('https://wa.me/5491112345678?text=')
  && juanHrefText.includes('¡Hola Juan!')
  && juanHrefText.includes('¿Confirmás?')
  && juanShort.length === 8
  && juanLink.player.shortCode === juanShort
  && juanLink.link?.m === juanLink.player.matchId
  && juanLink.link?.p === juanLink.id
  && juanLink.link?.t === juanLink.player.confirmToken
  && juanHrefText.includes(juanLink.player.confirmToken) === false,
  juanHrefText.slice(0, 180));
players.forEach(([n, , wa], i) => check(`Número normalizado ${n} → ${wa}`, hrefs[i]?.startsWith(`https://wa.me/${wa}?text=`)));
check('Cada jugador muestra "Agregó: Gustavo"', (await page.$$('.tag.g')).length === 3);
check('Juan se anotó con Gustavo', juanLink.player.signedUpWith === 'gustavo' && juanLink.player.signedUpWithName === 'Gustavo' && (await page.textContent('.slot:has-text("Juan Pérez")')).includes('Se anotó con: Gustavo'));
check('Todos figuran sin respuesta', (await page.textContent('#confirm-sum')).includes('Sin respuesta: 3'));
const juanAtAdd = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  return Object.values(db.players).find((p) => p.name === 'Juan Pérez');
});
const juanContact = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const found = Object.entries(db.players).find(([, p]) => p.name === 'Juan Pérez');
  return { player: found[1], contact: db.contacts.players[found[0]] };
});
check('El token se crea al anotar, sin abrir el recordatorio', juanAtAdd?.confirmToken?.length >= 16 && !juanAtAdd.reminderSentAt);
check('El teléfono de Juan no queda en el jugador', (juanContact.player.phone == null || juanContact.player.phone === '') && juanContact.player.hasPhone === true);
check('El teléfono de Juan está en playerContacts, privado y de Gustavo', juanContact.contact.phone === '5491112345678' && juanContact.contact.ownerUid === 'gustavo' && juanContact.contact.visibleToAll === false);

// Recordatorio y página de confirmación (mismo origen, modo demo)
await page.click('#btn-remind');
await page.waitForSelector('#remind-list a[data-send]');
const remindLink = page.locator('#remind-list .remind-row', { hasText: 'Juan Pérez' }).locator('a');
const remindHref = await remindLink.getAttribute('href');
const remindText = decodeURIComponent(remindHref.split('text=')[1]);
check('Recordatorio abre wa.me de Juan', remindHref.startsWith('https://wa.me/5491112345678?text='), remindHref.slice(0, 80));
check('El mensaje saluda, da día, hora, lugar, nota y link corto',
  remindText.includes('¡Hola Juan!') && remindText.includes('jueves 22/10 a las 21:00 hs')
  && remindText.includes('Polideportivo Colegiales') && remindText.includes('(Cancha 2)')
  && remindText.includes('/c/?k='));
const [popup] = await Promise.all([page.waitForEvent('popup'), remindLink.click()]);
await popup.close();
await page.waitForFunction(() => [...document.querySelectorAll('#remind-list .remind-row')].some((r) => r.textContent.includes('Juan') && r.textContent.includes('Enviado')));
check('Marca recordatorio enviado', true);
const juan = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const found = Object.entries(db.players).find(([, p]) => p.name === 'Juan Pérez');
  return { id: found[0], ...found[1] };
});
check('Token del link guardado en el jugador', juan.confirmToken && juan.confirmToken.length >= 16 && juan.reminderSentAt > 0 && remindText.includes(`/c/?k=${juan.shortCode}`) && remindText.includes(juan.confirmToken) === false);
const publicCard = await page.evaluate((token) => JSON.parse(localStorage.getItem('f7c-demo-db')).confirmations[token], juan.confirmToken);
check('La ficha pública no tiene teléfono', publicCard && publicCard.name === 'Juan Pérez' && publicCard.phone == null && !JSON.stringify(publicCard).includes('549'));
await page.click('dialog.sheet [data-close]');

const bad = await ctx.newPage();
await bad.goto(`${BASE}confirmar.html?m=${encodeURIComponent(juan.matchId)}&p=${encodeURIComponent(juan.id)}&t=token-falso-que-no-coincide`);
await bad.waitForSelector('text=Este link no es válido');
check('Token incorrecto no confirma', (await page.evaluate((id) => JSON.parse(localStorage.getItem('f7c-demo-db')).players[id].confirmed, juan.id)) == null);
await bad.close();

const shortPage = await ctx.newPage();
await shortPage.goto(`${BASE}c/?k=${encodeURIComponent(juan.shortCode)}`);
await shortPage.waitForSelector('#btn-si');
check('El link corto abre la misma confirmación', (await shortPage.locator('body').innerText()).includes('Juan Pérez') && shortPage.url().includes('confirmar.html') && shortPage.url().includes(`t=${encodeURIComponent(juan.confirmToken)}`));
const badShort = await ctx.newPage();
await badShort.goto(`${BASE}c/?k=zzzzzzzz`);
await badShort.waitForSelector('text=Este link no es válido');
check('Un código corto inexistente no confirma', true);
await badShort.close();
await shortPage.close();

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
await page.waitForFunction(() => window.__app?.who);
await page.waitForSelector('#btn-add-player');
check('Sesión de Martín', (await page.evaluate(() => window.__app.who)) === 'Martín');
check('La sesión queda en el navegador', (await page.evaluate(() => JSON.parse(localStorage.getItem('f7c-demo-auth')).session.name)) === 'Martín');
await page.click('#btn-add-player');
await page.fill('#player-form [name=name]', 'Nico Ruiz');
await page.fill('#player-form [name=phone]', '1234-5678');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('.slot .name:text-is("Nico Ruiz")');
check('Jugador agregado por Martín muestra "Agregó: Martín"', (await page.textContent('.slot:has-text("Nico Ruiz") .tag')).includes('Martín'));
const juanHidden = (await page.locator('#slots .slot', { hasText: 'Juan Pérez' }).innerText()).replace(/\s+/g, ' ');
check('Martín no ve el WhatsApp de Juan', !juanHidden.includes('1234') && !juanHidden.includes('549') && juanHidden.includes('El WhatsApp de este jugador es privado'), juanHidden);
await page.locator('#slots .slot', { hasText: 'Juan Pérez' }).locator('[data-menu]').click();
await page.waitForSelector('#signed-up-with');
await page.selectOption('#signed-up-with', { label: 'Martín' });
await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('f7c-demo-db')).players).some((p) => p.name === 'Juan Pérez' && p.signedUpWith === 'martin'));
await page.locator('dialog.sheet[open] [data-close]').click();
await page.waitForFunction(() => (document.querySelector('#slots .slot')?.innerText || '').includes('Se anotó con: Martín'));
check('Martín cambia con quién se anotó Juan', (await page.textContent('#slots .slot:has-text("Juan Pérez")')).includes('Se anotó con: Martín'));
check('El botón de WhatsApp de Juan está deshabilitado', await page.locator('#slots .slot', { hasText: 'Juan Pérez' }).locator('.wa-btn').isDisabled());
await page.click('#btn-remind');
await page.waitForSelector('#remind-list .name');
let remindNames = await page.$$eval('#remind-list .name', (els) => els.map((e) => e.textContent));
check('Enviar recordatorios arranca en mis jugadores',
  remindNames.includes('Nico Ruiz') && !remindNames.includes('Juan Pérez') && (await page.locator('[data-remind-scope="mine"].on').count()) === 1,
  remindNames.join(', '));
await page.click('[data-remind-scope="all"]');
await page.waitForFunction(() => [...document.querySelectorAll('#remind-list .name')].some((e) => e.textContent === 'Juan Pérez'));
const allReminders = await page.textContent('#remind-list');
const juanRemind = (await page.locator('#remind-list .remind-row', { hasText: 'Juan Pérez' }).innerText()).replace(/\s+/g, ' ');
check('Todos no abre el WhatsApp privado de Juan', juanRemind.includes('El WhatsApp de este jugador es privado') && (await page.locator('#remind-list .remind-row', { hasText: 'Juan Pérez' }).locator('a').count()) === 0 && allReminders.includes('Nico Ruiz'), juanRemind);
await page.click('dialog.sheet [data-close]');

// Editar y quitar. Pedro lo agregó Gustavo: Martín no cambia el nombre.
await page.click('.slot:has-text("Pedro Gómez") .more-btn');
check('Martín no edita al jugador de Gustavo', await page.isDisabled('#pm-edit') && (await page.locator('#edit-lock').innerText()).replace(/\s+/g, ' ').trim() === 'Solo lo puede editar el organizador que lo agregó');
check('Quitar del partido no es editar al jugador', !(await page.isDisabled('#pm-del')));
check('Ver perfil sigue habilitado', !(await page.isDisabled('#pm-profile')));
await page.click('dialog.sheet [data-close]');
const pedroMatch = await page.evaluate(() => location.hash);
await page.locator('#slots .who', { hasText: 'Juan Pérez' }).click();
await page.waitForSelector('#profile #edit-lock');
check('El perfil ajeno explica quién lo edita', (await page.locator('#profile #edit-lock').innerText()).replace(/\s+/g, ' ').trim() === 'Solo lo puede editar el organizador que lo agregó');
check('Nivel, posiciones y notas quedan deshabilitados', await page.isDisabled('#level-up') && await page.isDisabled('#level-down') && await page.locator('#positions button:disabled').count() === 4 && await page.isDisabled('#btn-add-note'));
check('Anotarlo en otro partido sigue habilitado', await page.locator('#signup-list input:not([disabled])').count() > 0);
await page.evaluate((hash) => { location.hash = hash; }, pedroMatch);
await page.waitForSelector('#slots .name:text-is("Pedro Gómez")');
await page.click('.slot:has-text("Nico Ruiz") .more-btn');
check('El que lo agregó puede editar', !(await page.isDisabled('#pm-edit')) && await page.locator('#edit-lock').count() === 0);
await page.click('#pm-edit');
await page.fill('#player-form [name=name]', 'Nico R.');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('.slot .name:text-is("Nico R.")');
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
check('El pago abre directo en los montos', (await page.locator('#pay-form [data-paid]').count()) === 0 && await page.isVisible('#pay-details') && await page.isVisible('#pay-free') && await page.isVisible('#pay-form [name=pending]'));
check('El efectivo arranca vacío', await page.$eval('#pay-form [name=cash]', (el) => el.value === ''));
await page.locator('#pay-form [name=cash]').focus();
check('Al tocar el efectivo se completa con el precio de Ajustes', await page.$eval('#pay-form [name=cash]', (el) => el.value.replace(/\./g, '') === '5000'));
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

check('Pedro sigue sin estado de pago', (await page.$$('.slot:has-text("Pedro Gómez") .pay-line')).length === 0);
check('Nico sigue sin estado de pago', (await page.$$('.slot:has-text("Nico R.") .pay-line')).length === 0);
const rec = (await page.textContent('#collected')).replace(/\s+/g, ' ');
check('Total recaudado 1/3', rec.includes('Recaudado: $5.000') && rec.includes('1/3 pagaron'), rec);

await page.click('#btn-copy');
const clipPay = await page.evaluate(() => navigator.clipboard.readText());
check('La lista copiada incluye los pagos',
  clipPay.includes('1. Juan Pérez — Pagó $5.000 · Transferencia')
  && clipPay.includes('Pedro Gómez') && !/Pedro Gómez —/.test(clipPay)
  && clipPay.includes('3. Nico R.\n')
  && clipPay.includes('Recaudado: $5.000 · 1/3 pagaron'),
  clipPay.split('\n').filter((l) => l.includes('Juan') || l.includes('Pedro') || l.includes('Nico') || l.includes('Recaudado')).join(' | '));

const stored = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  return Object.values(db.players).find((p) => p.name === 'Juan Pérez');
});
check('El pago queda en el jugador (localStorage)', stored?.paid === true && stored.amount === 5000 && stored.method === 'transferencia' && stored.paidUpdatedBy === 'Martín' && stored.receivedBy === 'Martín');
await page.click('.slot:has-text("Juan Pérez") .pay-btn');
check('Cobró arranca en quien está usando la app', await page.$eval('#pay-form [name=transferTo]', (el) => el.value === 'Martín'));
check('El pago guardado vuelve a cargar la transferencia', await page.$eval('#pay-form [name=transfer]', (el) => el.value.replace(/\./g, '') === '5000') && await page.isVisible('#pay-details'));
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

await page.click('#btn-settings');
await page.check('#set-mine');
await page.waitForFunction(() => document.querySelector('#mine-filter') && ![...document.querySelectorAll('#slots .name')].some((el) => el.textContent === 'Pedro Gómez'));
check('Mis oculta a quien no anoté ni cobré', (await page.locator('#slots .name', { hasText: 'Pedro Gómez' }).count()) === 0);
check('Mis muestra a quien anoté y a quien le cobré',
  (await page.locator('#slots .name', { hasText: 'Nico R.' }).count()) === 1
  && (await page.locator('#slots .name', { hasText: 'Juan Pérez' }).count()) === 1);
check('El cupo sigue siendo el del partido', (await page.textContent('#slot-count')) === '3/14');
const mineText = (await page.textContent('#mine-stats')).replace(/\s+/g, ' ');
check('Estadística propia del partido', mineText.includes('Anotaste 1') && mineText.includes('Cobraste $4.500'), mineText);
await page.uncheck('#set-mine');
await page.waitForSelector('#slots .name:text-is("Pedro Gómez")');
await page.click('dialog.sheet [data-close]');

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
check('Inicio muestra 14/14 en la tarjeta', (await page.textContent('.match-card[data-date="2026-10-22"] .count')).replace(/\s/g, '') === '14/14');

// Persistencia tras recargar
await page.reload();
await page.waitForSelector('.match-card');
check('Datos persisten tras recargar (sin volver a pedir la contraseña)', (await page.$$('.match-card')).length === 5 && (await page.locator('#login-form').count()) === 0);
check('Sigue en modo demo tras recargar', (await page.evaluate(() => window.__app?.store?.mode)) === 'demo');
await page.click('.match-card[data-date="2026-10-22"]');
await page.waitForSelector('.slot:has-text("Juan Pérez") .pay-line.ok');
check('El pago persiste tras recargar', (await page.textContent('.slot:has-text("Juan Pérez") .pay-line')).includes('Efectivo') && (await page.textContent('#collected')).includes('$4.500'));
await page.click('#btn-back');
await page.waitForSelector('.match-card');

// Lugar reservado y aviso de WhatsApp al subir. El lunes está vacío.
await page.click('.match-card[data-date="2026-10-26"]');
await page.waitForSelector('#btn-add-player');
await page.click('#btn-add-wait');
check('Anotar en espera no ofrece lugar reservado', (await page.locator('#player-tentative').count()) === 0);
await page.click('#player-form [data-close]');
await page.click('#btn-add-player');
check('El alta al partido ofrece anotar como pendiente', await page.isVisible('#player-tentative') && (await page.locator('#player-form').innerText()).includes('Anotar como pendiente de confirmación') && !(await page.locator('#player-form').innerText()).includes('Lugar reservado'));
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
const fontBefore = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize);
async function tentativeLayout(width, px) {
  await page.setViewportSize({ width, height: 844 });
  await page.evaluate((size) => { document.documentElement.style.fontSize = size + 'px'; }, px);
  return page.evaluate(() => {
    const row = [...document.querySelectorAll('#slots .slot')].find((el) => el.querySelector('.name')?.textContent === 'Reserva Luis');
    const name = row.querySelector('.name').getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const badge = row.querySelector('.reserved-badge').getBoundingClientRect();
    const skinny = [...row.querySelectorAll('*')].some((el) => {
      const r = el.getBoundingClientRect();
      const text = (el.textContent || '').trim();
      return text.length > 8 && r.width > 0 && r.width < 16 && r.height > r.width * 3;
    });
    return {
      nameW: Math.round(name.width),
      rowH: Math.round(box.height),
      badgeW: Math.round(badge.width),
      badgeH: Math.round(badge.height),
      skinny,
    };
  });
}
const layout18 = await tentativeLayout(390, 18);
check('La fila pendiente no se aplasta a 390px',
  layout18.nameW >= 90 && layout18.rowH <= 320 && layout18.badgeW >= 80 && layout18.badgeH <= 32 && !layout18.skinny,
  JSON.stringify(layout18));
const layout24 = await tentativeLayout(360, 24);
check('La fila pendiente no se aplasta con letra de 24px',
  layout24.nameW >= 90 && layout24.rowH <= 420 && layout24.badgeW >= 80 && layout24.badgeH <= 40 && !layout24.skinny,
  JSON.stringify(layout24));
const layout8 = await tentativeLayout(360, 8);
check('La fila pendiente no se aplasta con letra de 8px',
  layout8.nameW >= 90 && layout8.rowH <= 220 && layout8.badgeW >= 60 && layout8.badgeH <= 18 && !layout8.skinny,
  JSON.stringify(layout8));
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate((font) => { document.documentElement.style.fontSize = font; }, fontBefore);
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
async function waitLayout(width, px) {
  await page.setViewportSize({ width, height: 844 });
  await page.evaluate((size) => { document.documentElement.style.fontSize = size + 'px'; }, px);
  return page.evaluate(() => {
    const row = [...document.querySelectorAll('#wait-list .slot')].find((el) => el.querySelector('.name')?.textContent === 'Avisa Teo');
    const name = row.querySelector('.name').getBoundingClientRect();
    const box = row.getBoundingClientRect();
    const promote = row.querySelector('.promote-btn').getBoundingClientRect();
    const skinny = [...row.querySelectorAll('*')].some((el) => {
      const r = el.getBoundingClientRect();
      const text = (el.textContent || '').trim();
      return text.length > 8 && r.width > 0 && r.width < 16 && r.height > r.width * 3;
    });
    return {
      nameW: Math.round(name.width),
      rowH: Math.round(box.height),
      promoteW: Math.round(promote.width),
      promoteH: Math.round(promote.height),
      skinny,
    };
  });
}
const wait18 = await waitLayout(390, 18);
check('La fila de espera no se aplasta a 390px',
  wait18.nameW >= 90 && wait18.rowH <= 280 && wait18.promoteW >= 180 && wait18.promoteH <= 52 && !wait18.skinny,
  JSON.stringify(wait18));
const wait24 = await waitLayout(360, 24);
check('La fila de espera no se aplasta con letra de 24px',
  wait24.nameW >= 90 && wait24.rowH <= 360 && wait24.promoteW >= 180 && wait24.promoteH <= 52 && !wait24.skinny,
  JSON.stringify(wait24));
const wait8 = await waitLayout(360, 8);
check('La fila de espera no se aplasta con letra de 8px',
  wait8.nameW >= 90 && wait8.rowH <= 200 && wait8.promoteW >= 180 && wait8.promoteH <= 52 && !wait8.skinny,
  JSON.stringify(wait8));
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate((font) => { document.documentElement.style.fontSize = font; }, fontBefore);
const teoSum = await page.textContent('#confirm-sum');
check('En espera no entra en el resumen', teoSum.includes('Sin respuesta: 0') && teoSum.includes('No juegan: 1'), teoSum);
const [teoPopup] = await Promise.all([
  page.waitForEvent('popup'),
  page.locator('#wait-list .slot', { hasText: 'Avisa Teo' }).locator('[data-promote]').click(),
]);
await teoPopup.waitForURL((url) => /wa\.me|phone=/.test(String(url)), { waitUntil: 'commit' });
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
  && teoText.includes('/c/?k=')
  && teoText.includes(luisStored.token) === false
  && /\/c\/\?k=[0-9A-Za-z]{8}/.test(teoText), teoText.slice(0, 180));
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

// Con jugadores se cancela. Sin jugadores se borra.
await page.click('.match-card[data-date="2026-10-26"]');
await page.waitForSelector('#btn-cancel-match');
check('Con jugadores no aparece Borrar', await page.locator('#btn-del-match').count() === 0);
check('Cancelar partido está al final y en rojo', await page.evaluate(() => {
  const btn = document.querySelector('#btn-cancel-match');
  const slots = document.querySelector('#slots');
  if (!btn || !slots) return false;
  const after = (btn.compareDocumentPosition(slots) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
  return after && btn.classList.contains('solid') && getComputedStyle(btn).backgroundColor === 'rgb(198, 40, 40)';
}));
let cancelAsk = '';
const onCancelAsk = (d) => { if (d.message().includes('cancelar el partido')) cancelAsk = d.message(); };
page.on('dialog', onCancelAsk);
await page.click('#btn-cancel-match');
await page.waitForSelector('#cancel-notes');
check('Pide confirmación antes de cancelar', cancelAsk === '¿Seguro que querés cancelar el partido?', cancelAsk);
page.off('dialog', onCancelAsk);
check('Al cancelar se sugiere el motivo en las notas', (await page.textContent('#cancel-form')).includes('motivo'));
await page.fill('#cancel-notes', 'Se inundó la cancha');
await page.click('#cancel-form button[type=submit]');
await page.waitForSelector('#cancel-links a');
const cancelHref = await page.locator('#cancel-links a').first().getAttribute('href');
const cancelText = decodeURIComponent(cancelHref || '');
check('Pregunta y arma el aviso de WhatsApp sin link de confirmación',
  /wa\.me\/549/.test(cancelHref || '') && cancelText.includes('se canceló') && cancelText.includes('Se inundó la cancha') && !cancelText.includes('confirmar.html') && !cancelText.includes('/c/?k='),
  cancelText.slice(0, 180));
await page.click('dialog.sheet [data-close]');
await page.waitForSelector('#match-cancelled');
await page.waitForSelector('#match-notes');
check('El detalle muestra Cancelado y las notas', (await page.textContent('#match-notes')).includes('Se inundó la cancha') && await page.locator('.badge.bad').count() >= 1);
check('Un partido cancelado no ofrece recordatorios', await page.locator('#btn-remind').count() === 0 && await page.locator('.remind-banner').count() === 0);
const cancelState = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const entry = Object.entries(db.matches).find(([, m]) => m.date === '2026-10-26');
  const players = Object.values(db.players).filter((p) => p.matchId === entry[0]);
  const card = Object.values(db.confirmations).find((item) => item.matchId === entry[0]);
  return { id: entry[0], count: entry[1].playerCount, players: players.length, notes: entry[1].notes, cancelled: entry[1].cancelled, card: card?.cancelled === true };
});
check('El contador y la ficha quedan cancelados', cancelState.count === cancelState.players && cancelState.players > 0 && cancelState.cancelled === true && cancelState.card && cancelState.notes.includes('inundó'), JSON.stringify(cancelState));
const refused = await page.evaluate(async (id) => {
  try { await window.__app.store.deleteMatch(id); return 'deleted'; }
  catch (e) { return e.code || ''; }
}, cancelState.id);
check('El store rechaza borrar si hay jugadores', refused === 'has-players', refused);
const confirmWho = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const entry = Object.entries(db.matches).find(([, m]) => m.date === '2026-10-26');
  const player = Object.entries(db.players).find(([, p]) => p.matchId === entry[0] && p.confirmToken);
  return { matchId: entry[0], id: player[0], token: player[1].confirmToken };
});
const cancelledPage = await ctx.newPage();
await cancelledPage.goto(`${BASE}confirmar.html?m=${encodeURIComponent(confirmWho.matchId)}&p=${encodeURIComponent(confirmWho.id)}&t=${encodeURIComponent(confirmWho.token)}`);
await cancelledPage.waitForSelector('#confirm-cancelled');
check('La confirmación de un partido cancelado no ofrece sí o no', await cancelledPage.locator('#btn-si').count() === 0 && (await cancelledPage.textContent('#confirm-cancelled')).includes('se canceló'));
await cancelledPage.close();
await page.click('#btn-back');
await page.waitForSelector('.match-card[data-date="2026-10-26"]');
check('La lista muestra el badge Cancelado', (await page.textContent('.match-card[data-date="2026-10-26"]')).includes('Cancelado'));
check('El partido cancelado sigue en la lista', await page.locator('.match-card[data-date="2026-10-26"]').count() === 1);

await page.click('#btn-add-match');
await page.fill('#match-form [name=date]', '2026-11-02');
await page.fill('#match-form [name=time]', '18:00');
await page.click('#match-form button[type=submit]');
await page.waitForSelector('.match-card[data-date="2026-11-02"]');
await page.click('.match-card[data-date="2026-11-02"]');
await page.waitForSelector('#btn-del-match');
check('Sin jugadores se puede borrar', await page.locator('#btn-cancel-match').count() === 0);
await page.click('#btn-del-match');
await page.waitForFunction(() => !document.body.innerText.includes('2/11'));
check('Borrar un partido vacío', true);

// Cartel de 2 horas. El reloj está fijo en lunes 19/10 13:00.
check('Un partido a varios días no muestra el cartel', (await page.locator('.remind-banner').count()) === 0);
await page.click('#btn-add-match');
await page.fill('#match-form [name=date]', '2026-10-19');
await page.fill('#match-form [name=time]', '15:05');
await page.fill('#match-form [name=note]', 'Cancha 1');
await page.click('#match-form button[type=submit]');
await page.waitForSelector('.match-card[data-date="2026-10-19"]');
check('A más de 2 horas tampoco hay cartel', (await page.locator('.remind-banner').count()) === 0);
await page.click('.match-card[data-date="2026-10-19"]');
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
await assertStill('La lista de Jugadores no se redibuja sola');
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
await page.setViewportSize({ width: 390, height: 480 });
await page.evaluate(() => window.scrollTo(0, 80));
await assertStill('La búsqueda de Jugadores se queda quieta');
await assertRepaintKeeps('La búsqueda de Jugadores conserva el texto y el scroll');
check('La búsqueda sigue en jose', (await page.inputValue('#roster-q')) === 'jose' && await page.locator('#roster-list .name').count() === 1);
await page.fill('#roster-q', '');
const scrollIds = await page.evaluate(async () => {
  const ids = [];
  for (let i = 0; i < 28; i++) ids.push(await window.__app.store.addRoster({ name: `Scroll ${String(i).padStart(2, '0')} Jugador`, phone: '' }, window.__app.who));
  return ids;
});
await page.waitForFunction(() => document.querySelectorAll('#roster-list .slot').length >= 20);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
const stickySearch = await page.evaluate(() => {
  const r = document.querySelector('#roster-q').getBoundingClientRect();
  const bar = document.querySelector('.topstack').getBoundingClientRect().bottom;
  return { top: Math.round(r.top), h: Math.round(r.height), bar: Math.round(bar), vh: innerHeight };
});
check('La búsqueda de Jugadores sigue visible al bajar',
  stickySearch.top >= stickySearch.bar - 2 && stickySearch.top < stickySearch.vh - 40 && stickySearch.h >= 30,
  JSON.stringify(stickySearch));
await page.evaluate(async (ids) => {
  for (const id of ids) await window.__app.store.deleteRoster(id);
}, scrollIds);
await page.evaluate(() => window.scrollTo(0, 0));
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#tab-proximos');
await page.waitForSelector('.match-card');
await page.click('.match-card[data-date="2026-10-20"]');
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
const juanRoster = page.locator('#roster-list .slot', { hasText: 'Juan Pérez' });
check('En Jugadores, Martín no edita a quien agregó Gustavo', await juanRoster.locator('[data-roster-edit]').isDisabled() && (await juanRoster.locator('.edit-lock').innerText()).replace(/\s+/g, ' ').trim() === 'Solo lo puede editar el organizador que lo agregó');
check('Borrar de Jugadores no es la edición', !(await juanRoster.locator('[data-roster-del]').isDisabled()));
await page.locator('#roster-list .slot', { hasText: 'Ernesto Pereira' }).locator('[data-roster-edit]').click();
await page.fill('#roster-form [name=name]', 'Ernesto P.');
await page.click('#roster-form button[type=submit]');
await page.waitForSelector('#roster-list .name:text-is("Ernesto P.")');
check('Se puede editar un jugador guardado', true);
await page.locator('#roster-list .slot', { hasText: 'Luis Gómez' }).locator('[data-roster-del]').click();
await page.waitForFunction(() => (document.querySelector('#toast')?.textContent || '').includes('está anotado en 1 partido'));
check('No se borra de Jugadores si está anotado', (await page.textContent('#toast')).includes('Luis Gómez está anotado en 1 partido. Quitalo de esos partidos antes de borrarlo de Jugadores.') && (await page.locator('#roster-list .name', { hasText: 'Luis Gómez' }).count()) === 1);
await page.click('#btn-add-roster');
await page.fill('#roster-form [name=name]', 'Libre Gómez');
await page.click('#roster-form button[type=submit]');
await page.waitForSelector('#roster-list .name:text-is("Libre Gómez")');
await page.locator('#roster-list .slot', { hasText: 'Libre Gómez' }).locator('[data-roster-del]').click();
await page.waitForFunction(() => !document.body.innerText.includes('Libre Gómez'));
check('Se puede borrar un jugador guardado que no está en un partido', (await page.locator('#roster-list .name', { hasText: 'Libre Gómez' }).count()) === 0);
await page.click('#btn-add-roster');
await page.waitForSelector('#roster-form #wa-share');
check('Alta de Jugadores: Mostrar el WhatsApp para todos, destildado', (await page.locator('#roster-form #wa-share-line').innerText()).replace(/\s+/g, ' ').trim() === 'Mostrar el WhatsApp para todos' && !(await page.isChecked('#roster-form #wa-share')));
await page.fill('#roster-form [name=name]', 'Otro Pérez');
await page.fill('#roster-form [name=phone]', '11 4444-5555');
await page.click('#roster-form button[type=submit]');
check('No duplica el mismo WhatsApp', (await page.textContent('#rf-err')).includes('ya tiene ese WhatsApp'));
await page.click('#roster-form [data-close]');
await page.click('#tab-proximos');
await page.waitForSelector('.match-card');

// Perfil: tocar al jugador, nivel, posiciones, nota y estadística de un partido ya jugado
await page.click('.match-card[data-date="2026-10-20"]');
await page.click('#btn-edit-match');
await page.fill('#match-form [name=date]', '2026-10-15');
await page.fill('#match-form [name=time]', '21:00');
await page.click('#match-form button[type=submit]');
await page.waitForFunction(() => document.querySelector('h1')?.textContent.includes('15/10/2026'));
await page.locator('#slots .who', { hasText: 'Ernesto P.' }).click();
await page.waitForSelector('#profile');
check('Tocarlo abre el perfil con WhatsApp', (await page.getAttribute('#profile-wa', 'href')).startsWith('https://wa.me/5491122223333'));
await assertStill('El perfil no se redibuja solo');
check('Mostrar el WhatsApp a los demás arranca desactivado', (await page.locator('#phone-share').count()) === 1 && !(await page.isChecked('#phone-share')) && (await page.textContent('#phone-share-line')).includes('Mostrar mi WhatsApp a los demás organizadores'));
check('Cuenta el partido pasado en la lista principal', (await page.textContent('#stat-times')).includes('Jugó 1 vez'));
check('Mayormente jueves · 21:00', (await page.textContent('#stat-summary')).includes('Mayormente jueves · 21:00'));
for (let i = 0; i < 8; i++) await page.click('#level-up');
await page.waitForFunction(() => document.querySelector('#level-val')?.value === '8,0');
check('Nivel de juego 8', await page.inputValue('#level-val') === '8,0');
await page.fill('#level-val', '6,85');
check('No se puede escribir un segundo decimal', await page.inputValue('#level-val') === '6,8');
await page.locator('#level-val').blur();
await page.waitForFunction(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  return Object.values(db.roster || {}).some((row) => row.name === 'Ernesto P.' && row.level === 6.8);
});
await page.fill('#level-val', '8');
await page.locator('#level-val').blur();
await page.waitForFunction(() => document.querySelector('#level-val')?.value === '8,0');
check('El nivel quedó en 8,0', await page.inputValue('#level-val') === '8,0');
await page.click('[data-pos="Defensa"]');
await page.click('[data-pos="Mediocampo"]');
check('Posiciones Defensa y Mediocampo', (await page.locator('[data-pos="Defensa"].on').count()) === 1 && (await page.locator('[data-pos="Ataque"].on').count()) === 0 && (await page.locator('[data-pos="Mediocampo"].on').count()) === 1);
await page.click('#btn-add-note');
await page.fill('#note-form [name=text]', 'Hizo un gol');
await page.click('#note-form button[type=submit]');
await page.waitForSelector('.pnote:has-text("Hizo un gol")');
check('La nota muestra la fecha del partido', (await page.textContent('.pnote')).includes('Jueves 15/10') && (await page.textContent('.pnote')).includes('Hizo un gol'));
await page.click('#btn-back');
await page.waitForSelector('#slots .name:text-is("Ernesto P.")');
check('El nivel se ve al lado del nombre', (await page.locator('#slots .slot', { has: page.locator('.name:text-is("Ernesto P.")') }).locator('.level-badge').innerText()) === '8,0');
await page.click('#btn-roster');
await page.locator('#roster-list .who', { hasText: 'Ernesto P.' }).click();
await page.waitForSelector('#profile');
check('Desde Jugadores es el mismo perfil', (await page.inputValue('#level-val')) === '8,0' && (await page.textContent('#notes')).includes('Hizo un gol'));
const signupBox = page.locator('#signup-list input[data-signup]:not([disabled])').first();
await signupBox.check();
await page.locator('#signup-tentative').check();
await page.waitForFunction(() => document.querySelector('#btn-signup')?.textContent === 'Anotar en 1 partido');
await page.setViewportSize({ width: 390, height: 480 });
await page.locator('#ledger').scrollIntoViewIfNeeded();
await page.evaluate(() => window.scrollTo(0, Math.max(200, (document.scrollingElement?.scrollTop || 0))));
await assertStill('El perfil conserva la selección y no se redibuja solo');
await assertRepaintKeeps('El perfil conserva partidos elegidos, el filtro y el scroll');
check('Sigue elegido un partido y el lugar reservado', (await page.locator('#signup-list input[data-signup]:checked').count()) === 1 && await page.isChecked('#signup-tentative') && (await page.textContent('#btn-signup')) === 'Anotar en 1 partido');
await page.evaluate(() => window.scrollTo(0, 0));
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#btn-back');
await page.waitForSelector('#roster-list');
await page.click('#tab-proximos');
await page.waitForSelector('.match-card');

await page.click('.match-card[data-date="2026-10-21"]');
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
await page.click('#btn-roster');
await page.waitForSelector('#roster-list');
const rosterText = (await page.locator('#view').innerText()).replace(/\s+/g, ' ');
check('Jugadores muestra solo la lista', (await page.locator('#btn-pagos').count()) === 0 && (await page.locator('#btn-roster-list').count()) === 0 && (await page.locator('#roster-section').count()) === 0 && !/Lista guardada/i.test(rosterText) && !/se comparte entre los dos/i.test(rosterText) && await page.isVisible('#roster-list'), rosterText.slice(0, 180));
await page.locator('#roster-list .who', { hasText: 'Juan Pérez' }).click();
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
await page.waitForFunction(() => location.hash === '#/jugadores' && document.querySelector('#roster-list') && !document.querySelector('#btn-pagos'));
check('Volver del perfil abre la lista de jugadores', true);

await page.evaluate(() => { location.hash = '#/usuarios'; });
await page.waitForFunction(() => (document.body.innerText || '').includes('Solo el administrador puede crear o desactivar organizadores'));
check('Martín no crea ni borra organizadores', (await page.locator('#user-form').count()) === 0 && (await page.locator('[data-user-del]').count()) === 0);
await page.click('#btn-back');
await page.click('#tab-proximos');
await page.waitForSelector('#btn-add-match');
check('Martín sigue pudiendo agregar partidos', await page.isVisible('#btn-add-match'));

await page.click('#btn-settings');
check('Un organizador no administra usuarios', (await page.locator('#set-organizers').count()) === 0 && await page.isVisible('#set-venues'));
check('Un organizador no ve el backup', (await page.locator('#set-backup, #set-restore, #set-reset-db').count()) === 0);
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'gustavo@demo.local');
await page.fill('#login-password', 'demo-gustavo');
await page.click('#login-form button[type=submit]');
await page.waitForFunction(() => window.__app?.who);
await page.waitForSelector('#btn-add-match');
await page.click('#btn-settings');
await page.click('#set-organizers');
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
await page.waitForSelector('.match-card[data-date="2026-10-19"]');
await page.click('.match-card[data-date="2026-10-19"]');
await page.waitForSelector('.slot:has-text("Ana Hoy") .pay-btn');
await page.click('.slot:has-text("Ana Hoy") .pay-btn');
await page.waitForSelector('#pay-form [name=pending]');
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
await page.waitForSelector('#roster-list');
check('La ruta vieja de Pagos abre la lista de jugadores', (await page.locator('#btn-pagos').count()) === 0 && (await page.locator('#pending-list').count()) === 0 && (await page.locator('#pay-summary').count()) === 0 && await page.isVisible('#roster-list'));
await page.evaluate(() => { location.hash = '#/jugadores/pagos'; });
await page.waitForFunction(() => location.hash === '#/jugadores/pagos' && !!document.querySelector('#roster-list') && !document.querySelector('#btn-pagos'));
check('La ruta vieja de la solapa abre la lista', await page.isVisible('#roster-list'));
await page.click('#tab-proximos');
await page.click('.match-card[data-date="2026-10-19"]');
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
check('El perfil ofrece anotar como pendiente', await page.isVisible('#signup-tentative') && (await page.locator('#profile').innerText()).includes('Anotar como pendiente de confirmación') && !(await page.locator('#profile').innerText()).includes('Lugar reservado'));
await page.check('#signup-tentative');
await sabadoRow.locator('input[type=checkbox]').check();
check('El botón dice Anotar en 1 partido', (await page.textContent('#btn-signup')).trim() === 'Anotar en 1 partido');
await page.click('#btn-signup');
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('#signup-list .signup-row')].find((el) => el.innerText.includes('Sábado'));
  return row && row.innerText.includes('Anotado');
});
const sabadoPack = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const found = Object.entries(db.players).find(([, p]) => p.name === 'Juan Pérez' && p.matchDate === '2026-10-24');
  return found ? { player: found[1], contact: db.contacts.players[found[0]] } : null;
});
const sabadoPlayers = sabadoPack ? [sabadoPack.player] : [];
check('El sábado usa la misma alta: Gustavo, token y teléfono aparte', sabadoPlayers.length === 1 && sabadoPlayers[0].addedBy === 'Gustavo' && (sabadoPlayers[0].phone == null || sabadoPlayers[0].phone === '') && sabadoPack.contact.phone === '5491112345678' && sabadoPack.contact.ownerUid === 'gustavo' && sabadoPack.contact.visibleToAll === false && sabadoPlayers[0].confirmToken.length >= 16 && sabadoPlayers[0].waiting !== true && sabadoPlayers[0].tentative === true);
const sabadoCard = await page.evaluate((token) => JSON.parse(localStorage.getItem('f7c-demo-db')).confirmations[token], sabadoPlayers[0].confirmToken);
check('La ficha del sábado no tiene teléfono', sabadoCard && sabadoCard.name === 'Juan Pérez' && sabadoCard.phone == null && !JSON.stringify(sabadoCard).includes('549'));
await page.locator('#signup-list .signup-row', { hasText: 'Sábado 24/10' }).locator('[data-open-match]').click();
await page.waitForSelector('#slots .name:text-is("Juan Pérez")');
check('Tocar el sábado abre el partido', (await page.textContent('h1')).includes('24/10/2026'));
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
await page.evaluate(async (id) => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const pids = Object.entries(db.players).filter(([, p]) => p.matchId === id).map(([pid]) => pid);
  for (const pid of pids) await window.__app.store.deletePlayer(pid);
  await window.__app.store.deleteMatch(id);
}, pickIds.tight);
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
await page.waitForSelector('.match-card[data-date="2026-10-22"]');
await page.click('.match-card[data-date="2026-10-22"]');
await page.waitForSelector('.slot:has-text("Nico R.") .pay-btn');
await page.click('.slot:has-text("Nico R.") .pay-btn');
await page.waitForSelector('#pay-form [name=cash]');
await page.locator('#pay-form [name=cash]').focus();
check('El pago usa el precio guardado en el partido', await page.$eval('#pay-form [name=cash]', (el) => el.value.replace(/\./g, '') === '5000'));
check('El botón de un partido muestra el precio nuevo', (await page.textContent('#pay-prices')).includes('$6.000'));
await page.click('#pay-form [data-close]');
const propio = await page.evaluate(async () => {
  const id = await window.__app.store.addMatch({ date: '2026-11-09', time: '18:00', price: 7500, perTeam: 7, capacity: 14 }, window.__app.who);
  await window.__app.store.addPlayer({ id, date: '2026-11-09', time: '18:00', capacity: 14 }, { name: 'Precio Propio', phone: '' }, window.__app.who);
  return id;
});
await page.evaluate((id) => { location.hash = `#/partido/${id}`; }, propio);
await page.waitForSelector('#match-price');
check('El detalle muestra el valor de ese partido', (await page.textContent('#match-price')).includes('$7.500'));
await page.click('.slot:has-text("Precio Propio") .pay-btn');
await page.waitForSelector('#pay-form [name=transfer]');
await page.locator('#pay-form [name=transfer]').focus();
check('Un campo vacío usa el valor del partido', await page.$eval('#pay-form [name=transfer]', (el) => el.value.replace(/\./g, '') === '7500'));
await page.locator('#pay-free').check();
check('Juega gratis deja los montos vacíos y apagados', await page.$eval('#pay-form [name=transfer]', (el) => el.disabled && el.value === '') && await page.$eval('#pay-form [name=cash]', (el) => el.disabled));
await page.click('#pay-form button[type=submit]');
await page.waitForSelector('.slot:has-text("Precio Propio") .pay-line');
check('Quien juega gratis figura saldado', (await page.textContent('.slot:has-text("Precio Propio")')).includes('Juega gratis') && (await page.textContent('#collected')).includes('juega gratis'));
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
await page.waitForSelector('#pay-form [name=cash]');
check('Sin aplicar, el monto arranca vacío', await page.$eval('#pay-form [name=cash]', (el) => el.value === ''));
check('La hoja también muestra la promo', (await page.textContent('#pay-promo')).includes('Promo 2 partidos por $9.000'));
await page.click('#pay-apply-promo');
check('Aplicar a los dos partidos pone el total de la promo', await page.$eval('#pay-form [name=cash]', (el) => el.value.replace(/\./g, '') === '9000'));
await page.evaluate(() => window.__app.session.createOrganizer({ name: 'Rita', email: 'rita@demo.local', password: 'rita-demo' }));
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
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  for (const id of [ids.a, ids.b]) {
    const pids = Object.entries(db.players).filter(([, p]) => p.matchId === id).map(([pid]) => pid);
    for (const pid of pids) await window.__app.store.deletePlayer(pid);
    await window.__app.store.deleteMatch(id);
  }
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
await page.waitForSelector('.match-card[data-date="2026-11-03"]');
await page.click('.match-card[data-date="2026-11-03"]');
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
await page.waitForSelector('.match-card[data-date="2026-11-04"]');
check('El creador ve su partido Solo yo', (await page.textContent('body')).includes('Privado'));
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'martin@demo.local');
await page.fill('#login-password', 'demo-martin');
await page.click('#login-form button[type=submit]');
await page.waitForFunction(() => window.__app?.who);
await page.waitForSelector('.match-card');
check('Martín no ve el Solo yo de Gustavo', !(await page.locator('.match-card[data-date="2026-11-04"]').count()) && (await page.locator('.match-card[data-date="2026-11-03"]').count()) === 1);
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'gustavo@demo.local');
await page.fill('#login-password', 'demo-gustavo');
await page.click('#login-form button[type=submit]');
await page.waitForSelector('.match-card[data-date="2026-11-04"]');
await page.evaluate(async () => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const ids = Object.entries(db.matches).filter(([, m]) => m.date === '2026-11-03' || m.date === '2026-11-04').map(([id]) => id);
  for (const id of ids) {
    const pids = Object.entries(db.players).filter(([, p]) => p.matchId === id).map(([pid]) => pid);
    for (const pid of pids) await window.__app.store.deletePlayer(pid);
    await window.__app.store.deleteMatch(id);
  }
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
await page.evaluate(async () => {
  const who = window.__app.who;
  const hoy = await window.__app.store.addMatch({ date: '2026-10-19', time: '21:00', note: 'Hoy deuda', capacity: 14 }, who);
  const hoyMatch = window.__app.matches.find((m) => m.id === hoy);
  await window.__app.store.addPlayer(hoyMatch, { name: 'Debe Hoy', phone: '5491100002222' }, who);
  const manana = await window.__app.store.addMatch({ date: '2026-10-20', time: '21:00', note: 'Mañana no', capacity: 14 }, who);
  const mananaMatch = window.__app.matches.find((m) => m.id === manana);
  await window.__app.store.addPlayer(mananaMatch, { name: 'Debe Mañana', phone: '5491100003333' }, who);
});
await page.waitForSelector('#list-next .match-card[data-note="Hoy deuda"]');
const hoyText = (await page.locator('#list-next .match-item:has([data-note="Hoy deuda"])').innerText()).replace(/\s+/g, ' ');
const mananaText = (await page.locator('#list-next .match-item:has([data-note="Mañana no"])').innerText()).replace(/\s+/g, ' ');
check('Hoy muestra lo que falta pagar y conserva la nota', hoyText.includes('Faltan pagar (que anoté yo): $5.000') && hoyText.includes('Hoy deuda') && !hoyText.includes('Debe Hoy'), hoyText);
check('Mañana no muestra la deuda y conserva la nota', !mananaText.includes('Faltan pagar') && mananaText.includes('Mañana no'), mananaText);
await page.click('#list-next .match-item:has([data-note="Hoy deuda"]) [data-owe-toggle]');
const hoyOpen = await page.evaluate(() => ({
  hash: location.hash,
  text: (document.querySelector('#list-next .match-item:has([data-note="Hoy deuda"])')?.innerText || '').replace(/\s+/g, ' '),
}));
check('En Hoy la flecha no abre el partido', (hoyOpen.hash === '#/' || hoyOpen.hash === '') && hoyOpen.text.includes('Debe Hoy') && hoyOpen.text.includes('$5.000'), `${hoyOpen.hash} ${hoyOpen.text}`);
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
const historyOrder = await page.$$eval('#list-history .match-card', (els) => els.map((e) => e.dataset.date));
const i18 = historyOrder.indexOf('2026-10-18');
const i15 = historyOrder.indexOf('2026-10-15');
const i12 = historyOrder.indexOf('2026-10-12');
check('El historial lista lo pasado, más reciente primero', i18 !== -1 && i15 !== -1 && i12 !== -1 && i18 < i15 && i15 < i12, historyOrder.join(', '));
await page.fill('#hist-day', '2026-10-18');
await page.click('#hist-apply');
await page.waitForFunction(() => [...document.querySelectorAll('#list-history .match-card')].map((el) => el.dataset.date).join('|') === '2026-10-18');
check('Filtrar por una fecha deja ese día', (await page.textContent('#hist-caption')).includes('Domingo 18/10'));
await page.click('#hist-clear');
await page.waitForSelector('#list-history .match-card[data-note="Ayer"]');
await page.fill('#hist-from', '2026-10-12');
await page.fill('#hist-to', '2026-10-15');
await page.click('#hist-apply');
await page.waitForFunction(() => {
  const titles = [...document.querySelectorAll('#list-history .match-card')].map((el) => el.dataset.date);
  return titles.includes('2026-10-15') && titles.includes('2026-10-12') && !titles.includes('2026-10-18');
});
check('Filtrar por rango desde-hasta', true);
await page.click('#hist-clear');
await page.waitForSelector('#list-history .match-card[data-note="Ayer"]');
check('Limpiar vuelve a los últimos partidos', await page.locator('#hist-clear').isHidden() && (await page.textContent('#hist-caption')).includes('más recientes primero'));
check('El aviso del historial no incluye una fecha', (await page.locator('#history-filter .roster-lead').innerText()).trim() === 'Por defecto muestra los últimos 30 partidos');
check('Historial no muestra sede y formato al pie', await page.locator('#view .footer-note').count() === 0);
check('Todas arranca elegida', await page.locator('#hist-venues [data-venue="all"]').evaluate((el) => el.classList.contains('on')));
await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/historial-todas.png' });
const ayerCard = (await page.textContent('#list-history .match-card[data-note="Ayer"]')).replace(/\s+/g, ' ');
check('La tarjeta del historial no muestra la nota ni la espera', /21hs \(\$5\.000\)/.test(ayerCard) && !/Con pechera/.test(ayerCard) && /1\/14/.test(ayerCard) && !/en espera/.test(ayerCard) && !/\bAyer\b/.test(ayerCard), ayerCard.trim());
const ayerItem = (await page.locator('#list-history .match-item:has([data-note="Ayer"])').innerText()).replace(/\s+/g, ' ');
check('El historial avisa lo que falta pagar', ayerItem.includes('Faltan pagar (que anoté yo): $5.000') && !ayerItem.includes('Histórico Pérez'), ayerItem);
await page.click('#list-history .match-item:has([data-note="Ayer"]) [data-owe-toggle]');
const openedDebt = await page.evaluate(() => ({
  hash: location.hash,
  text: (document.querySelector('#list-history .match-item:has([data-note="Ayer"])')?.innerText || '').replace(/\s+/g, ' '),
  open: document.querySelector('#list-history .match-item:has([data-note="Ayer"]) .owe-box')?.classList.contains('open') === true,
}));
check('La flecha muestra quién debe y no abre el partido', openedDebt.hash === '#/historial' && openedDebt.open && openedDebt.text.includes('Histórico Pérez') && openedDebt.text.includes('$5.000') && !openedDebt.text.includes('Espera Vieja'), openedDebt.text);
await page.click('#hist-debtors');
await page.waitForFunction(() => document.querySelector('#hist-debtors')?.getAttribute('aria-pressed') === 'true');
const debtorDates = await page.$$eval('#list-history .match-card', (els) => els.map((el) => el.dataset.date));
check('Partidos con deudores deja solo los que deben', debtorDates.includes('2026-10-18') && !debtorDates.includes('2026-10-12'), debtorDates.join(','));
await page.click('#hist-debtors');
await page.waitForSelector('#list-history .match-card[data-note="Solo viejo"]');
check('El filtro de deudores se apaga', (await page.locator('#hist-debtors').getAttribute('aria-pressed')) === 'false');
check('Hoy no entra al historial', await page.locator('#list-history .match-card:has-text("Hoy temprano")').count() === 0);
await page.click('#list-history .match-card[data-note="Ayer"]');
await page.waitForSelector('#slots .name:text-is("Histórico Pérez")');
check('El detalle muestra jugadores y la lista de espera', await page.locator('#wait-list .name:text-is("Espera Vieja")').count() === 1 && await page.isVisible('#btn-add-player'));
check('Un partido ya jugado no muestra Cancelar partido', await page.locator('#btn-cancel-match').count() === 0);
await page.setViewportSize({ width: 390, height: 480 });
await page.evaluate(() => window.scrollTo(0, 180));
await assertStill('El detalle del historial no se redibuja solo');
await assertRepaintKeeps('El detalle del historial conserva el scroll');
await page.evaluate(() => window.scrollTo(0, 0));
await page.setViewportSize({ width: 390, height: 844 });
await page.click('#slots .pay-btn');
await page.waitForSelector('#pay-form');
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
await page.evaluate(async () => {
  const store = window.__app.store;
  const norte = await store.addVenue('Club Histórico');
  await store.addMatch({ date: '2026-10-11', time: '19:00', note: 'Otra sede', venueId: norte, venueName: 'Club Histórico' }, window.__app.who);
  await store.updateVenue(norte, { active: false });
});
await page.waitForSelector('#hist-venues button:has-text("Club Histórico")');
await page.click('#hist-venues button:has-text("Club Histórico")');
await page.waitForFunction(() => {
  const titles = [...document.querySelectorAll('#list-history .match-card')].map((el) => el.dataset.date);
  return titles.length === 1 && titles[0] === '2026-10-11';
});
check('Una sede, aunque esté inactiva, filtra el historial', !(await page.locator('#hist-venues [data-venue="all"]').evaluate((el) => el.classList.contains('on'))));
await page.click('#hist-venues [data-venue="colegiales"]');
await page.waitForSelector('#list-history .match-card[data-note="Ayer"]');
check('Se pueden elegir dos sedes', await page.locator('#list-history .match-card[data-note="Otra sede"]').count() === 1 && await page.locator('#list-history .match-card[data-note="Ayer"]').count() === 1);
await page.click('#hist-venues [data-venue="all"]');
await page.waitForFunction(() => document.querySelector('#hist-venues [data-venue="all"]')?.classList.contains('on'));
check('Todas vuelve a mostrar los partidos', await page.locator('#list-history .match-card').count() > 2);
check('La pestaña Historial sigue activa al volver', await page.getAttribute('#btn-historial', 'aria-current') === 'page' && await page.getAttribute('#tab-proximos', 'aria-current') !== 'page');
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'martin@demo.local');
await page.fill('#login-password', 'demo-martin');
await page.click('#login-form button[type=submit]');
await page.waitForFunction(() => window.__app?.who);
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('#list-next');
check('Martín ve el de hoy en el inicio', await page.locator('#list-next .match-card:has-text("Hoy temprano")').count() === 1);
await page.click('#btn-historial');
await page.waitForSelector('#list-history');
check('Martín ve el partido de ayer', await page.locator('#list-history .match-card[data-note="Ayer"]').count() === 1);
check('Martín no ve la deuda de los jugadores de Gustavo', !(await page.locator('#list-history .match-item:has([data-note="Ayer"])').innerText()).includes('Faltan pagar'));
check('Martín no ve el Solo yo viejo', await page.locator('#list-history .match-card[data-note="Solo viejo"]').count() === 0 && !(await page.locator('body').innerText()).includes('Solo viejo'));
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'gustavo@demo.local');
await page.fill('#login-password', 'demo-gustavo');
await page.click('#login-form button[type=submit]');
await page.waitForFunction(() => window.__app?.who);
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
  await window.__app.store.adjustScore(ayer.id, 'bib', 2);
  await window.__app.store.adjustScore(ayer.id, 'plain', 1);
  return { id, ana, beto, ciro };
});
await page.evaluate((id) => { location.hash = `#/partido/${encodeURIComponent(id)}`; }, equipos.id);
await page.waitForSelector('#btn-teams');
await page.click('#btn-teams');
await page.waitForSelector('#team-unassigned');
check('La lista de espera no entra en los equipos', !(await page.locator('#team-board').innerText()).includes('Equipo Espera') && (await page.locator('#team-unassigned').innerText()).includes('Equipo Ana'));
const teamsIntro = await page.locator('#view').innerText();
check('Equipos no repite la ayuda ni el cupo', !teamsIntro.includes('Con los anotados') && !teamsIntro.includes('Tocá la pechera') && (await page.locator('#tanteador').innerText()) === 'TANTEADOR' && (await page.locator('#scoreboard svg').count()) === 2 && (await page.locator('#scoreboard [data-delta="1"]').first().innerText()) === '+' && (await page.locator('#scoreboard [data-delta="-1"]').first().innerText()) === '−' && (await page.locator('#btn-teams-clear').innerText()) === 'Reset');
const bibFill = await page.locator('#scoreboard .vest-bib path').evaluate((el) => getComputedStyle(el).fill);
const plainFill = await page.locator('#scoreboard .vest-plain path').evaluate((el) => getComputedStyle(el).fill);
check('Con pechera es una musculosa naranja', bibFill === 'rgb(255, 106, 0)', bibFill);
const bibBtnBg = await page.locator('#team-unassigned [data-assign="bib"]').first().evaluate((el) => getComputedStyle(el).backgroundColor);
check('El botón de pechera no parece seleccionado', bibBtnBg === 'rgba(0, 0, 0, 0)' || bibBtnBg === 'transparent', bibBtnBg);
check('Los títulos de equipo llevan la musculosa', (await page.locator('#team-bib h2 .vest-bib').count()) === 1 && (await page.locator('#team-plain h2 .vest-plain').count()) === 1);
check('Sin pechera es la misma musculosa en contorno', plainFill === 'none' || plainFill === 'rgba(0, 0, 0, 0)', plainFill);
const vestShape = await page.locator('.vest path').evaluateAll((els) => {
  const ds = els.map((el) => el.getAttribute('d'));
  const box = els[0].getBBox();
  return { same: new Set(ds).size === 1, n: ds.length, x: box.x, w: box.width };
});
check('Todas las pecheras son la misma musculosa sin mangas', vestShape.same && vestShape.n >= 4 && vestShape.x > 5 && vestShape.w < 14, JSON.stringify(vestShape));
check('El marcador arranca en cero', (await page.textContent('#score-bib')) === '0' && (await page.textContent('#score-plain')) === '0');
await page.locator('#scoreboard [data-score="bib"][data-delta="1"]').click();
await page.locator('#scoreboard [data-score="bib"][data-delta="1"]').click();
await page.locator('#scoreboard [data-score="plain"][data-delta="1"]').click();
await page.locator('#scoreboard [data-score="bib"][data-delta="-1"]').click();
await page.waitForFunction(() => document.querySelector('#score-bib')?.textContent === '1' && document.querySelector('#score-plain')?.textContent === '1');
await page.locator('#scoreboard [data-score="bib"][data-delta="-1"]').click();
await page.locator('#scoreboard [data-score="bib"][data-delta="-1"]').click();
await page.waitForFunction(() => document.querySelector('#score-bib')?.textContent === '0');
const storedScore = await page.evaluate((id) => JSON.parse(localStorage.getItem('f7c-demo-db')).matches[id].score, equipos.id);
check('El marcador suma, no baja de cero y no mueve jugadores', storedScore.bib === 0 && storedScore.plain === 1 && (await page.locator('#team-unassigned').innerText()).includes('Equipo Ana'), JSON.stringify(storedScore));
await page.locator('#team-unassigned .team-row', { hasText: 'Equipo Ana' }).locator('[data-assign="bib"]').click();
await page.waitForSelector('#team-bib:has-text("Equipo Ana")');
check('Un toque lo manda a con pechera', (await page.textContent('#team-bib-count')) === '1' && (await page.textContent('#team-plain-count')) === '0');
await page.locator('#team-bib .team-name', { hasText: 'Equipo Ana' }).click();
await page.waitForSelector('#pm-profile');
const teamMenu = (await page.locator('#sheet').innerText()).replace(/\s+/g, ' ');
check('El nombre en Equipos abre el menú del jugador', teamMenu.includes('Equipo Ana') && teamMenu.includes('Ver perfil') && teamMenu.includes('Cargar pago') && teamMenu.includes('Debe en total: $5.000') && await page.locator('#menu-debt').count() === 1, teamMenu.slice(0, 240));
await page.click('#sheet [data-close]');
await page.waitForFunction(() => !document.querySelector('#sheet')?.open);
const anaName = await page.locator('#team-bib .team-name', { hasText: 'Equipo Ana' }).boundingBox();
await page.mouse.move(anaName.x + 6, anaName.y + anaName.height / 2);
await page.mouse.down();
await page.mouse.move(anaName.x + 36, anaName.y + anaName.height / 2, { steps: 8 });
await page.mouse.up();
const dragMenu = await page.evaluate(() => ({ open: !!document.querySelector('#sheet')?.open }));
check('Arrastrar el nombre no abre el menú', dragMenu.open === false, JSON.stringify(dragMenu));
const scoreBeforeGoals = await page.textContent('#score-bib');
await page.locator('#team-bib .team-row', { hasText: 'Equipo Ana' }).locator('[data-goal="1"]').click();
await page.locator('#team-bib .team-row', { hasText: 'Equipo Ana' }).locator('[data-goal="1"]').click();
await page.locator('#team-bib .team-row', { hasText: 'Equipo Ana' }).locator('[data-goal="-1"]').click();
await page.locator('#team-bib .team-row', { hasText: 'Equipo Ana' }).locator('[data-goal="-1"]').click();
await page.locator('#team-bib .team-row', { hasText: 'Equipo Ana' }).locator('[data-goal="-1"]').click();
await page.waitForFunction(() => document.querySelector('#team-bib .goal-n')?.textContent === '0');
const goalsStored = await page.evaluate((id) => JSON.parse(localStorage.getItem('f7c-demo-db')).players[id].goals, equipos.ana);
check('Los goles del jugador no mueven el marcador ni bajan de cero', goalsStored === 0 && (await page.textContent('#score-bib')) === scoreBeforeGoals, String(goalsStored));
check('Faltan ir al arco cuenta al asignado', (await page.textContent('#arco-bib')) === 'Faltan ir al arco: 1');
const arcoOff = await page.locator('#team-bib [data-arco]').evaluate((btn) => {
  const style = getComputedStyle(btn);
  const ico = getComputedStyle(btn.querySelector('.goal-ico'));
  return {
    bg: style.backgroundColor,
    border: style.borderTopWidth,
    opacity: ico.opacity,
    paths: btn.querySelectorAll('.goal-ico path').length,
    tick: !!btn.querySelector('.arco-tick'),
  };
});
check('El arco apagado es la red en gris, sin recuadro', (arcoOff.bg === 'rgba(0, 0, 0, 0)' || arcoOff.bg === 'transparent') && arcoOff.border === '0px' && Number(arcoOff.opacity) < 0.6 && arcoOff.paths >= 4 && !arcoOff.tick, JSON.stringify(arcoOff));
await page.locator('#team-bib .team-row', { hasText: 'Equipo Ana' }).locator('[data-arco]').click();
await page.waitForFunction(() => document.querySelector('#arco-bib')?.textContent === 'Faltan ir al arco: 0');
const arcoState = await page.evaluate((ids) => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  return { inGoal: db.players[ids.ana].inGoal, inGoalAt: db.players[ids.ana].inGoalAt, score: db.matches[ids.id].score };
}, equipos);
check('Fue al arco queda guardado y no toca el marcador', arcoState.inGoal === true && typeof arcoState.inGoalAt === 'number' && arcoState.score.bib === 0 && arcoState.score.plain === 1, JSON.stringify(arcoState));
const arcoRow = await page.locator('#team-bib .team-row', { hasText: 'Equipo Ana' }).evaluate((row) => {
  const name = row.querySelector('.team-name').getBoundingClientRect();
  const btn = row.querySelector('[data-arco]').getBoundingClientRect();
  const box = row.getBoundingClientRect();
  return {
    rowH: Math.round(box.height),
    same: Math.abs((name.top + name.height / 2) - (btn.top + btn.height / 2)) < 10,
    w: Math.round(btn.width),
    on: row.querySelector('[data-arco]').getAttribute('aria-pressed') === 'true',
  };
});
check('Fue al arco queda a la derecha de la fila', arcoRow.same && arcoRow.rowH <= 56 && arcoRow.w >= 40 && arcoRow.on, JSON.stringify(arcoRow));
const arcoOn = await page.locator('#team-bib [data-arco].on').evaluate((btn) => {
  const style = getComputedStyle(btn);
  const ico = getComputedStyle(btn.querySelector('.goal-ico'));
  const tick = btn.querySelector('.arco-tick svg');
  return {
    bg: style.backgroundColor,
    opacity: ico.opacity,
    tick: !!tick,
    fill: tick ? tick.querySelector('circle')?.getAttribute('fill') : '',
  };
});
check('El arco prendido se ve entero y suma el tilde verde', (arcoOn.bg === 'rgba(0, 0, 0, 0)' || arcoOn.bg === 'transparent') && arcoOn.opacity === '1' && arcoOn.tick && arcoOn.fill === '#0f7a3d', JSON.stringify(arcoOn));
check('Avisa si está desbalanceado', (await page.textContent('#team-balance')).includes('desbalanceado'));
await page.locator('#team-unassigned .team-row', { hasText: 'Equipo Beto' }).locator('[data-assign="bib"]').click();
await page.locator('#team-unassigned .team-row', { hasText: 'Equipo Ciro' }).locator('[data-assign="bib"]').click();
await page.waitForFunction(() => document.querySelector('#team-bib-count')?.textContent === '3');
await page.locator('#team-bib .team-row', { hasText: 'Equipo Ciro' }).locator('[data-arco]').click();
await page.locator('#team-bib .team-row', { hasText: 'Equipo Beto' }).locator('[data-arco]').click();
await page.waitForFunction(() => [...document.querySelectorAll('#team-bib .team-name')].map((el) => el.textContent).join('|') === 'Equipo Ana|Equipo Ciro|Equipo Beto');
check('Quienes fueron al arco suben arriba, primero el que se marcó antes', (await page.locator('#team-bib .team-name').allTextContents()).join('|') === 'Equipo Ana|Equipo Ciro|Equipo Beto');
const arcoOrder = await page.evaluate((ids) => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  return {
    ana: db.players[ids.ana].inGoalAt,
    ciro: db.players[ids.ciro].inGoalAt,
    beto: db.players[ids.beto].inGoalAt,
  };
}, equipos);
check('El orden del arco queda guardado en cada jugador', typeof arcoOrder.ana === 'number' && arcoOrder.ana <= arcoOrder.ciro && arcoOrder.ciro <= arcoOrder.beto, JSON.stringify(arcoOrder));
await page.locator('#team-bib .team-row', { hasText: 'Equipo Ana' }).locator('[data-arco]').click();
await page.waitForFunction(() => [...document.querySelectorAll('#team-bib .team-name')].map((el) => el.textContent).join('|') === 'Equipo Ciro|Equipo Beto|Equipo Ana');
check('Al desmarcar vuelve debajo de los que siguen en el arco', (await page.locator('#team-bib .team-name').allTextContents()).join('|') === 'Equipo Ciro|Equipo Beto|Equipo Ana');
const anaOff = await page.evaluate((id) => {
  const row = JSON.parse(localStorage.getItem('f7c-demo-db')).players[id];
  return { inGoal: row.inGoal, at: row.inGoalAt ?? null };
}, equipos.ana);
check('Desmarcar borra la hora del arco', anaOff.inGoal === false && anaOff.at == null, JSON.stringify(anaOff));
await page.locator('#team-bib .team-row', { hasText: 'Equipo Beto' }).locator('[data-assign="none"]').click();
await page.locator('#team-bib .team-row', { hasText: 'Equipo Ciro' }).locator('[data-assign="none"]').click();
await page.waitForFunction(() => document.querySelector('#team-bib-count')?.textContent === '1');
await page.locator('#team-bib .team-row', { hasText: 'Equipo Ana' }).locator('[data-assign="plain"]').click();
await page.waitForSelector('#team-plain:has-text("Equipo Ana")');
check('Otro toque lo pasa a sin pechera', (await page.textContent('#team-plain-count')) === '1' && (await page.textContent('#team-bib-count')) === '0');
let teamsAsk = '';
const onTeamsAsk = (d) => { teamsAsk = d.message(); };
page.on('dialog', onTeamsAsk);
await page.click('#btn-teams-shuffle');
check('Mezclar pide confirmación', teamsAsk === '¿Seguro que querés rearmar los equipos al azar?', teamsAsk);
await page.waitForFunction(() => Number(document.querySelector('#team-bib-count')?.textContent) + Number(document.querySelector('#team-plain-count')?.textContent) === 3);
check('Mezclar reparte a los tres anotados', !(await page.locator('#team-board').innerText()).includes('Equipo Espera'));
const pageTeams = await ctx.newPage();
pageTeams.on('dialog', (d) => d.accept());
await pageTeams.goto(`${BASE}#/partido/${encodeURIComponent(equipos.id)}/equipos`);
await pageTeams.waitForSelector('#team-board');
await page.click('#btn-teams-clear');
check('Reset pide confirmación', teamsAsk === '¿Seguro que querés resetear los equipos?', teamsAsk);
page.off('dialog', onTeamsAsk);
await page.waitForFunction(() => document.querySelector('#team-bib-count')?.textContent === '0' && document.querySelector('#team-plain-count')?.textContent === '0');
await pageTeams.waitForFunction(() => document.querySelector('#team-bib-count')?.textContent === '0' && document.querySelector('#team-plain-count')?.textContent === '0');
check('La otra pestaña ve los equipos al instante', true);
await pageTeams.close();
await page.locator('#team-unassigned .team-row', { hasText: 'Equipo Ana' }).locator('[data-assign="bib"]').click();
await page.waitForSelector('#team-bib:has-text("Equipo Ana")');
await page.locator('#team-unassigned .team-row', { hasText: 'Equipo Beto' }).locator('[data-assign="bib"]').click();
await page.waitForSelector('#team-bib:has-text("Equipo Beto")');
await page.locator('#team-bib .team-row', { hasText: 'Equipo Beto' }).locator('[data-assign="plain"]').click();
await page.waitForSelector('#team-plain:has-text("Equipo Beto")');
await page.locator('#team-unassigned .team-row', { hasText: 'Equipo Ciro' }).locator('[data-assign="bib"]').click();
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
await page.waitForSelector('#list-history .match-card[data-note="Ayer"]');
check('La lista del historial no muestra el marcador', await page.locator('#list-history .match-card[data-note="Ayer"] [data-score]').count() === 0);
await page.click('#list-history .match-card[data-note="Ayer"]');
await page.waitForSelector('#match-date');
check('El detalle no muestra el marcador', await page.locator('#match-score').count() === 0);
await page.waitForSelector('#btn-teams');
await page.click('#btn-teams');
await page.waitForSelector('#score-bib');
check('El marcador se ve solo en Equipos', (await page.textContent('#score-bib')) === '2' && (await page.textContent('#score-plain')) === '1');
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
await page.waitForFunction(() => window.__app?.who);
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card:has-text("Solo anota Gustavo")');
await page.click('.match-card:has-text("Solo anota Gustavo")');
await page.waitForSelector('#btn-teams');
await page.click('#btn-teams');
await page.waitForSelector('#teams-readonly');
check('Quien no puede anotar ve los equipos y no los cambia', (await page.locator('#btn-teams-shuffle').count()) === 0 && (await page.locator('[data-assign]').count()) === 0 && (await page.locator('[data-score]').count()) === 0 && (await page.locator('[data-goal]').count()) === 0 && (await page.locator('[data-arco]').count()) === 0 && (await page.textContent('#score-bib')) === '0' && (await page.locator('#team-bib').innerText()).includes('Lectura Luis'));
await page.locator('#team-bib .team-name', { hasText: 'Lectura Luis' }).click();
await page.waitForSelector('#pm-profile');
check('Quien solo mira abre el mismo menú, sin cargar pago', (await page.locator('#sheet h3').innerText()) === 'Lectura Luis' && await page.locator('#pm-pay').count() === 0 && await page.locator('#menu-pay').count() === 1);
await page.click('#sheet [data-close]');
await page.waitForFunction(() => !document.querySelector('#sheet')?.open);
check('Quien solo mira igual puede compartir por WhatsApp', (await page.getAttribute('#btn-teams-wa', 'href') || '').includes('wa.me/'));
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'gustavo@demo.local');
await page.fill('#login-password', 'demo-gustavo');
await page.click('#login-form button[type=submit]');
await page.waitForFunction(() => window.__app?.who);
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card:has-text("Hoy temprano")');

async function routeShorten(spoo, dagd) {
  await page.route(/https:\/\/spoo\.me\//, spoo);
  await page.route(/https:\/\/da\.gd\//, dagd);
  return async () => {
    await page.unroute(/https:\/\/spoo\.me\//, spoo);
    await page.unroute(/https:\/\/da\.gd\//, dagd);
  };
}
const shortMatchId = await page.evaluate(async () => {
  const who = window.__app.who;
  const id = await window.__app.store.addMatch({ date: '2026-10-23', time: '18:00', note: 'Acortar', capacity: 14 }, who);
  const match = window.__app.matches.find((m) => m.id === id);
  await window.__app.store.addPlayer(match, { name: 'Corto Uno', phone: '5491199990001' }, who);
  return id;
});
let earlyShort = 0;
const countAbort = (route) => { earlyShort += 1; return route.abort(); };
await page.route(/https:\/\/spoo\.me\//, countAbort);
await page.route(/https:\/\/da\.gd\//, countAbort);
await page.evaluate((id) => { location.hash = `#/partido/${id}`; }, shortMatchId);
await page.waitForSelector('#slots .wa-btn[data-short-code]');
await page.waitForTimeout(250);
check('Abrir el partido no llama al acortador', earlyShort === 0, String(earlyShort));
await page.unroute(/https:\/\/spoo\.me\//, countAbort);
await page.unroute(/https:\/\/da\.gd\//, countAbort);

let spooHits = 0;
let spooBody = null;
let off = await routeShorten(async (route) => {
  spooHits += 1;
  spooBody = route.request().postDataJSON();
  await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ short_url: 'https://spoo.me/ZXwB0uF' }) });
}, (route) => route.fulfill({ status: 500, body: 'no' }));
await page.click('#btn-remind');
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('#remind-list .remind-row')].find((el) => el.innerText.includes('Corto Uno'));
  const href = row?.querySelector('a')?.getAttribute('href') || '';
  return decodeURIComponent(href).includes('https://spoo.me/ZXwB0uF');
});
check('spoo.me recibe solo long_url', spooBody && spooBody.long_url.includes('/c/?k=') && !Object.hasOwn(spooBody, 'block_bots') && Object.keys(spooBody).join(',') === 'long_url', JSON.stringify(spooBody));
const cachedShort = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  return Object.values(db.links).find((row) => row.shortUrl === 'https://spoo.me/ZXwB0uF') || null;
});
check('El link guarda shortUrl, shortProvider y shortAt', cachedShort?.shortProvider === 'spoo' && typeof cachedShort?.shortAt === 'number' && !!cachedShort.m && !!cachedShort.t, JSON.stringify(cachedShort));
await page.click('dialog.sheet [data-close]');
await page.click('#btn-remind');
await page.waitForFunction(() => decodeURIComponent([...document.querySelectorAll('#remind-list a')].find((a) => a.closest('.remind-row')?.innerText.includes('Corto Uno'))?.getAttribute('href') || '').includes('https://spoo.me/ZXwB0uF'));
check('El segundo envío no vuelve a llamar a spoo.me', spooHits === 1, String(spooHits));
const [shortPop] = await Promise.all([
  page.waitForEvent('popup'),
  page.locator('#remind-list .remind-row', { hasText: 'Corto Uno' }).locator('a').click(),
]);
await shortPop.waitForURL((url) => /wa\.me|spoo\.me|phone=/.test(String(url)), { waitUntil: 'commit' });
check('Enviar abre WhatsApp con el link de spoo.me', /wa\.me|phone=/.test(shortPop.url()) && decodeURIComponent(shortPop.url()).includes('https://spoo.me/ZXwB0uF'));
await shortPop.close();
await page.click('dialog.sheet [data-close]');
await off();

const [waPop] = await Promise.all([
  page.waitForEvent('popup'),
  page.locator('#slots .slot', { hasText: 'Corto Uno' }).locator('.wa-btn').click(),
]);
await waPop.waitForURL((url) => /wa\.me|spoo\.me|phone=/.test(String(url)), { waitUntil: 'commit' });
check('El botón de WhatsApp abre WhatsApp con spoo.me', /wa\.me|phone=/.test(waPop.url()) && decodeURIComponent(waPop.url()).includes('https://spoo.me/ZXwB0uF') && decodeURIComponent(waPop.url()).includes('¿Confirmás?'));
await waPop.close();

await page.evaluate(async () => {
  const match = window.__app.matches.find((m) => m.note === 'Acortar');
  await window.__app.store.addPlayer(match, { name: 'Corto Dos', phone: '5491199990002' }, window.__app.who);
  await window.__app.store.addPlayer(match, { name: 'Corto Tres', phone: '5491199990003' }, window.__app.who);
  await window.__app.store.addPlayer(match, { name: 'Corto Cuatro', phone: '5491199990004' }, window.__app.who);
});
await page.waitForSelector('#slots .name:text-is("Corto Cuatro")');

let garbageCalls = 0;
off = await routeShorten(async (route) => {
  garbageCalls += 1;
  await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ short_url: 'https://evil.example/phish' }) });
}, async (route) => {
  garbageCalls += 1;
  await route.fulfill({ status: 200, contentType: 'text/plain', body: 'hola no es un link' });
});
await page.click('#btn-remind');
await page.waitForSelector('#remind-list .remind-row:has-text("Corto Dos") a');
for (let i = 0; i < 30 && garbageCalls < 2; i++) await page.waitForTimeout(50);
check('La basura consulta los dos servicios', garbageCalls >= 2, String(garbageCalls));
const garbageHref = decodeURIComponent(await page.locator('#remind-list .remind-row', { hasText: 'Corto Dos' }).locator('a').getAttribute('href'));
check('Una respuesta basura deja el link propio', /\/c\/\?k=[0-9A-Za-z]{8}/.test(garbageHref) && !garbageHref.includes('evil.example') && !garbageHref.includes('spoo.me'));
const garbageStored = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const player = Object.values(db.players).find((p) => p.name === 'Corto Dos');
  return db.links[player.shortCode];
});
check('La basura no se guarda en el link', garbageStored && !garbageStored.shortUrl, JSON.stringify(garbageStored));
await page.click('dialog.sheet [data-close]');
await off();

off = await routeShorten(
  (route) => route.fulfill({ status: 503, contentType: 'text/plain', body: 'down' }),
  (route) => route.abort(),
);
await page.click('#btn-remind');
await page.waitForSelector('#remind-list .remind-row:has-text("Corto Tres") a');
await page.waitForTimeout(300);
const failHref = decodeURIComponent(await page.locator('#remind-list .remind-row', { hasText: 'Corto Tres' }).locator('a').getAttribute('href'));
check('Si los dos servicios fallan queda el link propio', /\/c\/\?k=[0-9A-Za-z]{8}/.test(failHref) && !failHref.includes('spoo.me') && !failHref.includes('da.gd'));
await page.click('dialog.sheet [data-close]');
await off();

off = await routeShorten(async (route) => {
  await new Promise((resolve) => setTimeout(resolve, 4000));
  try { await route.abort(); } catch { /* el fetch ya se abortó a los 3 s */ }
}, (route) => route.fulfill({ status: 200, contentType: 'text/plain', body: 'https://da.gd/jjXrP' }));
await page.click('#btn-remind');
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('#remind-list .remind-row')].find((el) => el.innerText.includes('Corto Cuatro'));
  return decodeURIComponent(row?.querySelector('a')?.getAttribute('href') || '').includes('https://da.gd/jjXrP');
});
check('Si spoo.me no contesta se usa da.gd', true);
const dagdStored = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const player = Object.values(db.players).find((p) => p.name === 'Corto Cuatro');
  return db.links[player.shortCode];
});
check('da.gd queda guardado como dagd', dagdStored?.shortProvider === 'dagd' && dagdStored?.shortUrl === 'https://da.gd/jjXrP');
await page.click('dialog.sheet [data-close]');
await off();
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card:has-text("Hoy temprano")');

await page.evaluate(async () => {
  const who = window.__app.who;
  const id = await window.__app.store.addMatch({ date: '2026-10-11', time: '19:00', note: 'Viejo cancelable', capacity: 14 }, who);
  const match = window.__app.matches.find((m) => m.id === id);
  await window.__app.store.addPlayer(match, { name: 'Cancel Viejo', phone: '5491188887777' }, who);
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  db.matches[id].cancelled = true;
  db.matches[id].notes = 'Se suspendió';
  localStorage.setItem('f7c-demo-db', JSON.stringify(db));
  window.__app.store._emit();
});
await page.evaluate(() => { location.hash = '#/historial'; });
await page.waitForSelector('#list-history .match-card[data-note="Viejo cancelable"]');
await page.click('#list-history .match-card[data-note="Viejo cancelable"]');
await page.waitForSelector('#match-cancelled');
check('Un partido del historial no ofrece Cancelar partido', await page.locator('#btn-cancel-match').count() === 0 && await page.locator('#btn-reactivate-match').count() === 1);
await page.click('#btn-back');
await page.waitForSelector('#list-history .match-card[data-note="Viejo cancelable"]');
check('El historial muestra Cancelado', (await page.textContent('#list-history .match-card[data-note="Viejo cancelable"]')).includes('Cancelado'));
await page.click('#btn-hist-import');
await page.waitForSelector('#hist-imp-text');
const playedText = `Jueves 08/10 21hs\n1. Juan Pérez\n2. Visitante Importado\n\nViernes 09/10 19:30\n1. Ana Sola`;
await page.setInputFiles('#hist-imp-file', { name: 'partidos.txt', mimeType: 'text/plain', buffer: Buffer.from(playedText) });
await page.waitForFunction((expected) => document.querySelector('#hist-imp-text')?.value === expected, playedText);
check('El archivo .txt llena el texto', true);
await page.click('#hist-imp-next');
await page.waitForSelector('#hist-imp-list');
const preview = await page.locator('#hist-imp-list').innerText();
check('La vista previa muestra fecha, sede y jugadores', preview.includes('08/10/2026') && preview.includes('21hs') && preview.includes('09/10/2026') && preview.includes('19:30hs') && preview.includes('Polideportivo Colegiales') && preview.includes('Juan Pérez') && preview.includes('Visitante Importado') && preview.includes('Ana Sola'), preview.slice(0, 220));
await page.click('#hist-imp-save');
await page.waitForSelector('#list-history .match-card[data-date="2026-10-08"]');
check('El historial muestra la fecha con año', (await page.textContent('#list-history .match-card[data-date="2026-10-08"]')).includes('08/10/2026'));
await page.click('#list-history .match-card[data-date="2026-10-08"]');
await page.waitForSelector('#slots .name:text-is("Juan Pérez")');
const imported = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const match = Object.values(db.matches).find((item) => item.date === '2026-10-08' && item.time === '21:00');
  const players = Object.values(db.players).filter((player) => player.matchDate === '2026-10-08');
  const juan = players.find((player) => player.name === 'Juan Pérez');
  const visit = players.find((player) => player.name === 'Visitante Importado');
  const roster = Object.values(db.roster).filter((person) => person.name === 'Visitante Importado');
  return { venue: match?.venueId, juan: !!juan?.rosterId, visitRoster: visit?.rosterId || '', roster: roster.length, waiting: players.some((player) => player.waiting === true) };
});
check('El historial vincula al jugador conocido y crea al otro solo en el partido', imported.venue === 'colegiales' && imported.juan && !imported.visitRoster && imported.roster === 0 && imported.waiting === false, JSON.stringify(imported));
await page.click('#btn-back');
await page.waitForSelector('#btn-hist-import');
await page.click('#btn-hist-import');
await page.fill('#hist-imp-text', 'Jueves 08/10 21hs\n1. Juan Pérez');
await page.click('#hist-imp-next');
await page.waitForSelector('#hist-imp-list .err');
check('Avisa si ya existe ese día, hora y sede', (await page.locator('#hist-imp-list .err').innerText()).includes('Ya hay un partido') && (await page.locator('#hist-imp-save').count()) === 0);
await page.click('#hist-imp-back');
await page.click('dialog.sheet [data-close]');
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card:has-text("Hoy temprano")');

await page.click('#btn-settings');
await page.waitForSelector('#set-sections');
check('Ajustes tiene Sedes y Organizadores aparte de los precios', await page.isVisible('#set-venues') && await page.isVisible('#set-organizers') && await page.isVisible('#price-form'));
check('Ajustes ofrece compartir la app', await page.isVisible('#set-share-app'));
await page.evaluate(() => {
  window.__shares = [];
  navigator.share = (data) => { window.__shares.push(data); return Promise.resolve(); };
});
await page.click('#set-share-app');
await page.waitForFunction(() => window.__shares?.length === 1);
const sharedApp = await page.evaluate(() => window.__shares[0]);
check('Compartir app manda el mensaje y el link', sharedApp.text.includes('Anotate con Mis Partidos') && sharedApp.text.includes('Instalá la app desde acá') && sharedApp.url === 'https://gustavofarg-hash.github.io/futbol-colegiales/' && sharedApp.text.includes(sharedApp.url), sharedApp.url);
await page.evaluate(() => {
  const t = document.querySelector('#toast');
  t.textContent = '';
  t.hidden = true;
  navigator.share = () => Promise.reject(Object.assign(new Error('cancel'), { name: 'AbortError' }));
});
await page.click('#set-share-app');
await page.waitForTimeout(150);
check('Cancelar compartir no avisa error', (await page.locator('#toast').getAttribute('hidden')) !== null || (await page.textContent('#toast')) === '');
await page.evaluate(() => { Object.defineProperty(navigator, 'share', { configurable: true, writable: true, value: undefined }); });
const [sharePopup] = await Promise.all([page.waitForEvent('popup'), page.click('#set-share-app')]);
const shareUrl = sharePopup.url();
await sharePopup.close();
const shareClip = await page.evaluate(() => navigator.clipboard.readText());
check('Sin share se copia el link y se abre WhatsApp', /wa\.me|whatsapp\.com/.test(shareUrl) && decodeURIComponent(shareUrl).includes('gustavofarg-hash.github.io/futbol-colegiales') && shareClip.includes('https://gustavofarg-hash.github.io/futbol-colegiales/'), shareUrl.slice(0, 120));
await page.click('#set-venues');
await page.waitForSelector('#venue-list .name:text-is("Polideportivo Colegiales")');
await page.fill('#venue-form [name=name]', 'Club Norte');
await page.click('#venue-form button[type=submit]');
await page.waitForSelector('#venue-list .name:text-is("Club Norte")');
await page.locator('#venue-list .slot', { hasText: 'Club Norte' }).locator('[data-venue-edit]').click();
await page.fill('#venue-edit [name=name]', 'Club Norte Sur');
await page.click('#venue-edit button[type=submit]');
await page.waitForSelector('#venue-list .name:text-is("Club Norte Sur")');
check('Se puede renombrar una sede', true);
await page.click('#venues-back');
await page.waitForSelector('#set-sections');
await page.click('dialog.sheet [data-close]');
await page.waitForFunction(() => document.querySelectorAll('dialog.sheet[open]').length === 0);
await page.click('#btn-add-match');
await page.selectOption('#match-venue', { label: 'Club Norte Sur' });
await page.selectOption('#match-per-team', '6');
await page.fill('#match-form [name=court]', '3');
await page.fill('#match-form [name=price]', '8.000');
await page.fill('#match-form [name=date]', '2026-11-08');
await page.fill('#match-form [name=time]', '19:30');
await page.click('#match-form button[type=submit]');
await page.waitForSelector('.match-card[data-date="2026-11-08"]');
const norteCard = (await page.locator('.match-card[data-date="2026-11-08"]').innerText()).replace(/\s+/g, ' ');
check('La tarjeta muestra la sede y el cupo de 6 por equipo', norteCard.includes('Club Norte Sur') && /0\/12/.test(norteCard), norteCard);
await page.click('.match-card[data-date="2026-11-08"]');
await page.waitForFunction(() => document.querySelector('#match-date')?.textContent?.trim() === '08/11/2026');
const norteDetail = {
  date: (await page.textContent('#match-date'))?.trim(),
  when: await page.textContent('#match-when'),
  place: await page.textContent('#match-place'),
  slots: await page.textContent('#slot-count'),
  size: await page.locator('#match-size').count(),
  court: (await page.textContent('#match-court'))?.trim(),
  price: await page.textContent('#match-price'),
};
check('El detalle usa la sede y Faltan 12', norteDetail.date === '08/11/2026' && (norteDetail.when || '').includes('19:30hs ($8.000)') && (norteDetail.place || '').includes('Club Norte Sur (F6)') && norteDetail.slots === '0/12' && norteDetail.size === 0 && norteDetail.court === 'Cancha 3' && (norteDetail.price || '').includes('$8.000'));
await page.click('#btn-copy');
const norteCopy = await page.evaluate(() => navigator.clipboard.readText());
check('La lista copiada nombra la sede', norteCopy.includes('Club Norte Sur') && norteCopy.includes('Faltan 12') && norteCopy.includes('⚽ Fútbol 6') && norteCopy.includes('Cancha 3'), norteCopy.split('\n').slice(0, 4).join(' | '));
await page.click('#btn-edit-match');
await page.waitForSelector('#match-venue');
check('Editar partido conserva la sede y los 6', (await page.locator('#match-venue option:checked').innerText()).trim() === 'Club Norte Sur' && await page.inputValue('#match-per-team') === '6' && await page.inputValue('#match-court-input') === '3' && await page.inputValue('#match-price-input') === '8000');
await page.click('#match-form [data-close]');
await page.click('#btn-settings');
await page.click('#set-venues');
await page.locator('#venue-list .slot', { hasText: 'Club Norte Sur' }).locator('[data-venue-active]').click();
await page.waitForFunction(() => {
  const row = [...document.querySelectorAll('#venue-list .slot')].find((el) => el.innerText.includes('Club Norte Sur'));
  return row && row.innerText.includes('Inactiva');
});
await page.click('#venues-back');
await page.waitForSelector('#set-sections');
await page.click('dialog.sheet [data-close]');
await page.waitForFunction(() => document.querySelectorAll('dialog.sheet[open]').length === 0);
await page.click('#btn-back');
await page.waitForSelector('#btn-add-match');
await page.click('#btn-add-match');
check('Una sede inactiva no sale en un partido nuevo', await page.locator('#match-venue option', { hasText: 'Club Norte Sur' }).count() === 0);
await page.click('#match-form [data-close]');
await page.click('.match-card[data-date="2026-11-08"]');
await page.waitForSelector('.when');
check('El partido que ya la usa sigue mostrando el nombre nuevo', (await page.textContent('#match-place')).includes('Club Norte Sur'));
await page.click('#btn-back');
await page.waitForSelector('#list-next');

// Alta rápida, sin duplicar, y amigos del jugador
await page.click('#btn-add-match');
await page.fill('#match-form [name=date]', '2026-10-25');
await page.fill('#match-form [name=time]', '19:00');
await page.fill('#match-form [name=note]', 'Amigos');
await page.selectOption('#match-per-team', '5');
await page.click('#match-form button[type=submit]');
await page.waitForSelector('.match-card:has-text("Amigos")');
await page.click('.match-card:has-text("Amigos")');
await page.waitForSelector('#btn-add-player');
await page.click('#btn-add-player');
await page.waitForSelector('#roster-find');
check('Sin texto, el + no está', await page.locator('#roster-add-new').isHidden());
await page.fill('#roster-find', 'ERN');
await page.waitForSelector('#roster-hits .roster-hit');
check('Con coincidencias, el + no está', await page.locator('#roster-add-new').isHidden() && (await page.locator('#roster-hits .roster-hit').count()) > 0);
await page.fill('#roster-find', '  zzz nuevo  ');
await page.waitForFunction(() => {
  const btn = document.querySelector('#roster-add-new');
  return btn && !btn.hidden && document.querySelectorAll('#roster-hits .roster-hit').length === 0;
});
check('Sin coincidencias, el botón es Agregar como nuevo', await page.getAttribute('#roster-add-new', 'aria-label') === 'Agregar como nuevo');
await page.click('#roster-add-new');
check('El + copia el texto recortado y enfoca Nombre', (await page.inputValue('#player-name')) === 'zzz nuevo' && await page.evaluate(() => document.activeElement?.id === 'player-name'));
await page.click('#friend-plus');
await page.click('#friend-plus');
await page.locator('#friend-rows input').nth(1).fill('Pedro Tipo');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#slots .name:text-is("Pedro Tipo")');
let mainNames = await page.$$eval('#slots [data-player] .name', (els) => els.map((el) => el.textContent));
check('Los amigos quedan justo después', mainNames[0] === 'zzz nuevo' && mainNames[1] === 'Invitado 1' && mainNames[2] === 'Pedro Tipo', mainNames.slice(0, 3).join(' | '));
check('Se ve de quién es el amigo', (await page.locator('#slots .slot', { has: page.locator('.name:text-is("Invitado 1")') }).locator('.friend-tag').innerText()).includes('invitado de zzz nuevo'));
check('El nombre escrito también es amigo', (await page.locator('#slots .slot', { has: page.locator('.name:text-is("Pedro Tipo")') }).locator('.friend-tag').innerText()).includes('invitado de zzz nuevo'));
await page.click('#btn-add-player');
await page.fill('#player-name', 'ZZZ Nuevo');
await page.click('#player-form button[type=submit]');
check('Ese nombre ya está en el partido', (await page.textContent('#pf-err')).includes('Ya está anotado en este partido'));
await page.fill('#roster-find', 'zzz');
await page.waitForSelector('#roster-hits .roster-hit.taken');
check('En guardados figura Ya anotado', (await page.locator('#roster-hits small.taken').innerText()).includes('Ya anotado') && await page.locator('#roster-hits .roster-hit').first().isDisabled());
await page.click('#player-form [data-close]');
await page.click('#btn-add-player');
await page.fill('#player-name', 'Segundo');
await page.click('#friend-plus');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#slots .name:text-is("Segundo")');
const amigoTags = await page.locator('#slots .slot', { has: page.locator('.name:text-is("Invitado 1")') }).locator('.friend-tag').allInnerTexts();
check('Invitado 1 de otro no se bloquea', amigoTags.some((text) => text.includes('zzz nuevo')) && amigoTags.some((text) => text.includes('Segundo')), amigoTags.join(' | '));
await page.click('#btn-add-player');
await page.fill('#player-name', 'Después');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#slots .name:text-is("Después")');
await page.locator('#slots .slot', { has: page.locator('.name:text-is("zzz nuevo")') }).locator('[data-menu]').click();
await page.click('#pm-friend');
await page.waitForSelector('#friend-form');
check('Más tarde sigue Invitado 2', (await page.textContent('#friend-form')).includes('Invitado 2'));
await page.click('#friend-form button[type=submit]');
await page.waitForSelector('#slots .name:text-is("Invitado 2")');
mainNames = await page.$$eval('#slots [data-player] .name', (els) => els.map((el) => el.textContent));
check('El amigo nuevo no se va al final', mainNames.indexOf('Invitado 2') === mainNames.indexOf('zzz nuevo') + 3 && mainNames.indexOf('Invitado 2') < mainNames.indexOf('Después'), mainNames.join(' | '));

await page.evaluate(async () => {
  const id = await window.__app.store.addMatch({ date: '2026-10-24', time: '11:00', note: 'Cupo amigos', perTeam: 5 }, window.__app.who);
  const match = { id, date: '2026-10-24', capacity: 10 };
  for (let i = 1; i <= 9; i++) await window.__app.store.addPlayer(match, { name: `Relleno ${i}` }, window.__app.who);
});
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card:has-text("Cupo amigos")');
await page.click('.match-card:has-text("Cupo amigos")');
await page.waitForFunction(() => document.querySelector('#slot-count')?.textContent === '9/10');
const cupoWarnings = [];
const grabCupo = (dialog) => { if (/lista de espera/.test(dialog.message())) cupoWarnings.push(dialog.message()); };
page.on('dialog', grabCupo);
await page.click('#btn-add-player');
await page.fill('#player-name', 'Casi Lleno');
await page.click('#friend-plus');
await page.click('#friend-plus');
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#wait-list .name:text-is("Invitado 2")');
check('Avisa los lugares que faltan', cupoWarnings[0] === 'Queda 1 lugar: 2 van a quedar en lista de espera', cupoWarnings.join(' | '));
check('Entra primero quien invita', await page.locator('#slots .name:text-is("Casi Lleno")').count() === 1 && await page.locator('#slots .name:text-is("Invitado 1")').count() === 0);
const waitTags = await page.locator('#wait-list .friend-tag').allInnerTexts();
check('En la espera también son amigos', waitTags.length === 2 && waitTags.every((text) => text.includes('invitado de Casi Lleno')), waitTags.join(' | '));
await page.locator('#slots .slot', { hasText: 'Relleno 1' }).locator('[data-menu]').click();
await page.click('#pm-del');
await page.waitForFunction(() => {
  const names = [...document.querySelectorAll('#slots .name')].map((el) => el.textContent);
  return names.indexOf('Invitado 1') === names.indexOf('Casi Lleno') + 1;
});
check('Al subir queda detrás de quien invita', true);
check('Sigue el cartel de amigo', (await page.locator('#slots .slot', { has: page.locator('.name:text-is("Invitado 1")') }).locator('.friend-tag').innerText()).includes('invitado de Casi Lleno'));
check('El otro amigo sigue en espera', await page.locator('#wait-list .name:text-is("Invitado 2")').count() === 1);
await page.locator('#slots .slot', { has: page.locator('.name:text-is("Invitado 1")') }).locator('[data-pay]').click();
await page.waitForSelector('#pay-form');
check('El pago es de ese amigo', (await page.locator('#pay-form').innerText()).includes('Invitado 1'));
await page.click('#pay-form [data-close]');
await page.waitForFunction(() => document.querySelectorAll('dialog.sheet[open]').length === 0);

await page.evaluate(() => { location.hash = '#/'; });
const amigosCard = page.locator('.match-card', { has: page.locator('.match-note', { hasText: /^Amigos$/ }) });
await amigosCard.waitFor();
await amigosCard.click();
await page.waitForSelector('#slots .name:text-is("zzz nuevo")');
const amigoDeZzz = page.locator('#slots .slot', { has: page.locator('.name:text-is("Invitado 1")') }).filter({ hasText: 'invitado de zzz nuevo' });
await amigoDeZzz.locator('[data-menu]').click();
check('Un invitado no tiene Agregar invitado', await page.locator('#pm-friend').count() === 0);
const guestInvite = await page.evaluate(async () => {
  const app = window.__app;
  const guest = app.players.find((player) => player.name === 'Invitado 1' && player.invitedBy);
  const match = app.matches.find((item) => item.id === guest.matchId);
  try {
    await app.store.addPlayer(match, { name: 'No va', invitedBy: guest.id, invitedByName: guest.name, guestAuto: true }, app.who);
    return '';
  } catch (error) {
    return error?.message || '';
  }
});
check('Si se intenta igual, avisa que un invitado no puede', guestInvite === 'Un invitado no puede agregar invitados.', guestInvite);
await page.click('#pm-edit');
await page.waitForSelector('#player-form');
check('Editar invitado deja el vínculo y el WhatsApp privado', (await page.locator('#player-form h3').innerText()) === 'Editar invitado' && (await page.locator('#friend-stays').innerText()).includes('invitado de zzz nuevo') && !(await page.isChecked('#wa-share')) && !(await page.isChecked('#save-roster')));
await page.fill('#player-name', 'zzz nuevo');
await page.click('#player-form button[type=submit]');
check('No se puede renombrar al amigo como alguien que ya está', (await page.textContent('#pf-err')).includes('Ya está anotado en este partido'));
await page.fill('#player-name', 'Pedro Real');
await page.fill('#player-form [name=phone]', '11 5555-0181');
await page.check('#save-roster');
await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/editar-amigo.png' });
await page.click('#player-form button[type=submit]');
await page.waitForSelector('#slots .name:text-is("Pedro Real")');
check('El amigo pasa a llamarse Pedro y sigue de zzz nuevo', (await page.locator('#slots .slot', { has: page.locator('.name:text-is("Pedro Real")') }).locator('.friend-tag').innerText()).includes('invitado de zzz nuevo'));
check('Invitado 2 no se renumera', await page.locator('#slots .name:text-is("Invitado 2")').count() === 1 && await page.locator('#slots .name:text-is("Invitado 1")').count() === 1);
const amigoGuardado = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const player = Object.values(db.players).find((row) => row.name === 'Pedro Real');
  const id = Object.entries(db.players).find(([, row]) => row.name === 'Pedro Real')?.[0];
  const contact = db.contacts?.players?.[id];
  const roster = Object.values(db.roster || {}).find((row) => row.name === 'Pedro Real');
  return {
    invitedByName: player?.invitedByName,
    guestAuto: player?.guestAuto,
    addedBy: player?.addedBy,
    visible: contact?.visibleToAll,
    phone: contact?.phone,
    roster: roster?.name || '',
  };
});
check('El WhatsApp queda privado y se puede guardar en Jugadores', amigoGuardado.visible === false && amigoGuardado.phone === '5491155550181' && amigoGuardado.roster === 'Pedro Real' && amigoGuardado.guestAuto === false && amigoGuardado.addedBy === 'Gustavo' && amigoGuardado.invitedByName === 'zzz nuevo', JSON.stringify(amigoGuardado));
await page.locator('#slots .slot', { has: page.locator('.name:text-is("zzz nuevo")') }).locator('[data-menu]').click();
await page.click('#pm-friend');
await page.waitForSelector('#friend-form');
check('El próximo vacío sigue en Invitado 3', (await page.textContent('#friend-form')).includes('Invitado 3'));
await page.click('#friend-form button[type=submit]');
await page.waitForSelector('#slots .name:text-is("Invitado 3")');
check('Invitado 2 sigue igual después del nuevo', await page.locator('#slots .name:text-is("Invitado 2")').count() === 1 && await page.locator('#slots .name:text-is("Invitado 3")').count() === 1);
await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const entries = Object.entries(db.players);
  const host = entries.find(([, player]) => player.name === 'zzz nuevo');
  const guest = entries.find(([, player]) => player.invitedBy === host[0]);
  const copy = { ...guest[1], name: 'Nieto', invitedBy: guest[0], invitedByName: guest[1].name, guestAuto: false, rosterAt: Date.now(), createdAt: Date.now(), confirmToken: 'nieto-demo-token' };
  delete copy.shortCode;
  db.players['nieto-demo'] = copy;
  localStorage.setItem('f7c-demo-db', JSON.stringify(db));
  window.__app.store._emit();
});
await page.waitForSelector('#slots .name:text-is("Nieto")');
const nietoSlot = page.locator('#slots .slot', { has: page.locator('.name:text-is("Nieto")') });
check('Un invitado de un invitado se ve con el jugador principal', (await nietoSlot.locator('.friend-tag').innerText()).includes('invitado de zzz nuevo'));
const inviteColor = await page.evaluate(() => {
  const slot = (name) => [...document.querySelectorAll('#slots .slot')].find((el) => el.querySelector('.name')?.textContent === name);
  const host = slot('zzz nuevo')?.className || '';
  const guest = slot('Nieto')?.className || '';
  const tone = (value) => (value.match(/invite-\d/) || [])[0] || '';
  return { host: host.includes('host-row'), guest: guest.includes('guest-row'), same: tone(host) && tone(host) === tone(guest) };
});
check('Comparte el color de quien invita de verdad', inviteColor.host && inviteColor.guest && inviteColor.same, JSON.stringify(inviteColor));
const nietoAt = (await page.$$eval('#slots [data-player] .name', (els) => els.map((el) => el.textContent)));
check('Queda en el grupo del principal, no al final', nietoAt.indexOf('Nieto') > nietoAt.indexOf('zzz nuevo') && nietoAt.indexOf('Nieto') < nietoAt.indexOf('Segundo'), nietoAt.join(' | '));
await nietoSlot.locator('[data-menu]').click();
check('Ese anidado tampoco puede agregar invitados', await page.locator('#pm-friend').count() === 0);
await page.click('dialog.sheet [data-close]');
await page.evaluate(async () => { await window.__app.store.deletePlayer('nieto-demo'); });
await page.waitForFunction(() => !document.body.innerText.includes('Nieto'));
await page.screenshot({ path: '/opt/cursor/artifacts/screenshots/amigo-con-nombre.png' });
const apodo = await page.evaluate(async () => {
  const who = window.__app.who;
  const rosterId = await window.__app.store.addRoster({ name: 'Ernesto Apodo', shortName: 'Tito', phone: '' }, who);
  const id = await window.__app.store.addMatch({ date: '2026-10-29', time: '20:00', note: 'Con apodo', capacity: 14 }, who);
  const match = window.__app.matches.find((item) => item.id === id);
  await window.__app.store.addPlayer(match, { name: 'Ernesto Apodo', rosterId, shortName: 'Tito', phone: '' }, who);
  return { rosterId, id };
});
await page.evaluate((id) => { location.hash = `#/partido/${encodeURIComponent(id)}`; }, apodo.id);
await page.waitForSelector('#slots .name:text-is("Tito")');
check('La lista del partido muestra el apodo', await page.locator('#slots .name:text-is("Ernesto Apodo")').count() === 0);
await page.locator('#slots .who', { hasText: 'Tito' }).click();
await page.waitForSelector('#profile h2.section');
check('El perfil conserva el nombre completo', (await page.textContent('#profile h2.section')).trim() === 'Ernesto Apodo' && (await page.textContent('#profile-nick')).includes('Tito'));
await page.evaluate((id) => { location.hash = `#/partido/${encodeURIComponent(id)}/equipos`; }, apodo.id);
await page.waitForSelector('#team-unassigned');
check('Equipos muestra el apodo', (await page.locator('#team-unassigned').innerText()).includes('Tito') && !(await page.locator('#team-board').innerText()).includes('Ernesto Apodo'));
await page.evaluate(() => { location.hash = '#/jugadores'; });
await page.waitForSelector('#roster-q');
await page.fill('#roster-q', 'tito');
await page.waitForSelector('#roster-list .name:text-is("Ernesto Apodo")');
check('La búsqueda de Jugadores encuentra el apodo', true);
await page.locator('#roster-list .slot', { hasText: 'Ernesto Apodo' }).locator('[data-roster-edit]').click();
await page.waitForSelector('#roster-form [name=shortName]');
check('El formulario tiene el nombre corto', (await page.inputValue('#roster-form [name=shortName]')) === 'Tito');
await page.fill('#roster-form [name=shortName]', 'Tito E');
await page.click('#roster-form button[type=submit]');
await page.waitForFunction(() => !document.querySelector('dialog.sheet[open]'));
await page.evaluate((id) => { location.hash = `#/partido/${encodeURIComponent(id)}`; }, apodo.id);
await page.waitForSelector('#slots .name:text-is("Tito E")');
check('Guardar el apodo actualiza el partido', true);
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'martin@demo.local');
await page.fill('#login-password', 'demo-martin');
await page.click('#login-form button[type=submit]');
await page.waitForFunction(() => window.__app?.who === 'Martín');
await page.evaluate(() => { location.hash = '#/'; });
const amigosOtraCuenta = page.locator('.match-card', { has: page.locator('.match-note', { hasText: /^Amigos$/ }) });
await amigosOtraCuenta.waitFor();
await amigosOtraCuenta.click();
await page.waitForSelector('#slots .name:text-is("Pedro Real")');
const pedroPrivado = (await page.locator('#slots .slot', { has: page.locator('.name:text-is("Pedro Real")') }).innerText()).replace(/\s+/g, ' ');
check('Otro organizador no ve el WhatsApp del amigo', !pedroPrivado.includes('5555') && pedroPrivado.includes('El WhatsApp de este jugador es privado'), pedroPrivado);
await page.locator('#slots .slot', { has: page.locator('.name:text-is("Pedro Real")') }).locator('[data-menu]').click();
check('Solo lo edita quien lo agregó', await page.isDisabled('#pm-edit') && (await page.locator('#edit-lock').innerText()).replace(/\s+/g, ' ').trim() === 'Solo lo puede editar el organizador que lo agregó');
await page.click('dialog.sheet [data-close]');
await page.click('#btn-settings');
await page.click('#set-logout');
await page.waitForSelector('#login-form');
await page.fill('#login-email', 'gustavo@demo.local');
await page.fill('#login-password', 'demo-gustavo');
await page.click('#login-form button[type=submit]');
await page.waitForFunction(() => window.__app?.who === 'Gustavo');
await page.evaluate(() => { location.hash = '#/'; });
const amigosDeNuevo = page.locator('.match-card', { has: page.locator('.match-note', { hasText: /^Amigos$/ }) });
await amigosDeNuevo.waitFor();
await amigosDeNuevo.click();
await page.waitForSelector('#slots .name:text-is("Pedro Real")');
await page.evaluate(() => {
  localStorage.setItem('f7c-text-size', '4');
  document.documentElement.style.fontSize = '24px';
  document.documentElement.dataset.textSize = 'enorme';
});
await page.setViewportSize({ width: 360, height: 740 });
await page.click('#btn-add-player');
await page.fill('#roster-find', 'nadieconestenombre');
await page.waitForSelector('#roster-add-new:not([hidden])');
await page.click('#friend-plus');
const hugeForm = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  plus: !!document.querySelector('#roster-add-new') && !document.querySelector('#roster-add-new').hidden,
  row: document.querySelector('.friend-row')?.getBoundingClientRect().width || 0,
  sheet: document.querySelector('.sheet-body')?.getBoundingClientRect().width || 0,
}));
check('Enorme a 360: el + y el amigo entran en la hoja', hugeForm.overflow <= 1 && hugeForm.plus && hugeForm.row > 0 && hugeForm.row <= hugeForm.sheet + 1, JSON.stringify(hugeForm));
await page.click('#player-form [data-close]');
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => {
  localStorage.setItem('f7c-text-size', '1');
  document.documentElement.style.fontSize = '18px';
  document.documentElement.dataset.textSize = 'normal';
  window.__confirms = [];
  window.confirm = (msg) => {
    window.__confirms.push(msg);
    return !String(msg).includes('sus invitados');
  };
});
await page.locator('#slots .slot', { has: page.locator('.name:text-is("zzz nuevo")') }).locator('[data-menu]').click();
await page.click('#pm-del');
await page.waitForFunction(() => ![...document.querySelectorAll('#slots .name')].some((el) => el.textContent === 'zzz nuevo'));
check('Pregunta si quitar a los amigos', await page.evaluate(() => window.__confirms.some((msg) => msg.includes('sus invitados'))));
check('Si no, los amigos siguen con el nombre', (await page.locator('#slots .friend-tag', { hasText: 'invitado de zzz nuevo' }).count()) >= 2);
await page.evaluate(() => {
  window.confirm = (msg) => {
    window.__confirms.push(msg);
    return true;
  };
});
await page.locator('#slots .slot', { has: page.locator('.name:text-is("Segundo")') }).locator('[data-menu]').click();
await page.click('#pm-del');
await page.waitForFunction(() => ![...document.querySelectorAll('.friend-tag')].some((el) => el.textContent.includes('Segundo')));
check('Si sí, los amigos también salen', await page.locator('#slots .name:text-is("Segundo")').count() === 0);
await page.evaluate(() => { delete window.confirm; });
await page.locator('#slots .slot', { has: page.locator('.name:text-is("Después")') }).locator('[data-menu]').click();
check('El menú ofrece bajar a la espera', await page.locator('#pm-wait').innerText() === 'Bajar a lista de espera');
await page.click('#pm-wait');
await page.waitForSelector('#wait-list .name:text-is("Después")');
check('Bajar a la espera lo deja al final y no sube a nadie', await page.locator('#slots .name:text-is("Después")').count() === 0 && await page.locator('#wait-list .name:text-is("Después")').count() === 1);
await page.evaluate(() => localStorage.setItem('f7c-text-size', '1'));
await page.setViewportSize({ width: 390, height: 844 });
await page.reload();
await page.waitForFunction(() => window.__app?.who);
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card');

// PWA
const manifest = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
check('Manifest válido con íconos 192/512 + maskable', manifest.icons.length === 3 && manifest.display === 'standalone' && manifest.name === 'Mis Partidos' && manifest.short_name === 'Mis Partidos');
const sw = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
check('Service worker activo', sw);
for (const ic of manifest.icons) {
  const st = await page.evaluate(async (u) => (await fetch(u)).status, ic.src);
  check(`Ícono ${ic.src} accesible`, st === 200);
}

check('A− y A+ están en el encabezado', await page.isVisible('#btn-text-smaller') && await page.isVisible('#btn-text-bigger'));
await page.click('#btn-text-bigger');
check('A+ pasa a Grande y se guarda en el teléfono', await page.evaluate(() => getComputedStyle(document.documentElement).fontSize === '20px' && localStorage.getItem('f7c-text-size') === '20'));
await page.click('#btn-settings');
await page.waitForSelector('#set-text-size');
const sizeOptions = await page.locator('#set-text-size option').allTextContents();
const sizeValue = await page.locator('#set-text-size').inputValue();
check('Ajustes elige el tamaño en una lista', sizeOptions.join('|') === '8 px|10 px|12 px|14 px|16 px|18 px (normal)|20 px|22 px|24 px' && sizeValue === '6' && await page.locator('dialog.sheet [data-text-size], dialog.sheet .text-size-choice').count() === 0 && await page.locator('#btn-text-smaller').count() === 1, `${sizeOptions.join('|')} valor=${sizeValue}`);
await page.selectOption('#set-text-size', '8');
check('En Ajustes, 24 px agranda al instante', await page.evaluate(() => getComputedStyle(document.documentElement).fontSize === '24px' && localStorage.getItem('f7c-text-size') === '24' && document.querySelector('#set-text-size').value === '8'));
check('A+ queda deshabilitado en 24 px', await page.locator('#btn-text-bigger').isDisabled());
await page.click('dialog.sheet [data-close]');
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('.match-card');
await page.setViewportSize({ width: 360, height: 740 });
const overflowHome = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('Enorme en un teléfono de 360px no desborda el inicio', overflowHome <= 1, String(overflowHome));
await page.click('.match-card[data-date="2026-10-26"]');
await page.waitForSelector('#match-cancelled');
const overflowCancelled = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('Enorme en 360px no desborda un partido cancelado', overflowCancelled <= 1, String(overflowCancelled));
await page.click('#btn-back');
await page.waitForSelector('#list-next');
await page.evaluate(() => { location.hash = '#/historial'; });
await page.waitForSelector('#list-history');
const overflowHistory = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('Enorme en 360px no desborda el historial', overflowHistory <= 1, String(overflowHistory));
await page.click('#list-history .match-card[data-note="Viejo cancelable"]');
await page.waitForSelector('#btn-reactivate-match');
check('En el historial se leen las notas', (await page.textContent('#match-notes')).includes('Se suspendió'));
await page.click('#btn-reactivate-match');
await page.waitForFunction(() => !document.querySelector('#match-cancelled') && !document.querySelector('#btn-cancel-match'));
check('Reactivar conserva las notas', (await page.textContent('#match-notes')).includes('Se suspendió'));
check('Después de reactivar, un partido jugado sigue sin Cancelar', await page.locator('#btn-cancel-match').count() === 0);
await page.click('#btn-back');
await page.waitForSelector('#list-history');
check('Al reactivar sale el badge del historial', !(await page.textContent('#list-history .match-card[data-note="Viejo cancelable"]')).includes('Cancelado'));
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('#list-next .match-card');
await page.click('#list-next .match-card[data-date="2026-10-22"]');
await page.waitForSelector('#btn-add-player');
const overflowMatch = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('Enorme en 360px no desborda el partido', overflowMatch <= 1, String(overflowMatch));
const hugeBars = await page.evaluate(() => {
  const tabs = document.querySelector('#tabbar').getBoundingClientRect();
  const bar = document.querySelector('.actionbar').getBoundingClientRect();
  const add = document.querySelector('#btn-add-player').getBoundingClientRect();
  return {
    apart: bar.top >= tabs.bottom + 4,
    addVisible: add.top >= bar.top - 1 && add.bottom <= window.innerHeight + 1 && add.height >= 32,
    tabsVisible: tabs.top >= 0 && tabs.bottom <= window.innerHeight && tabs.width <= window.innerWidth + 1,
  };
});
check('Con letra Enorme las pestañas no tapan agregar jugador', hugeBars.apart && hugeBars.addVisible && hugeBars.tabsVisible, JSON.stringify(hugeBars));
await page.click('#btn-teams');
await page.waitForSelector('#team-board');
const overflowTeams = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('Enorme en 360px no desborda los equipos', overflowTeams <= 1, String(overflowTeams));
await page.click('#btn-back');
await page.waitForSelector('.pay-btn');
await page.click('.pay-btn');
await page.waitForSelector('#pay-form');
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
const paySheet = await page.evaluate(() => {
  const tabs = document.querySelector('#tabbar').getBoundingClientRect();
  const body = document.querySelector('.sheet-body').getBoundingClientRect();
  return body.top >= tabs.bottom - 1 && tabs.bottom <= window.innerHeight && body.bottom <= window.innerHeight + 1;
});
check('Con letra Enorme la hoja de pago queda debajo de las pestañas', paySheet);
await page.click('#pay-form [data-close]');
const confirmSize = await ctx.newPage();
await confirmSize.setViewportSize({ width: 360, height: 740 });
await confirmSize.goto(`${BASE}confirmar.html?m=x&p=y&t=token-corto`);
await confirmSize.waitForSelector('#btn-text-smaller');
check('confirmar.html usa el tamaño guardado', await confirmSize.evaluate(() => getComputedStyle(document.documentElement).fontSize) === '24px');
const overflowConfirm = await confirmSize.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('confirmar.html en 360px no desborda', overflowConfirm <= 1, String(overflowConfirm));
await confirmSize.close();

await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(() => localStorage.setItem('f7c-text-size', '0'));
await page.reload();
await page.waitForFunction(() => window.__app?.who && getComputedStyle(document.documentElement).fontSize === '16px');
check('Un ajuste viejo de Chica sigue en 16px', (await page.evaluate(() => localStorage.getItem('f7c-text-size'))) === '0');
for (let step = 0; step < 4; step += 1) await page.click('#btn-text-smaller');
check('A− baja cuatro pasos más, hasta 8px', await page.evaluate(() => getComputedStyle(document.documentElement).fontSize === '8px' && localStorage.getItem('f7c-text-size') === '8') && await page.locator('#btn-text-smaller').isDisabled() && !(await page.locator('#btn-text-bigger').isDisabled()));
await page.setViewportSize({ width: 360, height: 740 });
await page.evaluate(() => { location.hash = '#/'; });
await page.waitForSelector('#btn-add-match');
const overflowMin = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const minBars = await page.evaluate(() => {
  const tabs = document.querySelector('#tabbar').getBoundingClientRect();
  const smaller = document.querySelector('#btn-text-smaller').getBoundingClientRect();
  const settings = document.querySelector('#btn-settings').getBoundingClientRect();
  return {
    tabs: tabs.top >= 0 && tabs.bottom <= window.innerHeight && tabs.width <= window.innerWidth + 1 && smaller.width >= 32 && settings.width >= 32,
  };
});
check('Mínima en 360px no desborda y los controles siguen', overflowMin <= 1 && minBars.tabs, JSON.stringify({ overflowMin, minBars }));
await page.reload();
await page.waitForFunction(() => getComputedStyle(document.documentElement).fontSize === '8px');
check('El mínimo de 8px queda guardado', (await page.evaluate(() => localStorage.getItem('f7c-text-size'))) === '8');
await page.evaluate(() => localStorage.setItem('f7c-text-size', '18'));
await page.setViewportSize({ width: 390, height: 844 });

const debtPerson = await page.evaluate(async () => {
  const who = window.__app.who;
  const store = window.__app.store;
  const pastId = await store.addMatch({ date: '2026-10-18', time: '20:00', price: 5000, perTeam: 7 }, who);
  const nextId = await store.addMatch({ date: '2026-11-02', time: '21:00', price: 8000, perTeam: 7 }, who);
  const cancelId = await store.addMatch({ date: '2026-11-05', time: '19:00', price: 5000, perTeam: 7 }, who);
  const freeId = await store.addMatch({ date: '2026-11-04', time: '21:00', price: 5000, perTeam: 7 }, who);
  await store.updateMatch(cancelId, { cancelled: true }, who);
  const rosterId = await store.addRoster({ name: 'Deuda Díaz', phone: '5491100001111', phoneShared: true }, who);
  const fields = { name: 'Deuda Díaz', phone: '5491100001111', rosterId };
  const past = window.__app.matches.find((m) => m.id === pastId);
  const next = window.__app.matches.find((m) => m.id === nextId);
  const cancelled = window.__app.matches.find((m) => m.id === cancelId);
  const freeMatch = window.__app.matches.find((m) => m.id === freeId);
  const shortId = await store.addPlayer(past, fields, who);
  await store.addPlayer(next, fields, who);
  await store.addPlayer(cancelled, fields, who);
  const freePlayer = await store.addPlayer(freeMatch, fields, who);
  await store.setPayment(shortId, { paid: true, split: true, freePlay: false, cash: 2000, transfer: 0, pendingTransfer: 1500, cashTo: who, pendingTo: who }, who);
  await store.setPayment(freePlayer, { freePlay: true, paid: true, split: true }, who);
  return rosterId;
});
await page.evaluate((id) => { location.hash = `#/jugador/${encodeURIComponent(id)}`; }, debtPerson);
await page.waitForSelector('#debt-total');
const debtText = (await page.locator('#debt').innerText()).replace(/\s+/g, ' ');
const debtColor = await page.$eval('#debt-total', (el) => getComputedStyle(el).color);
check('El perfil muestra lo que debe, en rojo', debtText.includes('Debe en total: $11.000') && debtText.includes('18/10/2026 · 20hs · $3.000') && debtText.includes('02/11/2026 · 21hs · $8.000') && !debtText.includes('05/11/2026') && !debtText.includes('04/11/2026') && (debtColor === 'rgb(198, 40, 40)' || debtColor === 'rgb(255, 107, 107)'), `${debtText} ${debtColor}`);

await page.evaluate(() => { location.hash = '#/'; });
await page.click('#btn-settings');
await page.waitForSelector('#set-backup');
await page.click('#set-backup');
await page.waitForSelector('#backup-download');
check('Hacer backup ofrece el celular y Drive', (await page.locator('#backup-download').innerText()) === 'Guardar en el celular' && (await page.locator('#backup-drive').innerText()) === 'Guardar en Google Drive');
const [backupDownload] = await Promise.all([
  page.waitForEvent('download'),
  page.click('#backup-download'),
]);
const backupName = backupDownload.suggestedFilename();
check('El archivo de backup lleva la fecha local', /^Mis_partidos_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.json$/.test(backupName), backupName);
const { readFileSync } = await import('node:fs');
const backupJson = JSON.parse(readFileSync(await backupDownload.path(), 'utf8'));
check('El backup descargado es de Mis Partidos', backupJson.format === 'mis-partidos-backup' && backupJson.collections && typeof backupJson.collections.matches === 'object');
await page.evaluate(() => {
  navigator.canShare = () => true;
  navigator.share = async (payload) => { window.__sharedBackup = payload?.files?.[0]?.name || ''; };
});
await page.click('#backup-drive');
await page.waitForFunction(() => window.__sharedBackup);
check('Guardar en Drive abre el menú de compartir con el archivo', /^Mis_partidos_/.test(await page.evaluate(() => window.__sharedBackup)));
await page.evaluate(async () => {
  await window.__app.store.addMatch({ date: '2026-12-01', time: '21:00', note: 'No debe quedar' }, window.__app.who);
});
await page.click('[data-close]');
await page.click('#btn-settings');
await page.click('#set-restore');
await page.waitForSelector('#backup-file');
await page.setInputFiles('#backup-file', { name: backupName, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backupJson)) });
await page.waitForSelector('#backup-summary li');
const summaryText = await page.locator('#backup-summary').innerText();
check('Cargar backup muestra la fecha y cuántos partidos trae', summaryText.includes('Fecha del backup') && summaryText.includes('Partidos') && (await page.locator('.backup-warn').innerText()).includes('reemplazan'));
await page.click('#backup-apply');
await page.waitForFunction(() => document.querySelector('#backup-status')?.textContent === 'Todos los datos fueron cargados con éxito');
const loadedColor = await page.$eval('#backup-status', (el) => getComputedStyle(el).color);
const loadedOpen = await page.evaluate(() => !!document.querySelector('#sheet')?.open);
const loadedToast = await page.locator('#toast').innerText();
check('La carga exitosa queda en verde hasta cerrarla', loadedOpen && (await page.locator('#backup-status').innerText()) === 'Todos los datos fueron cargados con éxito' && (loadedColor === 'rgb(15, 122, 61)' || loadedColor === 'rgb(34, 197, 94)') && loadedToast === 'Todos los datos fueron cargados con éxito' && await page.locator('#toast').isVisible(), `${loadedColor} ${loadedToast}`);
check('Cargar el backup saca lo que se agregó después', await page.evaluate(() => !window.__app.matches.some((match) => match.note === 'No debe quedar') && window.__app.matches.some((match) => match.note === 'Para equipos' || match.note === 'Ayer' || match.date)));
await page.click('[data-close]');
await page.waitForFunction(() => !document.querySelector('#sheet')?.open && document.querySelector('#toast')?.textContent === 'Todos los datos fueron cargados con éxito');
await page.click('#toast');
await page.waitForFunction(() => document.querySelector('#toast')?.hidden);
await page.setViewportSize({ width: 390, height: 844 });
await page.evaluate(async () => {
  const who = window.__app.who;
  const early = await window.__app.store.addMatch({ date: '2026-10-22', time: '19:00', capacity: 14 }, who);
  const late = await window.__app.store.addMatch({ date: '2026-10-22', time: '21:00', capacity: 14 }, who);
  const match = window.__app.matches.find((item) => item.id === early);
  const other = window.__app.matches.find((item) => item.id === late);
  const pid = await window.__app.store.addPlayer(match, { name: 'Facundo Aguirre', phone: '11 2799-3830' }, who);
  await window.__app.store.addPlayer(other, { name: 'Facundo Aguirre', phone: '11 2799-3830' }, who);
  await window.__app.store.setPayment(pid, { paid: true, split: true, cash: 4500, transfer: 0, pendingTransfer: 0, cashTo: who }, who);
  location.hash = `#/partido/${encodeURIComponent(early)}`;
});
await page.waitForSelector('#slots .promo-badge');
async function filaLayout(px) {
  await page.evaluate((size) => { document.documentElement.style.fontSize = `${size}px`; }, px);
  return page.evaluate(() => {
    const row = document.querySelector('#slots .slot');
    const name = row.querySelector('.name');
    const phone = row.querySelector('.phone-line');
    const pay = row.querySelector('.pay-line');
    const promo = row.querySelector('.promo-badge');
    const wa = row.querySelector('.wa-btn').getBoundingClientRect();
    const money = row.querySelector('.pay-btn').getBoundingClientRect();
    const more = row.querySelector('.more-btn').getBoundingClientRect();
    const full = (el) => getComputedStyle(el).textOverflow !== 'ellipsis' && el.scrollWidth <= el.clientWidth + 2;
    const phoneStyle = getComputedStyle(phone);
    const phoneBox = phone.getBoundingClientRect();
    return {
      name: name.textContent,
      phone: phone.textContent,
      pay: pay.textContent,
      promo: promo.textContent,
      nameFull: full(name),
      payFull: full(pay),
      promoFull: full(promo),
      phoneOne: phoneStyle.whiteSpace === 'nowrap' && phoneBox.height <= parseFloat(phoneStyle.fontSize) * 1.6,
      stacked: money.top >= wa.bottom - 2 && Math.abs(wa.left - money.left) < 6 && more.left >= wa.right - 1,
      targets: [wa, money, more].every((box) => box.width >= 40 && box.height >= 40),
      inside: row.getBoundingClientRect().right <= window.innerWidth + 1,
    };
  });
}
const fila18 = await filaLayout(18);
const fila22 = await filaLayout(22);
const filaOk = (row) => row.name === 'Facundo Aguirre' && row.phone === '+54 9 11 2799-3830' && row.pay.includes('Pagó $4.500') && row.pay.includes('Efectivo') && row.promo === 'Promo 2 partidos por $9.000' && row.nameFull && row.payFull && row.promoFull && row.phoneOne && row.stacked && row.targets && row.inside;
check('A 18px la fila muestra el texto y apila WhatsApp sobre el pago', filaOk(fila18), JSON.stringify(fila18));
check('A 22px la fila sigue entera', filaOk(fila22), JSON.stringify(fila22));
await page.evaluate(() => { document.documentElement.style.fontSize = '18px'; });
await page.evaluate(async () => {
  const who = window.__app.who;
  const id = await window.__app.store.addMatch({ date: '2026-10-23', time: '21:00', note: 'Pago grupo', capacity: 14 }, who);
  const match = window.__app.matches.find((item) => item.id === id);
  const host = await window.__app.store.addPlayer(match, { name: 'Paga Grupo', phone: '' }, who);
  await window.__app.store.addPlayer(match, { name: 'Invitado 1', invitedBy: host, invitedByName: 'Paga Grupo', guestAuto: true }, who);
  await window.__app.store.addPlayer(match, { name: 'Invitado 2', invitedBy: host, invitedByName: 'Paga Grupo', guestAuto: true }, who);
  location.hash = `#/partido/${encodeURIComponent(id)}`;
});
await page.waitForSelector('#slots .name:text-is("Paga Grupo")');
await page.locator('#slots .slot', { has: page.locator('.name:text-is("Paga Grupo")') }).locator('.pay-btn').click();
await page.waitForSelector('#pay-split-guests');
await page.check('#pay-split-guests');
await page.fill('#pay-form [name=cash]', '7000');
await page.fill('#pay-form [name=transfer]', '0');
await page.fill('#pay-form [name=pending]', '0');
const splitPreview = (await page.locator('#pay-split-preview').innerText()).replace(/\s+/g, ' ');
check('El pago muestra cómo se reparte entre él y los invitados', splitPreview.includes('Paga Grupo') && splitPreview.includes('Efectivo $5.000') && splitPreview.includes('Invitado 1') && splitPreview.includes('Efectivo $2.000') && splitPreview.includes('Invitado 2') && splitPreview.includes('sin pago'), splitPreview);
await page.click('#pay-form button[type=submit]');
await page.waitForFunction(() => !document.querySelector('dialog.sheet[open]'));
const splitStored = await page.evaluate(() => {
  const db = JSON.parse(localStorage.getItem('f7c-demo-db'));
  const money = (name) => {
    const row = Object.values(db.players).find((player) => player.name === name && (name === 'Paga Grupo' ? !player.invitedBy : player.invitedByName === 'Paga Grupo'));
    return row ? (row.cash || 0) : null;
  };
  return { host: money('Paga Grupo'), one: money('Invitado 1'), two: money('Invitado 2') };
});
check('El dividido guarda la parte de cada uno', splitStored.host === 5000 && splitStored.one === 2000 && (splitStored.two === 0 || splitStored.two === null), JSON.stringify(splitStored));
await page.evaluate(() => { location.hash = '#/'; });
await page.click('#btn-settings');
await page.click('#set-reset-db');
await page.waitForSelector('#reset-word');
check('Resetear pide escribir BORRAR y ofrece un backup', (await page.locator('#reset-go-backup').innerText()) === 'Hacer backup' && await page.locator('#reset-apply').isDisabled() && (await page.locator('.backup-warn').innerText()).includes('Conviene hacer un backup'));
await page.fill('#reset-word', 'nada');
check('Otra palabra no habilita el borrado', await page.locator('#reset-apply').isDisabled());
await page.fill('#reset-word', 'BORRAR');
check('Recién con BORRAR se puede borrar', await page.locator('#reset-apply').isEnabled());
await page.click('#reset-apply');
await page.waitForFunction(() => !document.querySelector('#sheet')?.open && window.__app.matches.length === 0);
check('Resetear deja la base vacía', await page.evaluate(() => window.__app.matches.length === 0 && window.__app.players.length === 0 && window.__app.roster.length === 0));

const fresh = await ctx.newPage();
fresh.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
await fresh.clock.install({ time: NOW });
await fresh.goto(`${BASE}#/historial`);
await fresh.waitForFunction(() => document.querySelector('#tab-proximos')?.getAttribute('aria-current') === 'page' && location.hash !== '#/historial');
check('Al abrir la app arranca en Próximos partidos', await fresh.evaluate(() => location.hash === '#/' || location.hash === '' || location.hash === '#'));
await fresh.close();

check('Sin errores de JS', errors.length === 0, errors.join(' | '));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} OK`);
process.exit(failed.length ? 1 : 0);
