// Historial con más de 400 jugadores. Solo el emulador.
// El tope de 400 dejaría el par 2×9000 a medias y lo mostraría debiendo $500.
// Uso: FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node tests/historial-roster.mjs http://127.0.0.1:18432/
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { refuseRealTarget, refuseUnlessEmulator } from './no-real-firebase.mjs';

refuseUnlessEmulator();
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:18432/';
refuseRealTarget(BASE);

const PROJECT = 'demo-historial';
const EMAIL = 'gustavof.arg@gmail.com';
const PASSWORD = 'historial-v222';
const host = process.env.FIRESTORE_EMULATOR_HOST;
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const [fsHost, fsPort] = host.split(':');

const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
const { doc, writeBatch } = await import('firebase/firestore');

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT,
  firestore: {
    rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
    host: fsHost,
    port: Number(fsPort),
  },
});

let account = await (await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
})).json();
if (!account.localId) {
  account = await (await fetch(`http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  })).json();
}
if (!account.localId) throw new Error('No se pudo crear la cuenta del emulador: ' + JSON.stringify(account));
const uid = account.localId;

await testEnv.clearFirestore();
await testEnv.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  const rows = [];
  const put = (path, id, data) => rows.push([path, id, data]);
  put('users', uid, { role: 'admin', name: 'Gustavo', email: EMAIL, active: true, createdAt: 1 });
  for (let day = 2; day <= 29; day += 1) {
    const date = `2026-10-${String(day).padStart(2, '0')}`;
    const id = `fill-${date}`;
    put('matches', id, { date, time: '21:00', note: `Cancha ${date}`, capacity: 14, perTeam: 7, viewers: ['*'], createdByUid: uid, createdBy: 'Gustavo' });
    for (let n = 0; n < 14; n += 1) {
      put('players', `${id}-${n}`, player(id, date, n === 0 ? 'Titular' : `Jugador ${n}`, 5000, uid, date));
    }
  }
  const pairDate = '2026-09-30';
  put('matches', 'pair-19', { date: pairDate, time: '19:00', note: 'Promo par', capacity: 14, perTeam: 7, viewers: ['*'], createdByUid: uid, createdBy: 'Gustavo' });
  put('matches', 'pair-21', { date: pairDate, time: '21:00', note: 'Promo par', capacity: 14, perTeam: 7, viewers: ['*'], createdByUid: uid, createdBy: 'Gustavo' });
  for (let n = 0; n < 14; n += 1) {
    const promo = n === 0;
    put('players', `pair-19-${n}`, player('pair-19', promo ? '2026-10-01' : '2026-09-30', promo ? 'Promo Par' : `Temprano ${n}`, promo ? 4500 : 5000, uid, pairDate));
    put('players', `pair-21-${n}`, player('pair-21', '2026-09-29', promo ? 'Promo Par' : `Noche ${n}`, promo ? 4500 : 5000, uid, pairDate));
  }
  let batch = writeBatch(db);
  let count = 0;
  for (const [path, id, data] of rows) {
    batch.set(doc(db, path, id), data);
    count += 1;
    if (count === 400) {
      await batch.commit();
      batch = writeBatch(db);
      count = 0;
    }
  }
  if (count) await batch.commit();
});

function player(matchId, matchDate, name, cash, owner, date) {
  return {
    matchId,
    matchDate,
    name,
    viewers: ['*'],
    paid: true,
    split: true,
    cash,
    transfer: 0,
    fromCredit: 0,
    pendingTransfer: 0,
    addedByUid: owner,
    addedBy: 'Gustavo',
    signedUpWith: owner,
    signedUpWithName: 'Gustavo',
    waiting: false,
    date,
  };
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-AR', timezoneId: 'America/Buenos_Aires', serviceWorkers: 'block' });
await ctx.addInitScript((info) => {
  globalThis.__F7C_TEST = true;
  globalThis.__F7C_EMULATOR_HOST = info.firestore;
  globalThis.__F7C_AUTH_EMULATOR = `http://${info.auth}`;
}, { firestore: host, auth: authHost });
await ctx.route(/https?:\/\/([^/]+\.)?(firestore\.googleapis\.com|firebaseio\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com)\//, (route) => route.abort());
await ctx.route('**/config.js', async (route) => {
  const body = readFileSync(new URL('../config.js', import.meta.url), 'utf8')
    .replace(/projectId:\s*["'][^"']+["']/, `projectId: "${PROJECT}"`);
  await route.fulfill({ contentType: 'text/javascript', body });
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
try {
  await page.goto(BASE);
  await page.waitForSelector('#login-email', { timeout: 20000 });
  await page.fill('#login-email', EMAIL);
  await page.fill('#login-password', PASSWORD);
  await page.click('#login-form button[type="submit"]');
  try {
    await page.waitForFunction(() => window.__app?.loaded && window.__app?.store?.mode === 'firebase', null, { timeout: 20000 });
  } catch (error) {
    const info = await page.evaluate(() => ({
      err: document.querySelector('#login-err')?.textContent || '',
      text: document.body?.innerText?.slice(0, 500) || '',
      mode: window.__app?.store?.mode || '',
      loaded: window.__app?.loaded === true,
    })).catch(() => ({}));
    console.log(JSON.stringify({ errors, info }, null, 2));
    throw error;
  }
  await page.click('#btn-historial');
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll('#list-history .match-card')];
    return cards.length === 30 && cards.every((card) => card.querySelector('.count')?.getAttribute('aria-label') === '14 de 14 anotados');
  }, null, { timeout: 30000 });
  const result = await page.evaluate(() => {
    const pair = [...document.querySelectorAll('#list-history .match-item')].filter((item) => item.querySelector('[data-note="Promo par"]'));
    const players = window.__app.players || [];
    return {
      cards: document.querySelectorAll('#list-history .match-card').length,
      pair: pair.map((item) => ({
        count: item.querySelector('.count')?.getAttribute('aria-label') || '',
        text: item.textContent || '',
      })),
      early: players.filter((player) => player.matchId === 'pair-19').length,
      late: players.filter((player) => player.matchId === 'pair-21').length,
      total: players.length,
      error: document.querySelector('#roster-error')?.textContent || document.querySelector('#hist-error')?.textContent || '',
    };
  });
  const ok = result.cards === 30
    && result.pair.length === 2
    && result.pair.every((item) => item.count === '14 de 14 anotados' && !item.text.includes('Faltan pagar') && !item.text.includes('$500'))
    && result.early === 14
    && result.late === 14
    && result.total > 400
    && !result.error;
  console.log(JSON.stringify({ ok, result, errors: errors.slice(0, 8) }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  await browser.close();
  await testEnv.cleanup();
}
