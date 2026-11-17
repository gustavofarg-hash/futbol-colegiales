// Qué aviso mandar cuando un jugador se anota solo. Lo usa la Cloud Function.
// No importa Firebase: las pruebas lo pueden cargar directo.

function classifySelfSignup(before, after) {
  if (!before && after?.selfSignup === true && after?.tentative === true && after?.waiting !== true) return 'alta';
  if (!before && after?.selfSignup === true && after?.waiting === true) return 'espera';
  return '';
}

function dayLabel(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return '';
  return `${Number(match[3])}/${match[2]}`;
}

const DAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

function weekdayName(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return '';
  const utc = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  const name = DAYS[utc.getUTCDay()] || '';
  return name ? name.charAt(0).toUpperCase() + name.slice(1) : '';
}

function pushCopy(kind, player, match) {
  const name = String(player?.name || '').trim() || 'Un jugador';
  const place = String(match?.venueName || 'Polideportivo Colegiales').trim() || 'Polideportivo Colegiales';
  const base = 'https://gustavofarg-hash.github.io/futbol-colegiales/prueba/';
  if (kind === 'confirmado') {
    const day = [weekdayName(match?.date), dayLabel(match?.date)].filter(Boolean).join(' ');
    const when = [day, match?.time || ''].filter(Boolean).join(' ');
    const rosterId = encodeURIComponent(String(player?.rosterId || ''));
    return {
      title: 'Mis Partidos',
      body: `¡Te confirmaron para el ${when} en ${place}!`,
      url: `${base}#/jugador/${rosterId}`,
    };
  }
  const when = [dayLabel(match?.date), match?.time || '', place].filter(Boolean).join(' · ');
  const verb = kind === 'alta'
    ? 'se anotó y espera confirmación'
    : kind === 'espera'
      ? 'entró en la lista de espera'
      : 'se bajó';
  const id = encodeURIComponent(String(match?.id || ''));
  const hash = kind === 'alta' ? '#/a-confirmar' : `#/partido/${id}`;
  return {
    title: 'Mis Partidos',
    body: `${name} ${verb}. ${when}`,
    url: `${base}${hash}`,
  };
}

function organizerUids(match, holders, onlyUid) {
  const only = String(onlyUid || '').trim();
  if (only) return [only];
  const ids = [];
  const created = String(match?.createdByUid || '').trim();
  if (created) ids.push(created);
  for (const id of match?.adders || []) {
    const uid = String(id || '').trim();
    if (uid && uid !== '*') ids.push(uid);
  }
  if (!ids.length) {
    for (const id of holders || []) {
      const uid = String(id || '').trim();
      if (uid) ids.push(uid);
    }
  }
  return [...new Set(ids)];
}

const DECIDE_URL = 'https://southamerica-east1-mis-partidos-prueba.cloudfunctions.net/decideSignup';
const ACTION_TTL_MS = 12 * 60 * 60 * 1000;

/** Datos del push. El alta lleva el token para Aceptar o Rechazar sin abrir la app. */
function pushFields(kind, copy, extra = {}) {
  const data = {
    title: copy.title,
    body: copy.body,
    url: copy.url,
    icon: 'icons/icon-192.png',
    kind: String(kind || ''),
    tag: String(extra.tag || ''),
  };
  if (kind === 'alta' && extra.actionToken && extra.playerId) {
    data.actionToken = String(extra.actionToken);
    data.playerId = String(extra.playerId);
    data.decideUrl = DECIDE_URL;
  }
  return data;
}

/** Botones del aviso. Vacío si no es un alta o si no hay token: el toque abre la pestaña. */
function noticeActions(data) {
  if (data?.kind !== 'alta' || !data.actionToken || !data.decideUrl) return [];
  return [
    { action: 'aceptar', title: 'Aceptar' },
    { action: 'rechazar', title: 'Rechazar' },
  ];
}

/**
 * Si el token de un solo uso puede aceptar o rechazar ese pendiente.
 * spotsLeft es cuántos lugares quedan en la lista.
 */
function actionDecision(doc, player, decision, now, spotsLeft) {
  if (!doc) return { ok: false, status: 404, error: 'no existe' };
  if (doc.used === true) return { ok: false, status: 410, error: 'ya se usó' };
  if (!(Number(doc.expiresAt) > Number(now))) return { ok: false, status: 410, error: 'venció' };
  if (decision !== 'aceptar' && decision !== 'rechazar') return { ok: false, status: 400, error: 'decisión' };
  if (!player || player.tentative !== true || String(player.id || '') !== String(doc.playerId || '')) {
    return { ok: false, status: 409, error: 'ya no está pendiente' };
  }
  if (decision === 'rechazar') return { ok: true, op: 'delete' };
  return { ok: true, op: 'confirm' };
}

module.exports = {
  classifySelfSignup, pushCopy, organizerUids, dayLabel,
  pushFields, noticeActions, actionDecision, DECIDE_URL, ACTION_TTL_MS,
};
