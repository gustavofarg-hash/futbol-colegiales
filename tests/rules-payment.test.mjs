// Reglas de los campos de pago partido. No toca el proyecto futbol-partidos.
// Se salta si no hay emulador. Con el emulador:
//   firebase emulators:exec --project demo-f7c --only firestore "node --test tests/rules-payment.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MATCH = '2026-10-22_2100';

test('efectivo, transferencia y transfiere después: tipos y montos', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
  const { doc, setDoc, updateDoc } = await import('firebase/firestore');

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
    const db = testEnv.authenticatedContext('org-uid', { email: 'martin@demo.local' }).firestore();
    await assertSucceeds(setDoc(doc(db, 'matches', MATCH), { date: '2026-10-22', time: '21:00', note: '' }));
    const player = {
      matchId: MATCH, matchDate: '2026-10-22', name: 'Ana Hoy', phone: '5491155550101',
      addedBy: 'Martín', createdAt: 1, updatedAt: 1,
    };
    await assertSucceeds(setDoc(doc(db, 'players', 'old'), {
      ...player, paid: true, amount: 5000, method: 'transferencia', receivedBy: 'Martín', paidUpdatedBy: 'Martín', paidUpdatedAt: 2,
    }));
    await assertSucceeds(setDoc(doc(db, 'players', 'split'), {
      ...player,
      name: 'Ana Split',
      paid: true,
      amount: 5000,
      method: null,
      cash: 2000,
      transfer: 3000,
      pendingTransfer: 1500,
      transferReceivedAt: null,
      transferReceivedBy: null,
      receivedBy: 'Martín',
      paidUpdatedBy: 'Gustavo',
      paidUpdatedAt: 3,
    }));
    await assertFails(updateDoc(doc(db, 'players', 'split'), { cash: -1 }));
    await assertFails(updateDoc(doc(db, 'players', 'split'), { cash: '2000' }));
    await assertFails(updateDoc(doc(db, 'players', 'split'), { pendingTransfer: -5 }));
    await assertSucceeds(updateDoc(doc(db, 'players', 'split'), {
      cash: 2000, transfer: 4500, pendingTransfer: null, amount: 6500, transferReceivedAt: 9, transferReceivedBy: 'Gustavo',
    }));
    await assertSucceeds(updateDoc(doc(db, 'players', 'split'), { cashTo: 'Gustavo', transferTo: 'Martín', pendingTo: 'Gustavo' }));
    await assertFails(updateDoc(doc(db, 'players', 'split'), { cashTo: 'x'.repeat(41) }));
    await assertSucceeds(updateDoc(doc(db, 'players', 'split'), {
      transferParts: [{ to: 'Martín', amount: 3000 }, { to: 'Gustavo', amount: 1500 }],
    }));
    await assertFails(updateDoc(doc(db, 'players', 'split'), { transferParts: [{ to: 'Martín', amount: -1 }] }));
    await assertSucceeds(setDoc(doc(db, 'settings', 'prices'), { matchPrice: 5000, promo2Price: 9000, promo3Price: 12000 }));
    await assertFails(setDoc(doc(db, 'settings', 'prices'), { matchPrice: -1, promo2Price: 9000, promo3Price: 12000 }));
    await assertFails(setDoc(doc(db, 'settings', 'prices'), { matchPrice: 5000.5, promo2Price: 9000, promo3Price: 12000 }));
    const anon = testEnv.unauthenticatedContext().firestore();
    await assertFails(setDoc(doc(anon, 'settings', 'prices'), { matchPrice: 1, promo2Price: 1, promo3Price: 1 }));
  } finally {
    await testEnv.cleanup();
  }
});
