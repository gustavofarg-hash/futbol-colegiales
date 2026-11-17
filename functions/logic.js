// Qué aviso mandar cuando un jugador se anota solo. Lo usa la Cloud Function.
// No importa Firebase: las pruebas lo pueden cargar directo.

function classifySelfSignup(before, after) {
  if (!before && after?.selfPending === true) return 'alta';
  if (!before && after?.selfSignup === true && after?.waiting === true && after?.selfPending !== true) return 'espera';
  return '';
}

function dayLabel(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return '';
  return `${Number(match[3])}/${match[2]}`;
}

function pushCopy(kind, player, match) {
  const name = String(player?.name || '').trim() || 'Un jugador';
  const when = [dayLabel(match?.date), match?.time || '', String(match?.venueName || 'Polideportivo Colegiales').trim()]
    .filter(Boolean)
    .join(' · ');
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
    url: `https://gustavofarg-hash.github.io/futbol-colegiales/prueba/${hash}`,
  };
}

function organizerUids(match, holders) {
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

module.exports = { classifySelfSignup, pushCopy, organizerUids, dayLabel };
