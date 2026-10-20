// Quién puede cambiar los datos de un jugador (nombre, WhatsApp, nivel,
// posiciones, notas). No es el acceso al partido: pagar, confirmar, la espera
// y los equipos siguen en quien ya podía anotar.
import { sameOrganizer } from './organizers.js';

export const EDIT_LOCK_TEXT = 'Solo lo puede editar el organizador que lo agregó';

export function editLockedError() {
  return Object.assign(new Error(EDIT_LOCK_TEXT), { code: 'edit-locked' });
}

/**
 * El uid del creador manda. Si el jugador es viejo y no tiene uid, alcanza
 * con que el nombre guardado sea el del organizador actual (sin tildes ni
 * mayúsculas). Sin uid y sin nombre, nadie lo edita. El admin no es excepción.
 */
export function canEditCreated(record, actor, uidKey, nameKey) {
  if (!record) return false;
  const uid = String(actor?.uid || '');
  const storedUid = String(record[uidKey] || '').trim();
  if (storedUid) return storedUid === uid;
  const storedName = String(record[nameKey] || '').trim();
  if (!storedName) return false;
  return sameOrganizer(storedName, actor?.name);
}

export function canEditPlayer(player, actor) {
  return canEditCreated(player, actor, 'addedByUid', 'addedBy');
}

export function canEditRoster(person, actor) {
  return canEditCreated(person, actor, 'createdByUid', 'createdBy');
}

/** Nombre distinto o un teléfono nuevo. rosterId, pago y espera no cuentan. */
export function playerPatchEditsIdentity(data, player) {
  if (!data || typeof data !== 'object') return false;
  if ('phone' in data) return true;
  if ('name' in data && String(data.name ?? '').trim() !== String(player?.name ?? '').trim()) return true;
  return false;
}
