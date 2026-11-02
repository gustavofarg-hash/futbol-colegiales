// El mismo WhatsApp: B se suma a la ficha de A, y B funde su ficha en la de A.
//   firebase emulators:exec --project demo-f7c --only firestore "node --test tests/rules-link.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { phoneKey } from '../js/privacy.js';

const PHONE = '5491112345678';
const KEY = phoneKey(PHONE);

function userDoc(name, email) {
  return { role: 'organizer', name, email, active: true, createdAt: 1 };
}

function rosterOf(uid, name) {
  return {
    name,
    createdBy: name,
    createdByUid: uid,
    createdAt: 1,
    updatedAt: 1,
    hasPhone: true,
    phoneKey: KEY,
    phoneOwnerUid: uid,
    phoneShared: false,
    holders: [uid],
  };
}

test('B vincula y funde el WhatsApp de A sin haber leído el teléfono', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, query, collection, where, deleteField } = await import('firebase/firestore');
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
    await assertSucceeds(setDoc(doc(admin.firestore(), 'users', 'uid-a'), userDoc('Gustavo', 'gustavo@demo.local')));
    await assertSucceeds(setDoc(doc(admin.firestore(), 'users', 'uid-b'), userDoc('Martín', 'martin@demo.local')));
    const a = testEnv.authenticatedContext('uid-a', { email: 'gustavo@demo.local' });
    const b = testEnv.authenticatedContext('uid-b', { email: 'martin@demo.local' });
    const aDb = a.firestore();
    const bDb = b.firestore();

    await assertSucceeds(setDoc(doc(aDb, 'roster', 'card-a'), rosterOf('uid-a', 'Juan')));
    await assertSucceeds(setDoc(doc(aDb, 'rosterContacts', 'card-a'), {
      phone: PHONE, ownerUid: 'uid-a', visibleToAll: false, phoneKey: KEY, readers: ['uid-a'],
    }));

    const found = await getDocs(query(collection(bDb, 'roster'), where('phoneKey', '==', KEY)));
    assert.equal(found.docs[0]?.id, 'card-a');
    await assertFails(getDoc(doc(bDb, 'rosterContacts', 'card-a')));

    const claimId = 'card-a_uid-b';
    await assertFails(setDoc(doc(bDb, 'rosterClaims', claimId), { phone: '5491100000000', rosterId: 'card-a' }));
    await assertSucceeds(setDoc(doc(bDb, 'rosterClaims', claimId), { phone: PHONE, rosterId: 'card-a' }));
    const peeked = await getDoc(doc(bDb, 'rosterContacts', 'card-a'));
    assert.equal(peeked.data().phone, PHONE);
    await assertFails(updateDoc(doc(bDb, 'roster', 'card-a'), {
      holders: ['uid-b'],
      name: 'Juan de Martín',
      updatedAt: Date.now(),
    }));
    await assertSucceeds(updateDoc(doc(bDb, 'roster', 'card-a'), {
      holders: ['uid-a', 'uid-b'],
      name: 'Juan de Martín',
      shortName: deleteField(),
      updatedAt: Date.now(),
    }));
    const readers = peeked.data().readers || [];
    await assertFails(updateDoc(doc(bDb, 'rosterContacts', 'card-a'), { readers: ['uid-b'] }));
    await assertSucceeds(updateDoc(doc(bDb, 'rosterContacts', 'card-a'), {
      readers: readers.includes('uid-b') ? readers : [...readers, 'uid-b'],
    }));
    await assertSucceeds(deleteDoc(doc(bDb, 'rosterClaims', claimId)));
    const linked = await getDoc(doc(bDb, 'roster', 'card-a'));
    assert.equal(linked.exists(), true);
    assert.deepEqual(linked.data().holders, ['uid-a', 'uid-b']);
    assert.equal(linked.data().name, 'Juan de Martín');
    const contact = await getDoc(doc(bDb, 'rosterContacts', 'card-a'));
    assert.equal(contact.data().phone, PHONE);
    assert.ok(contact.data().readers.includes('uid-a'));
    assert.ok(contact.data().readers.includes('uid-b'));

    await testEnv.clearFirestore();
    await assertSucceeds(setDoc(doc(admin.firestore(), 'users', 'admin-uid'), {
      role: 'admin', name: 'Gustavo', email: 'gustavof.arg@gmail.com', active: true, createdAt: 1,
    }));
    await assertSucceeds(setDoc(doc(admin.firestore(), 'users', 'uid-a'), userDoc('Gustavo', 'gustavo@demo.local')));
    await assertSucceeds(setDoc(doc(admin.firestore(), 'users', 'uid-b'), userDoc('Martín', 'martin@demo.local')));
    await assertSucceeds(setDoc(doc(aDb, 'roster', 'card-a'), rosterOf('uid-a', 'Juan')));
    await assertSucceeds(setDoc(doc(aDb, 'rosterContacts', 'card-a'), {
      phone: PHONE, ownerUid: 'uid-a', visibleToAll: false, phoneKey: KEY, readers: ['uid-a'],
    }));
    await assertSucceeds(setDoc(doc(bDb, 'roster', 'card-b'), {
      name: 'Pedro', createdBy: 'Martín', createdByUid: 'uid-b', createdAt: 1, updatedAt: 1,
      hasPhone: false, phoneKey: '', phoneOwnerUid: 'uid-b', phoneShared: false, holders: ['uid-b'],
    }));
    await assertSucceeds(setDoc(doc(bDb, 'rosterNotes', 'card-b_uid-b'), {
      ownerUid: 'uid-b', rosterId: 'card-b',
      notes: [{ id: 'n1', matchId: 'm1', text: 'nota de Martín', createdAt: 1, authorUid: 'uid-b' }],
    }));
    await assertSucceeds(setDoc(doc(bDb, 'rosterClaims', claimId), { phone: PHONE, rosterId: 'card-a' }));
    const mergeContact = await getDoc(doc(bDb, 'rosterContacts', 'card-a'));
    await assertSucceeds(updateDoc(doc(bDb, 'roster', 'card-a'), {
      holders: ['uid-a', 'uid-b'],
      name: 'Juan de Martín',
      shortName: 'Compa',
      updatedAt: Date.now(),
    }));
    const mergeReaders = mergeContact.data().readers || [];
    await assertSucceeds(updateDoc(doc(bDb, 'rosterContacts', 'card-a'), {
      readers: mergeReaders.includes('uid-b') ? mergeReaders : [...mergeReaders, 'uid-b'],
    }));
    await assertSucceeds(setDoc(doc(bDb, 'rosterNotes', 'card-a_uid-b'), {
      ownerUid: 'uid-b', rosterId: 'card-a',
      notes: [{ id: 'n1', matchId: 'm1', text: 'nota de Martín', createdAt: 1, authorUid: 'uid-b' }],
    }));
    await assertSucceeds(deleteDoc(doc(bDb, 'rosterNotes', 'card-b_uid-b')));
    await assertSucceeds(setDoc(doc(bDb, 'rosterRedirects', 'card-b'), { intoId: 'card-a' }));
    await assertSucceeds(deleteDoc(doc(bDb, 'roster', 'card-b')));
    await assertSucceeds(deleteDoc(doc(bDb, 'rosterClaims', claimId)));
    const kept = await getDoc(doc(bDb, 'roster', 'card-a'));
    assert.equal(kept.data().name, 'Juan de Martín');
    assert.equal(kept.data().shortName, 'Compa');
    assert.equal((await getDoc(doc(bDb, 'roster', 'card-b'))).exists(), false);
    const note = await getDoc(doc(bDb, 'rosterNotes', 'card-a_uid-b'));
    assert.equal(note.data().notes[0].text, 'nota de Martín');
    await assertFails(getDoc(doc(aDb, 'rosterNotes', 'card-a_uid-b')));
  } finally {
    await testEnv.cleanup();
  }
});
