// Saldo a favor en credits/{id}. No toca el update de players.
// Se salta si no hay emulador. Con el emulador:
//   firebase emulators:exec --project demo-f7c --only firestore "node --test tests/rules-credit.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('un organizador carga y descuenta crédito; un monto negativo no entra', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
  const { doc, setDoc, getDoc, deleteDoc, updateDoc } = await import('firebase/firestore');
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostname, portRaw] = host.split(':');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-f7c-credit',
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
    const db = testEnv.authenticatedContext('org-uid', { email: 'martin@demo.local' }).firestore();
    const id = 'org-uid__p:ana';
    const credit = {
      personKey: 'p:ana', organizerUid: 'org-uid', organizerName: 'Martín',
      amount: 2000, name: 'Ana', updatedAt: 1, updatedBy: 'Martín',
    };
    await assertSucceeds(setDoc(doc(db, 'credits', id), credit));
    await assertSucceeds(setDoc(doc(db, 'credits', id), { ...credit, amount: 500 }));
    await assertFails(setDoc(doc(db, 'credits', id), { ...credit, amount: -1 }));
    await assertFails(setDoc(doc(db, 'credits', id), { ...credit, personKey: '' }));
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'credits', id)));
    await assertSucceeds(deleteDoc(doc(db, 'credits', id)));
    assert.equal((await getDoc(doc(db, 'credits', id))).exists(), false);
    await assertSucceeds(setDoc(doc(db, 'matches', 'm1'), { date: '2026-10-22', time: '21:00', note: '' }));
    const person = {
      matchId: 'm1', matchDate: '2026-10-22', phone: '',
      addedBy: 'Martín', addedByUid: 'org-uid', createdAt: 1, updatedAt: 1,
      viewers: ['*'], adders: ['*'],
    };
    await assertSucceeds(setDoc(doc(db, 'players', 'host'), { ...person, name: 'Ernesto', confirmToken: 'h'.repeat(24) }));
    await assertSucceeds(setDoc(doc(db, 'players', 'guest'), {
      ...person, name: 'Invitado 1', confirmToken: 'g'.repeat(24),
      invitedBy: 'host', invitedByName: 'Ernesto', guestAuto: true,
    }));
    const pay = {
      paid: true, amount: 1500, method: 'credito', cash: 0, transfer: 0, pendingTransfer: null,
      fromCredit: 1500, creditTo: 'Martín', cashTo: null, transferTo: null, pendingTo: null, transferParts: null,
      receivedBy: 'Martín', freePlay: false, paidUpdatedBy: 'Martín', paidUpdatedAt: 4,
      transferReceivedAt: null, transferReceivedBy: null, updatedAt: 4,
    };
    await assertSucceeds(updateDoc(doc(db, 'players', 'guest'), pay));
    await assertFails(updateDoc(doc(db, 'players', 'guest'), { fromCredit: -5 }));
  } finally {
    await testEnv.cleanup();
  }
});
