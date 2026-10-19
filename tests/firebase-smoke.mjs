// Verifica que, con una config "completa" (falsa), la app carga el SDK de Firebase
// desde el CDN y entra en modo Firebase (sin banner de demo). No escribe datos.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || 'playwright');
const BASE = process.argv[2] || 'http://localhost:8765/';
const cfg = fs.readFileSync(new URL('../config.js', import.meta.url), 'utf8')
  .replace('TU_API_KEY', 'AIzaFakeKeyForSmokeTest000000000000000').replaceAll('TU_PROYECTO', 'f7c-smoke-test-x')
  .replace('TU_SENDER_ID', '123').replace('TU_APP_ID', '1:123:web:abc');
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
await p.route('**/config.js', (r) => r.fulfill({ contentType: 'text/javascript', body: cfg }));
await p.addInitScript(() => localStorage.setItem('f7c-who', 'Gustavo'));
await p.goto(BASE);
await p.waitForFunction(() => window.__app?.store, null, { timeout: 20000 });
const mode = await p.evaluate(() => window.__app.store.mode);
const demoHidden = await p.isHidden('#demo-banner');
await p.waitForTimeout(4000);
const banner = await p.textContent('#error-banner');
console.log(JSON.stringify({ mode, demoHidden, pageErrors: errs, errorBanner: banner }));
await b.close();
process.exit(mode === 'firebase' && demoHidden && !errs.length ? 0 : 1);
