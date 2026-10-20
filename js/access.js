// Quién ve y quién anota en un partido. Puro: lo usan la app, el store y las pruebas.
// Un partido sin `viewers` es de todos (los de antes). `*` en la lista también es todos.
// El límite cuenta titulares y lista de espera. Las reglas no pueden contarlos: lo frena la app.
import { sameOrganizer } from './organizers.js';

export const EVERYONE = '*';

export function isRestricted(match) {
  const viewers = match?.viewers;
  return Array.isArray(viewers) && viewers.length > 0 && !viewers.includes(EVERYONE);
}

export function canView(match, uid) {
  if (!match) return false;
  if (!isRestricted(match)) return true;
  if (!uid) return false;
  return match.viewers.includes(uid) || match.createdByUid === uid;
}

export function canAdd(match, uid) {
  if (!canView(match, uid)) return false;
  const adders = match?.adders;
  if (!Array.isArray(adders) || !adders.length || adders.includes(EVERYONE)) return true;
  return !!uid && (adders.includes(uid) || match.createdByUid === uid);
}

/** Fecha, hora y nota. Quien no puede anotar lo ve en solo lectura. */
export function canEditMatch(match, uid) {
  return canAdd(match, uid);
}

/** Los permisos los cambia solo quien creó el partido. */
export function canEditAccess(match, uid) {
  return !!match && !!uid && match.createdByUid === uid;
}

/** En un partido restringido borra solo el creador. En uno abierto, quien puede anotar. */
export function canDelete(match, uid) {
  if (!match) return false;
  if (isRestricted(match)) return !!uid && match.createdByUid === uid;
  return canAdd(match, uid);
}

export function limitFor(match, uid) {
  if (!uid) return null;
  const rows = Array.isArray(match?.limits) ? match.limits : [];
  const row = rows.find((item) => item && item.uid === uid);
  if (!row || row.max == null || row.max === '') return null;
  const max = Number(row.max);
  return Number.isInteger(max) && max >= 0 ? max : null;
}

/** Titulares y lista de espera. Si el jugador tiene uid, manda el uid; si no, el nombre. */
export function addedCount(players, actor) {
  const uid = actor?.uid || '';
  const name = actor?.name || '';
  return (players || []).filter((player) => {
    if (uid && player?.addedByUid) return player.addedByUid === uid;
    return !!name && sameOrganizer(player?.addedBy, name);
  }).length;
}

export function limitMessage(max) {
  return `Llegaste a tu límite de ${max} jugadores en este partido`;
}

function unique(ids) {
  const out = [];
  for (const id of ids || []) {
    const clean = String(id || '').trim();
    if (clean && !out.includes(clean)) out.push(clean);
  }
  return out;
}

function namesFor(ids, staff, creator) {
  return ids.filter((uid) => uid !== EVERYONE).map((uid) => {
    const person = (staff || []).find((item) => item.uid === uid);
    const name = person?.name || (uid === creator?.uid ? creator.name : '');
    return name ? { uid, name } : null;
  }).filter(Boolean);
}

/**
 * Arma los campos que se guardan en el partido.
 * Solo yo: viewers y adders quedan en el creador. Si no, los que anotan son un subconjunto de los que ven.
 */
export function buildAccess({ solo, viewerIds, adderIds, limits, staff, creator }) {
  const me = { uid: String(creator?.uid || '').trim(), name: String(creator?.name || '').trim() };
  if (!me.uid) {
    return { solo: false, viewers: [EVERYONE], viewerNames: [], adders: [EVERYONE], adderNames: [], limits: [], createdByUid: '' };
  }
  if (solo) {
    return {
      solo: true,
      viewers: [me.uid],
      viewerNames: [{ uid: me.uid, name: me.name || me.uid }],
      adders: [me.uid],
      adderNames: [{ uid: me.uid, name: me.name || me.uid }],
      limits: [],
      createdByUid: me.uid,
    };
  }
  const known = new Set((staff || []).map((item) => item.uid).filter(Boolean));
  known.add(me.uid);
  const staffIds = [...known];
  let viewers = unique(viewerIds).filter((uid) => uid === EVERYONE || known.has(uid));
  if (!viewers.includes(me.uid) && !viewers.includes(EVERYONE)) viewers.unshift(me.uid);
  if (!viewers.length || viewers.includes(EVERYONE) || staffIds.every((uid) => viewers.includes(uid))) viewers = [EVERYONE];
  let adders = unique(adderIds).filter((uid) => uid === EVERYONE || known.has(uid));
  if (viewers.includes(EVERYONE)) {
    if (!adders.length || adders.includes(EVERYONE) || staffIds.every((uid) => adders.includes(uid))) adders = [EVERYONE];
    else if (!adders.includes(me.uid)) adders.unshift(me.uid);
  } else {
    adders = adders.filter((uid) => viewers.includes(uid));
    if (!adders.includes(me.uid)) adders.unshift(me.uid);
    if (viewers.every((uid) => adders.includes(uid))) adders = viewers.slice();
  }
  const allowed = new Set(adders.includes(EVERYONE) ? [...known] : adders);
  const cleanLimits = [];
  for (const row of limits || []) {
    const uid = String(row?.uid || '').trim();
    if (!uid || uid === EVERYONE || !allowed.has(uid)) continue;
    if (row.max == null || row.max === '') continue;
    const max = Number(row.max);
    if (!Number.isInteger(max) || max < 0 || max > 100) continue;
    cleanLimits.push({ uid, max });
  }
  return {
    solo: false,
    viewers,
    viewerNames: namesFor(viewers, staff, me),
    adders,
    adderNames: namesFor(adders, staff, me),
    limits: cleanLimits,
    createdByUid: me.uid,
  };
}

export function publicAccess(creator) {
  return buildAccess({
    solo: false,
    viewerIds: [EVERYONE],
    adderIds: [EVERYONE],
    limits: [],
    staff: creator?.uid ? [creator] : [],
    creator,
  });
}

export function accessPatch(access) {
  if (!access) return {};
  return {
    solo: access.solo === true,
    viewers: access.viewers,
    viewerNames: access.viewerNames || [],
    adders: access.adders,
    adderNames: access.adderNames || [],
    limits: access.limits || [],
    createdByUid: access.createdByUid || '',
  };
}

/** Lo que se copia al jugador y a la ficha para que la consulta de Firestore sea válida. */
export function playerAccess(match) {
  const viewers = Array.isArray(match?.viewers) && match.viewers.length ? match.viewers : [EVERYONE];
  const adders = Array.isArray(match?.adders) && match.adders.length ? match.adders : [EVERYONE];
  return { viewers, adders };
}
