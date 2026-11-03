// El admin lee y escribe las notas de todos para backup, carga y reset.
// Un organizador sigue viendo solo las suyas.
//   firebase emulators:exec --project demo-f7c --only firestore "node --test tests/rules-backup-notes.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const NOTE = {
  ownerUid: 'uid-b',
  rosterId: 'card-b',
  notes: [{ id: 'n1', matchId: 'm1', text: 'nota de Martín', createdAt: 1, authorUid: 'uid-b' }],
};

test('el admin respalda las notas de otro y un organizador no las lee', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
  const { doc, getDoc, getDocs, setDoc, deleteDoc, collection } = await import('firebase/firestore');
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
    const adminDb = admin.firestore();
    await assertSucceeds(setDoc(doc(adminDb, 'users', 'admin-uid'), {
      role: 'admin', name: 'Gustavo', email: 'gustavof.arg@gmail.com', active: true, createdAt: 1,
    }));
    await assertSucceeds(setDoc(doc(adminDb, 'users', 'uid-b'), {
      role: 'organizer', name: 'Martín', email: 'martin@demo.local', active: true, createdAt: 1,
    }));
    const b = testEnv.authenticatedContext('uid-b', { email: 'martin@demo.local' });
    const bDb = b.firestore();
    await assertSucceeds(setDoc(doc(bDb, 'rosterNotes', 'card-b_uid-b'), NOTE));
    await assertSucceeds(getDoc(doc(bDb, 'rosterNotes', 'card-b_uid-b')));
    await assertFails(getDocs(collection(bDb, 'rosterNotes')));
    await assertSucceeds(getDoc(doc(adminDb, 'rosterNotes', 'card-b_uid-b')));
    const all = await getDocs(collection(adminDb, 'rosterNotes'));
    assert.equal(all.docs.length, 1);
    await assertSucceeds(setDoc(doc(adminDb, 'rosterNotes', 'card-b_uid-b'), NOTE));
    await assertSucceeds(setDoc(doc(adminDb, 'rosterClaims', 'card-a_uid-b'), { phone: '5491111111111', rosterId: 'card-a' }));
    await assertSucceeds(setDoc(doc(adminDb, 'rosterRedirects', 'vieja'), { intoId: 'card-a' }));
    await assertSucceeds(deleteDoc(doc(adminDb, 'rosterNotes', 'card-b_uid-b')));
    await assertSucceeds(deleteDoc(doc(adminDb, 'rosterClaims', 'card-a_uid-b')));
    await assertSucceeds(deleteDoc(doc(adminDb, 'rosterRedirects', 'vieja')));
    await assertFails(setDoc(doc(bDb, 'rosterNotes', 'card-a_uid-a'), {
      ownerUid: 'uid-a', rosterId: 'card-a',
      notes: [{ id: 'n2', matchId: 'm1', text: 'ajena', createdAt: 1, authorUid: 'uid-a' }],
    }));
  } finally {
    await testEnv.cleanup();
  }
});
