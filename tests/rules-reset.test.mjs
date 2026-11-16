// Reset contra las reglas de prueba. El emulador no cuelga el canal del SDK:
// este archivo prueba que el admin puede borrar cada colección y que en /prueba/
// el mismo vaciado sale por REST (lista paginada + commit), sin tocar users.
//
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8181 node --test tests/rules-reset.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FirebaseStore } from '../js/store.js';

const ADMIN = {
  role: 'admin',
  name: 'Gustavo',
  email: 'gustavof.arg@gmail.com',
  active: true,
  createdAt: 111,
};
const ORG = {
  role: 'organizer',
  name: 'Martín',
  email: 'martin@demo.local',
  active: true,
  createdAt: 2,
};
const RESET_COLLECTIONS = [
  'links', 'log', 'compensations', 'credits', 'confirmations',
  'rosterNotes', 'rosterClaims', 'rosterRedirects', 'rosterSuspensions', 'suspensionHistory', 'payBatches', 'behavior',
  'playerContacts', 'rosterContacts', 'players', 'roster', 'organizers',
  'settings', 'venues', 'matches',
];

function attachStore(db, fs) {
  const store = new FirebaseStore();
  store.actor = { uid: 'admin-uid', name: 'Gustavo', role: 'admin' };
  store.fs = fs;
  store.db = db;
  return store;
}

async function openEnv(projectId) {
  const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostname, portRaw] = host.split(':');
  return initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: hostname,
      port: Number(portRaw),
    },
  });
}

async function seed(testEnv, fs, { logCount = 1 } = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await fs.setDoc(fs.doc(db, 'users', 'admin-uid'), ADMIN);
    await fs.setDoc(fs.doc(db, 'users', 'org-uid'), ORG);
    await fs.setDoc(fs.doc(db, 'matches', 'con-viewers'), { date: '2026-08-01', time: '21:00', viewers: ['*'], adders: ['*'] });
    await fs.setDoc(fs.doc(db, 'matches', 'sin-viewers'), { date: '2026-08-02', time: '21:00', note: 'viejo' });
    await fs.setDoc(fs.doc(db, 'players', 'p1'), { matchId: 'con-viewers', name: 'Ana', viewers: ['*'] });
    await fs.setDoc(fs.doc(db, 'roster', 'ana'), { name: 'Ana' });
    await fs.setDoc(fs.doc(db, 'venues', 'sede'), { name: 'Sede', active: true });
    await fs.setDoc(fs.doc(db, 'organizers', 'gustavo'), { name: 'Gustavo' });
    await fs.setDoc(fs.doc(db, 'settings', 'prices'), { matchPrice: 5000 });
    await fs.setDoc(fs.doc(db, 'confirmations', 'tok'), { playerId: 'p1', matchId: 'con-viewers' });
    await fs.setDoc(fs.doc(db, 'playerContacts', 'p1'), { phone: '5491111111111', ownerUid: 'admin-uid' });
    await fs.setDoc(fs.doc(db, 'rosterContacts', 'ana'), { phone: '5491111111112', ownerUid: 'admin-uid' });
    await fs.setDoc(fs.doc(db, 'links', 'Abcd1234'), { m: 'con-viewers', p: 'p1', t: 'tok' });
    await fs.setDoc(fs.doc(db, 'credits', 'c1'), { amount: 1000 });
    await fs.setDoc(fs.doc(db, 'compensations', 'k1'), { amount: 1 });
    await fs.setDoc(fs.doc(db, 'rosterNotes', 'n1'), { ownerUid: 'admin-uid', notes: [] });
    await fs.setDoc(fs.doc(db, 'rosterClaims', 'q1'), { rosterId: 'ana' });
    await fs.setDoc(fs.doc(db, 'rosterRedirects', 'vieja'), { intoId: 'ana' });
    await fs.setDoc(fs.doc(db, 'rosterSuspensions', 's1'), { rosterId: 'ana' });
    await fs.setDoc(fs.doc(db, 'suspensionHistory', 'h1'), { rosterId: 'ana' });
    await fs.setDoc(fs.doc(db, 'payBatches', 'b1'), { ownerUid: 'admin-uid', payload: '{}' });
    await fs.setDoc(fs.doc(db, 'behavior', 'beh1'), { rosterId: 'ana', type: 'manual', points: -1 });
    for (let i = 0; i < logCount; i++) {
      await fs.setDoc(fs.doc(db, 'log', `l${i}`), { at: i, text: 'seed' });
    }
  });
}

async function assertEmptyData(fs, db) {
  for (const name of RESET_COLLECTIONS) {
    const snap = await fs.getDocs(fs.collection(db, name));
    assert.equal(snap.size, 0, name);
  }
  assert.deepEqual((await fs.getDoc(fs.doc(db, 'users', 'admin-uid'))).data(), ADMIN);
  assert.equal((await fs.getDoc(fs.doc(db, 'users', 'org-uid'))).data().name, 'Martín');
}

test('el admin borra todas las colecciones y las cuentas quedan', { timeout: 120000 }, async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const fs = await import('firebase/firestore');
  const testEnv = await openEnv('demo-f7c-reset');
  try {
    await testEnv.clearFirestore();
    await seed(testEnv, fs);
    const db = testEnv.authenticatedContext('admin-uid', { email: 'gustavof.arg@gmail.com' }).firestore();
    const store = attachStore(db, fs);
    const steps = [];
    await store.resetDatabase(({ done, total }) => steps.push([done, total]));
    assert.ok(steps.at(-1)[0] === steps.at(-1)[1] && steps.at(-1)[1] > 0);
    await assertEmptyData(fs, db);
    const org = attachStore(db, fs);
    org.actor = { uid: 'org-uid', name: 'Martín', role: 'organizer' };
    await assert.rejects(() => org.resetDatabase(), (error) => error.code === 'admin-only');
  } finally {
    await testEnv.cleanup();
  }
});

test('en /prueba/ el reset lista por REST, pagina y deja todo vacío', { timeout: 180000 }, async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const fs = await import('firebase/firestore');
  const testEnv = await openEnv('demo-f7c-reset-rest');
  const prev = globalThis.location;
  globalThis.location = { pathname: '/futbol-colegiales/prueba/', origin: 'http://127.0.0.1:8181' };
  try {
    await testEnv.clearFirestore();
    await seed(testEnv, fs, { logCount: 301 });
    const db = testEnv.authenticatedContext('admin-uid', { email: 'gustavof.arg@gmail.com' }).firestore();
    const store = attachStore(db, fs);
    await store.resetDatabase();
    await assertEmptyData(fs, db);
  } finally {
    if (prev === undefined) delete globalThis.location;
    else globalThis.location = prev;
    await testEnv.cleanup();
  }
});
