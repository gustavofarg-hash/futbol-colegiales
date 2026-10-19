// Reglas reales contra el emulador de Firestore. No toca el proyecto futbol-partidos.
// Se salta solo si no hay emulador. Con el emulador:
//   firebase emulators:exec --project demo-f7c --only firestore "node --test tests/rules-confirm.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const TOKEN = 'abcdefghijklmnopqrstuvwx';
const TOKEN_NOTE = 'zzzzzzzzzzzzzzzzzzzzzzzz';
const MATCH = '2026-10-20_2000';

test('un anónimo confirma y un merge del organizador no borra el sí', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc, updateDoc, getDocs, collection } = await import('firebase/firestore');
  const { confirmationIdentity } = await import('../js/reminders.js');

  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostname, portRaw] = host.split(':');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-f7c',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: hostname,
      port: Number(portRaw),
    },
  });

  try {
    await testEnv.clearFirestore();
    const admin = testEnv.authenticatedContext('admin-uid', { email: 'gustavof.arg@gmail.com' });
    await assertSucceeds(setDoc(doc(admin.firestore(), 'users', 'admin-uid'), {
      role: 'admin', name: 'Gustavo', email: 'gustavof.arg@gmail.com', active: true, createdAt: 1,
    }));
    await assertSucceeds(setDoc(doc(admin.firestore(), 'users', 'org-uid'), {
      role: 'organizer', name: 'Martín', email: 'martin@demo.local', active: true, createdAt: 1,
    }));

    const org = testEnv.authenticatedContext('org-uid', { email: 'martin@demo.local' });
    const db = org.firestore();
    await assertSucceeds(setDoc(doc(db, 'matches', MATCH), {
      date: '2026-10-20', time: '20:00', note: 'Lunes', capacity: 14,
    }));
    await assertSucceeds(setDoc(doc(db, 'players', 'p1'), {
      matchId: MATCH, matchDate: '2026-10-20', name: 'Juan Pérez', phone: '5491112345678',
      addedBy: 'Martín', createdAt: 1, updatedAt: 1, confirmToken: TOKEN,
    }));

    const identity = confirmationIdentity({
      playerId: 'p1',
      player: { matchId: MATCH, name: 'Juan Pérez', confirmed: null, confirmedAt: null },
      match: { id: MATCH, date: '2026-10-20', time: '20:00', note: 'Lunes' },
    });
    assert.equal('confirmed' in identity, false);
    await assertSucceeds(setDoc(doc(db, 'confirmations', TOKEN), identity));

    const anon = testEnv.unauthenticatedContext();
    await assertFails(getDocs(collection(anon.firestore(), 'confirmations')));
    await assertSucceeds(updateDoc(doc(anon.firestore(), 'confirmations', TOKEN), {
      confirmed: 'si', confirmedAt: 42,
    }));
    await assertFails(updateDoc(doc(anon.firestore(), 'confirmations', TOKEN), {
      confirmed: 'no', confirmedAt: 43, updatedAt: 1,
    }));

    const seen = await getDoc(doc(db, 'confirmations', TOKEN));
    assert.equal(seen.data().confirmed, 'si');
    assert.equal(seen.data().confirmedAt, 42);

    const rewrite = confirmationIdentity({
      playerId: 'p1',
      player: { matchId: MATCH, name: 'Juan Pérez', confirmed: null, confirmedAt: null },
      match: { id: MATCH, date: '2026-10-20', time: '20:00', note: 'Lunes' },
    });
    await assertSucceeds(setDoc(doc(db, 'confirmations', TOKEN), rewrite, { merge: true }));
    const kept = await getDoc(doc(db, 'confirmations', TOKEN));
    assert.equal(kept.data().confirmed, 'si');
    assert.equal(kept.data().confirmedAt, 42);
    assert.equal(kept.data().name, 'Juan Pérez');

    await assertSucceeds(setDoc(doc(db, 'confirmations', TOKEN_NOTE), {
      playerId: 'p1', matchId: MATCH, name: 'Juan Pérez', date: '2026-10-20', time: '20:00',
    }));
    await assertSucceeds(updateDoc(doc(anon.firestore(), 'confirmations', TOKEN_NOTE), {
      confirmed: 'no', confirmedAt: 7,
    }));
    const noNote = await getDoc(doc(db, 'confirmations', TOKEN_NOTE));
    assert.equal(noNote.data().confirmed, 'no');
  } finally {
    await testEnv.cleanup();
  }
});
