// «Solo yo» se lista en la ficha con el token, y no con el uid de otro organizador.
// firebase emulators:exec --project demo-player-link --only firestore "node --test tests/rules-player-link.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const TOKEN = 'tokendegustavolargo1234';
const ORG = 'orgGustavoUid123456';
const OTHER = 'orgMartinUid1234567';

test('la ficha lee un solo yo con el token y otro organizador no', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const { initializeTestEnvironment, assertSucceeds, assertFails } = await import('@firebase/rules-unit-testing');
  const { collection, doc, getDocs, orderBy, query, setDoc, where } = await import('firebase/firestore');
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostname, portRaw] = host.split(':');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-player-link',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: hostname,
      port: Number(portRaw),
    },
  });
  try {
    await testEnv.clearFirestore();
    const admin = testEnv.authenticatedContext('admin-uid', { email: 'gustavof.arg@gmail.com' });
    const adb = admin.firestore();
    await assertSucceeds(setDoc(doc(adb, 'users', 'admin-uid'), {
      role: 'admin', name: 'Gustavo', email: 'gustavof.arg@gmail.com', active: true, createdAt: 1,
    }));
    await assertSucceeds(setDoc(doc(adb, 'users', ORG), {
      role: 'organizer', name: 'Gus', email: 'gus@demo.local', active: true, createdAt: 1,
    }));
    await assertSucceeds(setDoc(doc(adb, 'users', OTHER), {
      role: 'organizer', name: 'Martín', email: 'martin@demo.local', active: true, createdAt: 1,
    }));
    const org = testEnv.authenticatedContext(ORG, { email: 'gus@demo.local' });
    await assertSucceeds(setDoc(doc(org.firestore(), 'shareTokens', TOKEN), { uid: ORG, name: 'Gus', createdAt: 1 }));
    await assertSucceeds(setDoc(doc(adb, 'matches', 'solo'), {
      date: '2026-11-21', time: '18:00', createdByUid: ORG, createdBy: 'Gus',
      viewers: [ORG], adders: [ORG], solo: true, playerVisible: true, playerKey: TOKEN, playerCount: 0,
    }));
    await assertSucceeds(setDoc(doc(adb, 'matches', 'propia'), {
      date: '2026-11-21', time: '19:00', createdByUid: ORG, createdBy: 'Gustavo',
      viewers: [ORG], adders: [ORG], solo: false, playerVisible: true, playerKey: TOKEN, playerCount: 0,
    }));
    await assertSucceeds(setDoc(doc(adb, 'matches', 'oculto'), {
      date: '2026-11-21', time: '20:00', createdByUid: ORG, createdBy: 'Gus',
      viewers: [ORG], adders: [ORG], solo: true, playerVisible: false, playerCount: 0,
    }));

    const anon = testEnv.unauthenticatedContext().firestore();
    const link = await assertSucceeds(getDocs(query(
      collection(anon, 'matches'),
      where('playerKey', '==', TOKEN),
      where('date', '>=', '2026-11-18'),
      where('date', '<=', '2026-12-01'),
      orderBy('date'),
    )));
    assert.deepEqual(link.docs.map((item) => item.id).sort(), ['propia', 'solo']);
    await assertFails(getDocs(query(collection(anon, 'matches'), where('createdByUid', '==', ORG))));

    const martin = testEnv.authenticatedContext(OTHER, { email: 'martin@demo.local' }).firestore();
    const staff = await assertSucceeds(getDocs(query(
      collection(martin, 'matches'),
      where('viewers', 'array-contains-any', [OTHER, '*']),
    )));
    assert.deepEqual(staff.docs.map((item) => item.id), []);
  } finally {
    await testEnv.cleanup();
  }
});
