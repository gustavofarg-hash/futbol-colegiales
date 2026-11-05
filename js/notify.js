// Avisos de lo que hace otro organizador. Puro: no escribe en Firestore.
// Solo anotar, dar de baja y crear un partido. Nunca la acción propia.
// Si el partido sigue cargado, hace falta poder verlo (el dueño puede).
// Si ya no está, vale el acceso que se copió en el registro.
import { canView } from './access.js';
import { canSeeLog } from './log.js';

export const ACTIVITY_TYPES = ['nuevo partido', 'alta', 'baja'];

export function activityNoticeText(entry) {
  const who = String(entry?.actorName || '').trim() || 'Otro organizador';
  const match = String(entry?.matchLabel || '').trim() || 'un partido';
  const player = String(entry?.playerName || '').trim() || 'un jugador';
  const extra = String(entry?.detail || '').trim();
  if (entry?.type === 'nuevo partido') return `${who} creó un partido · ${match}`;
  if (entry?.type === 'alta') return [`${who} anotó a ${player}`, extra, match].filter(Boolean).join(' · ');
  if (entry?.type === 'baja') return [`${who} dio de baja a ${player}`, extra, match].filter(Boolean).join(' · ');
  return '';
}

/** Ver, editar o ser el dueño. Un partido abierto lo ve cualquiera. */
export function canHearMatch(match, uid) {
  if (!match || !uid) return false;
  return canView(match, uid) || match.createdByUid === uid;
}

export function activityNotices(entries, { uid, since = 0, matches = [] } = {}) {
  const byId = new Map((matches || []).filter((match) => match?.id).map((match) => [match.id, match]));
  return (entries || []).filter((entry) => {
    if (!ACTIVITY_TYPES.includes(entry?.type)) return false;
    if (entry.section && entry.section !== 'partidos') return false;
    const actor = String(entry.actorUid || '').trim();
    if (!actor || !uid || actor === uid) return false;
    if (!(Number(entry.at) > Number(since))) return false;
    const match = byId.get(entry.matchId);
    if (match) return canHearMatch(match, uid);
    return canSeeLog(entry, uid);
  }).sort((a, b) => (b.at || 0) - (a.at || 0) || String(b.id).localeCompare(String(a.id)));
}
