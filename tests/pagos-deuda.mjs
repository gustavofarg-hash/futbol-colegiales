// Un pago no puede verse como deuda porque un tope se comió jugadores,
// confirmaciones, compensaciones o un pago guardado viejo. Solo el emulador.
// Uso: FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node tests/pagos-deuda.mjs http://127.0.0.1:18431/
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { refuseRealTarget, refuseUnlessEmulator } from './no-real-firebase.mjs';
import { remapTrialBackup } from '../js/backup.js';

refuseUnlessEmulator();
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const BASE = process.argv[2] || 'http://127.0.0.1:18431/';
refuseRealTarget(BASE);

const PROJECT = 'demo-historial';
const EMAIL = 'gustavof.arg@gmail.com';
const PASSWORD = 'historial-v222';
const OLD_ADMIN = 'prodAdminUid123456';
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

const restored = remapTrialBackup({
  collections: {
    users: { [OLD_ADMIN]: { role: 'admin', name: 'Gustavo', email: EMAIL, active: true } },
    matches: {
      'pago-viejo': {
        date: '2026-08-01', time: '21:00', note: 'Pago viejo', capacity: 14, perTeam: 7,
        viewers: [OLD_ADMIN], createdByUid: OLD_ADMIN, createdBy: 'Gustavo',
      },
    },
    players: {
      'pago-viejo-0': {
        matchId: 'pago-viejo', matchDate: '2026-07-01', name: 'Pagó Viejo',
        viewers: [OLD_ADMIN], addedByUid: OLD_ADMIN, signedUpWith: OLD_ADMIN, signedUpWithName: 'Gustavo',
        addedBy: 'Gustavo', paid: true, cash: 5000, transfer: 0, pendingTransfer: 0, fromCredit: 0, waiting: false,
      },
    },
    payBatches: {
      [`${OLD_ADMIN}_1000`]: { ownerUid: OLD_ADMIN, at: Date.parse('2026-09-01T12:00:00-03:00'), payload: '{"payments":[],"credits":[]}' },
    },
    confirmations: {
      'confirm-pago-viejo-0': {
        playerId: 'pago-viejo-0', matchId: 'pago-viejo', name: 'Pagó Viejo',
        date: '2026-08-01', time: '21:00', viewers: [OLD_ADMIN], confirmed: 'si',
      },
    },
  },
}, uid);
const restoredPlayer = restored.collections.players['pago-viejo-0'];
if (restoredPlayer.viewers[0] !== uid || restoredPlayer.cash !== 5000) {
  throw new Error('El restore no conservó el pago o no reescribió viewers: ' + JSON.stringify(restoredPlayer));
}

await testEnv.clearFirestore();
await testEnv.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  const rows = [];
  const put = (path, id, data) => rows.push([path, id, data]);
  put('users', uid, { role: 'admin', name: 'Gustavo', email: EMAIL, active: true, createdAt: 1 });
  for (let day = 2; day <= 30; day += 1) {
    const date = `2026-10-${String(day).padStart(2, '0')}`;
    const id = `fill-${date}`;
    put('matches', id, { date, time: '21:00', note: `Cancha ${date}`, capacity: 14, perTeam: 7, viewers: ['*'], createdByUid: uid, createdBy: 'Gustavo' });
    for (let n = 0; n < 14; n += 1) {
      put('players', `${id}-${n}`, {
        matchId: id, matchDate: date, name: `Jugador ${n}`, viewers: ['*'],
        paid: true, cash: 5000, transfer: 0, pendingTransfer: 0, fromCredit: 0,
        addedByUid: uid, addedBy: 'Gustavo', signedUpWith: uid, signedUpWithName: 'Gustavo', waiting: false,
      });
    }
  }
  put('matches', 'pago-viejo', restored.collections.matches['pago-viejo']);
  put('players', 'pago-viejo-0', restoredPlayer);
  for (let n = 1; n < 14; n += 1) {
    put('players', `pago-viejo-${n}`, {
      matchId: 'pago-viejo', matchDate: '2026-08-01', name: `Viejo ${n}`, viewers: [uid],
      paid: true, cash: 5000, transfer: 0, pendingTransfer: 0, fromCredit: 0,
      addedByUid: uid, addedBy: 'Gustavo', signedUpWith: uid, signedUpWithName: 'Gustavo', waiting: false,
    });
  }
  put('confirmations', 'confirm-pago-viejo-0', restored.collections.confirmations['confirm-pago-viejo-0']);
  for (let n = 0; n < 210; n += 1) {
    put('confirmations', `confirm-nuevo-${n}`, {
      playerId: `fill-2026-10-30-${n % 14}`, matchId: 'fill-2026-10-30', name: `Nuevo ${n}`,
      date: '2026-10-30', time: '21:00', viewers: ['*'], confirmed: 'si',
    });
  }
  put('compensations', '2026-08-01', { date: '2026-08-01', rows: [], transfers: [] });
  for (let n = 0; n < 94; n += 1) {
    const date = new Date(Date.UTC(2026, 7, 2 + n)).toISOString().slice(0, 10);
    put('compensations', date, { date, rows: [], transfers: [] });
  }
  const batchId = Object.keys(restored.collections.payBatches)[0];
  put('payBatches', batchId, restored.collections.payBatches[batchId]);
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
  await page.waitForFunction(() => window.__app?.loaded && window.__app?.store?.mode === 'firebase', null, { timeout: 20000 });
  await page.click('#btn-historial');
  await page.waitForFunction(() => {
    const item = [...document.querySelectorAll('#list-history .match-item')].find((row) => row.querySelector('[data-note="Pago viejo"]'));
    if (!item) return false;
    const text = item.innerText || '';
    return item.querySelector('.count')?.getAttribute('aria-label') === '14 de 14 anotados'
      && !text.includes('Cargando pagos')
      && !text.includes('Faltan pagar');
  }, null, { timeout: 30000 });
  await page.click('#list-history .match-card[data-note="Pago viejo"]');
  await page.waitForSelector('.slot:has-text("Pagó Viejo")');
  const result = await page.evaluate(() => {
    const slot = [...document.querySelectorAll('.slot')].find((row) => row.innerText.includes('Pagó Viejo'));
    const paid = (window.__app.players || []).find((player) => player.name === 'Pagó Viejo');
    const oldBatch = (window.__app.payBatches || []).find((batch) => batch.at && batch.at < Date.parse('2026-10-01T00:00:00-03:00'));
    return {
      slot: (slot?.innerText || '').replace(/\s+/g, ' '),
      cash: paid?.cash || 0,
      viewers: paid?.viewers || [],
      batch: oldBatch ? oldBatch.at : 0,
      compensation: (window.__app.compensations || []).some((row) => row.date === '2026-08-01'),
      confirmations: (window.__app.players || []).filter((player) => player.matchId === 'pago-viejo').length,
    };
  });
  const ok = result.slot.includes('Pagó')
    && result.slot.includes('$5.000')
    && !result.slot.includes('Faltan pagar')
    && result.cash === 5000
    && result.viewers.includes(uid)
    && result.batch > 0
    && result.compensation === true
    && result.confirmations === 14;
  console.log(JSON.stringify({ ok, result, errors: errors.slice(0, 8) }, null, 2));
  if (!ok) process.exitCode = 1;
} finally {
  await browser.close();
  await testEnv.cleanup();
}
