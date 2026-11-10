// Tema de la versión de prueba. Claro, oscuro, o el del sistema.
export const THEME_KEY = 'f7c-theme';

export function readTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    if (value === 'light' || value === 'dark' || value === 'auto') return value;
  } catch { /* modo privado */ }
  return 'auto';
}

export function themeIsDark(value = readTheme()) {
  if (value === 'dark') return true;
  if (value === 'light') return false;
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches; } catch { return false; }
}

export function applyTheme(value = readTheme()) {
  const root = document.documentElement;
  const dark = themeIsDark(value);
  root.dataset.theme = value;
  root.classList.toggle('dark', dark);
  const color = dark ? '#071428' : '#1e4fd7';
  document.querySelectorAll('meta[name="theme-color"]').forEach((el) => {
    el.setAttribute('content', color);
    el.removeAttribute('media');
  });
  return value;
}

export function saveTheme(value) {
  const next = value === 'light' || value === 'dark' ? value : 'auto';
  try { localStorage.setItem(THEME_KEY, next); } catch { /* modo privado */ }
  return applyTheme(next);
}

export function watchTheme() {
  let mq;
  try { mq = window.matchMedia('(prefers-color-scheme: dark)'); } catch { return; }
  const onChange = () => { if (readTheme() === 'auto') applyTheme('auto'); };
  if (mq.addEventListener) mq.addEventListener('change', onChange);
  else if (mq.addListener) mq.addListener(onChange);
}
