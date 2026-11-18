// Avisos al crear signupPings/{id}. Manda el push y borra el aviso.
// Si no hay tokens, igual lo borra. En futbol-partidos los links van a la
// app publicada. En mis-partidos-prueba, a /prueba/. Región southamerica-east1.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const crypto = require('crypto');
const { pushCopy, organizerUids, pushFields, actionDecision, ACTION_TTL_MS } = require('./logic');

initializeApp();

function cloudProject() {
  return String(process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.GCP_PROJECT || '');
}

exports.notifySelfSignup = onDocumentCreated(
  { document: 'signupPings/{pingId}', region: 'southamerica-east1' },
  async (event) => {
    const ping = event.data?.data() || null;
    const db = getFirestore();
    const ref = event.data?.ref;
    if (!ping || !ping.kind || !ping.matchId) {
      if (ref) await ref.delete().catch(() => {});
      return;
    }
    if (ping.kind === 'confirmado') {
      const rosterId = String(ping.rosterId || '');
      const tokens = [];
      if (rosterId) {
        const found = await db.collection('playerTokens').where('rosterId', '==', rosterId).get();
        found.forEach((doc) => {
          const token = String(doc.data()?.token || '');
          if (token) tokens.push({ token, ref: doc.ref });
        });
      }
      const matchSnap = await db.doc(`matches/${ping.matchId}`).get();
      const match = matchSnap.exists ? { id: ping.matchId, ...matchSnap.data() } : {
        id: ping.matchId,
        date: ping.date || '',
        time: ping.time || '',
        venueName: ping.venueName || '',
      };
      const copy = pushCopy('confirmado', { name: ping.name, rosterId }, match, cloudProject());
      if (tokens.length) {
        const res = await getMessaging().sendEachForMulticast({
          tokens: tokens.map((row) => row.token),
          data: pushFields('confirmado', copy, { tag: `confirm-${event.params.pingId}` }),
        });
        const dead = [];
        res.responses.forEach((row, index) => {
          const code = row.error?.code || '';
          if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
            dead.push(tokens[index].ref.delete().catch(() => {}));
          }
        });
        await Promise.all(dead);
      }
      if (ref) await ref.delete().catch(() => {});
      return;
    }
    const matchSnap = await db.doc(`matches/${ping.matchId}`).get();
    const match = matchSnap.exists ? { id: ping.matchId, ...matchSnap.data() } : {
      id: ping.matchId,
      date: ping.date || '',
      time: ping.time || '',
      venueName: ping.venueName || '',
    };
    let holders = [];
    if (ping.rosterId) {
      const roster = await db.doc(`roster/${ping.rosterId}`).get();
      holders = roster.exists ? roster.data()?.holders || [] : [];
    }
    const uids = organizerUids(match, holders, ping.organizerUid);
    const tokens = [];
    for (let i = 0; i < uids.length; i += 10) {
      const slice = uids.slice(i, i + 10);
      if (!slice.length) continue;
      const found = await db.collection('organizerTokens').where('uid', 'in', slice).get();
      found.forEach((doc) => {
        const token = String(doc.data()?.token || '');
        if (token) tokens.push({ token, ref: doc.ref });
      });
    }
    const project = cloudProject();
    const copy = pushCopy(ping.kind, { name: ping.name }, match, project);
    let actionToken = '';
    const playerId = String(ping.playerId || '');
    if (ping.kind === 'alta' && playerId) {
      actionToken = crypto.randomBytes(32).toString('hex');
      await db.doc(`signupActions/${actionToken}`).set({
        playerId,
        matchId: ping.matchId,
        used: false,
        createdAt: Date.now(),
        expiresAt: Date.now() + ACTION_TTL_MS,
      });
    }
    if (tokens.length) {
      const res = await getMessaging().sendEachForMulticast({
        tokens: tokens.map((row) => row.token),
        data: pushFields(ping.kind, copy, { actionToken, playerId, tag: `signup-${event.params.pingId}`, project }),
      });
      const dead = [];
      res.responses.forEach((row, index) => {
        const code = row.error?.code || '';
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          dead.push(tokens[index].ref.delete().catch(() => {}));
        }
      });
      await Promise.all(dead);
    }
    if (ref) await ref.delete().catch(() => {});
  },
);

exports.decideSignup = onRequest({ region: 'southamerica-east1', cors: true, invoker: 'public' }, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST' });
    return;
  }
  const token = String(req.body?.token || '');
  const decision = String(req.body?.decision || '');
  if (!/^[a-f0-9]{64}$/.test(token)) {
    res.status(400).json({ ok: false, error: 'token' });
    return;
  }
  const db = getFirestore();
  const actionRef = db.doc(`signupActions/${token}`);
  try {
    const preview = await actionRef.get();
    const previewAction = preview.exists ? preview.data() : null;
    let spotsLeft = 1;
    if (decision === 'aceptar' && previewAction?.playerId) {
      const peek = await db.doc(`players/${previewAction.playerId}`).get();
      const matchId = peek.data()?.matchId;
      if (matchId) {
        const mates = await db.collection('players').where('matchId', '==', matchId).get();
        const matchSnap = await db.doc(`matches/${matchId}`).get();
        const cap = Number(matchSnap.data()?.capacity) > 0 ? Number(matchSnap.data().capacity) : 14;
        const taken = mates.docs.filter((doc) => {
          const row = doc.data() || {};
          return row.waiting !== true && row.noPlay !== true && row.selfPending !== true;
        }).length;
        spotsLeft = cap - taken;
      }
    }
    const outcome = await db.runTransaction(async (tx) => {
      const actionSnap = await tx.get(actionRef);
      const action = actionSnap.exists ? actionSnap.data() : null;
      const playerRef = action?.playerId ? db.doc(`players/${action.playerId}`) : null;
      const playerSnap = playerRef ? await tx.get(playerRef) : null;
      const player = playerSnap?.exists ? { id: action.playerId, ...playerSnap.data() } : null;
      const result = actionDecision(action, player, decision, Date.now(), spotsLeft);
      if (!result.ok) return result;
      tx.update(actionRef, { used: true, usedAt: Date.now(), decision });
      if (result.op === 'delete') tx.delete(playerRef);
      else tx.update(playerRef, { tentative: null, tentativeAt: null, updatedAt: Date.now() });
      return {
        ...result,
        matchId: player.matchId,
        confirmToken: player.confirmToken || '',
        playerName: player.name || '',
        rosterId: player.rosterId || '',
      };
    });
    if (!outcome.ok) {
      res.status(outcome.status || 409).json({ ok: false, error: outcome.error });
      return;
    }
    if (outcome.op === 'delete') {
      if (outcome.confirmToken) await db.doc(`confirmations/${outcome.confirmToken}`).delete().catch(() => {});
      if (outcome.matchId) {
        await db.doc(`matches/${outcome.matchId}`).update({
          playerCount: FieldValue.increment(-1),
          updatedAt: Date.now(),
        }).catch(() => {});
      }
    }
    if (outcome.matchId) {
      const matchSnap = await db.doc(`matches/${outcome.matchId}`).get();
      const match = matchSnap.exists ? matchSnap.data() : {};
      const when = [match.date || '', match.time || ''].filter(Boolean).join(' · ');
      await db.collection('log').add({
        at: Date.now(),
        actorUid: 'aviso',
        actorName: 'Desde el aviso',
        section: 'partidos',
        type: decision === 'aceptar' ? 'aceptó' : 'rechazó',
        matchId: outcome.matchId,
        matchDate: String(match.date || ''),
        matchTime: String(match.time || ''),
        matchLabel: String(when || 'Partido').slice(0, 160),
        editors: ['*'],
        playerName: String(outcome.playerName || '').slice(0, 80),
        hostName: '',
        detail: decision === 'aceptar' ? 'Aceptó la anotación' : 'Rechazó la anotación',
        amount: 0,
        method: '',
        rosterId: String(outcome.rosterId || ''),
      }).catch(() => {});
      if (outcome.op === 'confirm' && outcome.rosterId) {
        await db.collection('signupPings').add({
          kind: 'confirmado',
          name: String(outcome.playerName || '').slice(0, 60),
          playerId: String(outcome.playerId || previewAction?.playerId || ''),
          rosterId: String(outcome.rosterId || ''),
          matchId: String(outcome.matchId || ''),
          date: String(match.date || ''),
          time: String(match.time || ''),
          venueName: String(match.venueName || 'Polideportivo Colegiales').slice(0, 80),
          createdAt: Date.now(),
          organizerUid: '',
          shareToken: '',
        }).catch(() => {});
      }
    }
    res.status(200).json({ ok: true, op: outcome.op });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'no se pudo' });
  }
});
