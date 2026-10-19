// Normalización de números de teléfono argentinos al formato que usa wa.me
// Ej: "11 1234-5678" -> "5491112345678"

/**
 * Devuelve { ok, wa, display, error }
 *  - wa: solo dígitos, listo para https://wa.me/<wa>
 *  - display: formato legible (+54 9 11 1234-5678)
 */
export function normalizePhone(input, { defaultArea = '11' } = {}) {
  const raw = String(input || '').trim();
  if (!raw) return { ok: false, error: 'Ingresá un número' };
  const hasPlus = raw.startsWith('+');
  let d = raw.replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);

  let national;
  if (d.startsWith('54') && (hasPlus || d.length >= 12)) {
    national = d.slice(2);
    if (national.startsWith('9')) national = national.slice(1);
    national = national.replace(/^0/, '');
  } else if (hasPlus) {
    // Número internacional no argentino: se deja tal cual
    if (d.length < 8 || d.length > 15) return { ok: false, error: 'Número inválido' };
    return { ok: true, wa: d, display: '+' + d };
  } else {
    national = d.replace(/^0/, '');
  }

  // Quitar el "15" de celulares escritos a la antigua (011 15 1234-5678)
  if (national.length === 12) {
    const areaLens = national.startsWith('11') ? [2, 3, 4] : [3, 4, 2];
    for (const n of areaLens) {
      if (national.substr(n, 2) === '15') { national = national.slice(0, n) + national.slice(n + 2); break; }
    }
  }
  // "15 1234-5678" sin característica -> CABA/AMBA
  if (national.length === 10 && national.startsWith('15')) national = defaultArea + national.slice(2);
  // Solo 8 dígitos (1234-5678): se asume característica 11
  if (national.length === 8) national = defaultArea + national;

  if (national.length !== 10 || !/^[1-9]/.test(national)) {
    return { ok: false, error: 'Número inválido (usá característica + número, ej: 11 1234-5678)' };
  }
  const wa = '549' + national;
  return { ok: true, wa, display: formatAr(national) };
}

function formatAr(national) {
  let areaLen = 4;
  if (national.startsWith('11')) areaLen = 2;
  else if (/^(2(2[0-9]|3[0-9]|6[01]|9[1-9])|3(4[1-3]|5[1-8]|7[0-9]|8[1-8]))/.test(national)) areaLen = 3;
  const area = national.slice(0, areaLen);
  const sub = national.slice(areaLen);
  const cut = sub.length - 4;
  return `+54 9 ${area} ${sub.slice(0, cut)}-${sub.slice(cut)}`;
}

export function displayFromWa(wa) {
  if (!wa) return '';
  if (wa.startsWith('549') && wa.length === 13) return formatAr(wa.slice(3));
  return '+' + wa;
}

export function waLink(wa, text) {
  return `https://wa.me/${wa}` + (text ? `?text=${encodeURIComponent(text)}` : '');
}
