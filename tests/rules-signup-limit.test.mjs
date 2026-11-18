// El tope de la ficha sale de settings/signup. Solo el admin lo escribe.
// firebase emulators:exec --project demo-signup-limit --only firestore "node --test tests/rules-signup-limit.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ORG = 'orgMartinUid1234567';
const ROSTER = 'NZpoLFKUUh044kfNGSmR';

test('el admin guarda el límite y la ficha no pasa de esos movimientos', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const { initializeTestEnvironment, assertSucceeds, assertFails } = await import('@firebase/rules-unit-testing');
  const { doc, getDoc, runTransaction, serverTimestamp, setDoc } = await import('firebase/firestore');
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostname, portRaw] = host.split(':');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-signup-limit',
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
      role: 'organizer', name: 'Martín', email: 'martin@demo.local', active: true, createdAt: 1,
    }));
    await assertSucceeds(setDoc(doc(adb, 'settings', 'signup'), { maxMoves: 2, windowMinutes: 15 }));
    const martin = testEnv.authenticatedContext(ORG, { email: 'martin@demo.local' });
    await assertFails(setDoc(doc(martin.firestore(), 'settings', 'signup'), { maxMoves: 9, windowMinutes: 15 }));
    await assertFails(setDoc(doc(adb, 'settings', 'signup'), { maxMoves: 0, windowMinutes: 15 }));
    await assertFails(setDoc(doc(adb, 'settings', 'signup'), { maxMoves: 2, windowMinutes: 2000 }));

    await assertSucceeds(setDoc(doc(adb, 'roster', ROSTER), {
      name: 'Tope Ana', holders: [ORG], createdByUid: ORG, createdAt: 1, updatedAt: 1,
    }));
    const anon = testEnv.unauthenticatedContext().firestore();
    const seen = await assertSucceeds(getDoc(doc(anon, 'settings', 'signup')));
    assert.equal(seen.data().maxMoves, 2);
    assert.equal(seen.data().windowMinutes, 15);
    const charge = (playerId, count) => runTransaction(anon, async (tx) => {
      const ref = doc(anon, 'signupRates', ROSTER);
      const snap = await tx.get(ref);
      const prev = snap.exists() ? snap.data() : null;
      tx.set(ref, {
        windowStart: prev ? prev.windowStart : serverTimestamp(),
        count,
        lastId: playerId,
      });
    });
    await assertSucceeds(charge('mov-1', 1));
    await assertSucceeds(charge('mov-2', 2));
    await assertFails(charge('mov-3', 3));
  } finally {
    await testEnv.cleanup();
  }
});
