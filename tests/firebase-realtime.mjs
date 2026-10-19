// Prueba contra el proyecto REAL de Firebase (config.js): dos contextos (Gustavo y Martín),
// tiempo real, edición y borrado. Limpia todos los datos de prueba al final.
// Uso: node tests/firebase-realtime.mjs http://localhost:8080/
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const BASE = process.argv[2] || 'http://localhost:8080/';
const T = 15000;
const results = [];
const check = (n, c, x = '') => { results.push({ n, ok: !!c }); console.log(`${c ? '✅' : '❌'} ${n}${x ? ' — ' + x : ''}`); };

// fecha de prueba: dentro de 3 días (hora BA), 23:59 para no chocar con partidos reales
const d = new Date(Date.now() + 3 * 864e5);
const DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Buenos_Aires' }).format(d);
const TIME = '23:59';
const NOTE = 'PRUEBA AUTOMATICA - borrar';

const browser = await chromium.launch();
async function open(who) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-AR', timezoneId: 'America/Buenos_Aires', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`); });
  page.on('dialog', (dl) => dl.accept());
  await page.addInitScript((w) => localStorage.setItem('f7c-who', w), who);
  await page.goto(BASE);
  await page.waitForFunction(() => window.__app?.loaded, null, { timeout: T }).catch(() => {});
  return { ctx, page, errors };
}
const G = await open('Gustavo');
const M = await open('Martín');
let fatal = null;
try {
  for (const [n, c] of [['Gustavo', G], ['Martín', M]]) {
    check(`${n}: modo Firebase`, (await c.page.evaluate(() => window.__app?.store?.mode)) === 'firebase');
    check(`${n}: sin banner de demo`, await c.page.isHidden('#demo-banner'));
  }
  await G.page.waitForTimeout(3000);
  const banner = (await G.page.textContent('#error-banner')).trim();
  if (banner) throw new Error('Banner de error: ' + banner);

  // Gustavo agrega partido
  await G.page.click('#btn-add-match');
  await G.page.fill('#match-form [name=date]', DATE);
  await G.page.fill('#match-form [name=time]', TIME);
  await G.page.fill('#match-form [name=note]', NOTE);
  await G.page.click('#match-form button[type=submit]');
  const sel = `.match-card:has-text("${NOTE}")`;
  await G.page.waitForSelector(sel, { timeout: T });
  await G.page.waitForFunction((n) => window.__app.matches.some((m) => m.note === n) && !window.__app.store.state.pending, NOTE, { timeout: T });
  check('Gustavo: partido guardado en servidor', true);
  let t0 = Date.now();
  await M.page.waitForSelector(sel, { timeout: T });
  check('Martín ve el partido en tiempo real', true, `${Date.now() - t0} ms`);

  // Martín agrega jugador
  await M.page.click(sel);
  await M.page.click('#btn-add-player');
  await M.page.fill('#player-form [name=name]', 'Jugador Prueba');
  await M.page.fill('#player-form [name=phone]', '11 1234-5678');
  await M.page.click('#player-form button[type=submit]');
  await G.page.click(sel);
  t0 = Date.now();
  await G.page.waitForSelector('.slot:has-text("Jugador Prueba")', { timeout: T });
  check('Gustavo ve el jugador de Martín en tiempo real', true, `${Date.now() - t0} ms`);
  check('Tag "Agregó: Martín" en Gustavo', (await G.page.textContent('.slot:has-text("Jugador Prueba") .tag')).includes('Martín'));
  check('Contador 1/14 en Gustavo', (await G.page.textContent('#slot-count')) === '1/14');
  check('Link wa.me correcto', (await G.page.getAttribute('.slot:has-text("Jugador Prueba") .wa-btn', 'href')).startsWith('https://wa.me/5491112345678?text='));

  // Gustavo edita jugador -> Martín lo ve
  await G.page.click('.slot:has-text("Jugador Prueba") .more-btn');
  await G.page.click('#pm-edit');
  await G.page.fill('#player-form [name=name]', 'Jugador Editado');
  await G.page.click('#player-form button[type=submit]');
  await M.page.waitForSelector('.slot .name:text-is("Jugador Editado")', { timeout: T });
  check('Editar jugador se refleja en Martín', true);

  // Martín edita el partido (nota) -> Gustavo lo ve
  await M.page.click('#btn-edit-match');
  await M.page.fill('#match-form [name=note]', NOTE + ' (editado)');
  await M.page.click('#match-form button[type=submit]');
  await G.page.waitForSelector(`.detail-head:has-text("${NOTE} (editado)")`, { timeout: T });
  check('Editar partido se refleja en Gustavo', true);

  // Martín quita jugador -> Gustavo lo ve
  await M.page.click('.slot:has-text("Jugador Editado") .more-btn');
  await M.page.click('#pm-del');
  await G.page.waitForFunction(() => !document.body.innerText.includes('Jugador Editado'), null, { timeout: T });
  check('Quitar jugador se refleja en Gustavo', (await G.page.textContent('#slot-count')) === '0/14');

  // Gustavo agrega otro jugador y borra el partido (debe borrar también sus jugadores)
  await G.page.click('#btn-add-player');
  await G.page.fill('#player-form [name=name]', 'Jugador Dos');
  await G.page.click('#player-form button[type=submit]');
  await M.page.waitForSelector('.slot:has-text("Jugador Dos")', { timeout: T });
  await G.page.click('#btn-del-match');
  await M.page.waitForSelector('text=No encontramos este partido', { timeout: T });
  check('Borrar partido se refleja en Martín', true);
} catch (e) {
  fatal = e.message.split('\n')[0];
  check('Flujo completo', false, fatal);
}

// Limpieza: borrar TODO lo de prueba que haya quedado (por nota / nombres de prueba)
let leftover = null;
try {
  leftover = await Promise.race([new Promise((r) => setTimeout(() => r('timeout (Firestore no responde)'), 20000)), G.page.evaluate(async (note) => {
    const s = window.__app.store; if (s?.mode !== 'firebase') return 'no-firebase';
    const { collection, getDocs, deleteDoc } = s.fs;
    const out = { matchesDeleted: 0, playersDeleted: 0 };
    const ms = await getDocs(collection(s.db, 'matches'));
    const testIds = new Set();
    for (const d of ms.docs) if ((d.data().note || '').startsWith(note)) { testIds.add(d.id); await deleteDoc(d.ref); out.matchesDeleted++; }
    const ps = await getDocs(collection(s.db, 'players'));
    for (const d of ps.docs) if (testIds.has(d.data().matchId) || /^Jugador (Prueba|Editado|Dos)$/.test(d.data().name)) { await deleteDoc(d.ref); out.playersDeleted++; }
    out.matchesRemaining = (await getDocs(collection(s.db, 'matches'))).size;
    out.playersRemaining = (await getDocs(collection(s.db, 'players'))).size;
    return out;
  }, NOTE)]);
} catch (e) { leftover = 'error limpieza: ' + e.message.split('\n')[0]; }
console.log('Limpieza:', JSON.stringify(leftover));
console.log('Errores consola Gustavo:', JSON.stringify(G.errors.slice(0, 6)));
console.log('Errores consola Martín:', JSON.stringify(M.errors.slice(0, 6)));
console.log('Banner error:', JSON.stringify((await G.page.textContent('#error-banner')).trim()));
await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} OK`);
process.exit(failed ? 1 : 0);
