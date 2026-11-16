// Un tap es apoyar y soltar sin arrastrar. Si el dedo se movió o la lista
// scrolleó en el medio, el gesto es un desliz y no elige nada.
export function tapChose({ dx = 0, dy = 0, scrolled = false, limit = 10 } = {}) {
  if (scrolled) return false;
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  return Math.hypot(x, y) <= limit;
}

let swallowClickUntil = 0;

/**
 * Llama onTap solo si el dedo bajó y subió sobre el botón, sin moverse más
 * de `limit` px y sin que la página scrollee. Un desliz no cuenta.
 * El click que sigue al dedo se ignora para no sumar dos veces. Enter sigue
 * entrando por click.
 */
export function bindTap(root, selector, onTap, { limit = 10 } = {}) {
  if (!root) return;
  let gesture = null;
  const stop = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('scroll', onScroll, true);
  };
  const onScroll = () => { if (gesture) gesture.scrolled = true; };
  const onMove = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    if (!tapChose({ dx: event.clientX - gesture.x, dy: event.clientY - gesture.y, limit })) gesture.moved = true;
  };
  const end = (event, act) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const btn = gesture.btn;
    gesture = null;
    stop();
    swallowClickUntil = Date.now() + 700;
    if (act) onTap(btn);
  };
  const onCancel = (event) => end(event, false);
  const onUp = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const chose = tapChose({
      dx: event.clientX - gesture.x,
      dy: event.clientY - gesture.y,
      scrolled: gesture.scrolled || gesture.moved,
      limit,
    });
    const hit = document.elementFromPoint(event.clientX, event.clientY);
    const still = !!(hit && gesture.btn.contains(hit));
    end(event, chose && still && !gesture.btn.disabled);
  };
  root.addEventListener('pointerdown', (event) => {
    const btn = event.target.closest?.(selector);
    if (!btn || btn.disabled) return;
    if (event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    stop();
    gesture = {
      x: event.clientX, y: event.clientY, pointerId: event.pointerId, btn,
      moved: false, scrolled: false,
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('scroll', onScroll, true);
  });
  root.addEventListener('click', (event) => {
    const btn = event.target.closest?.(selector);
    if (!btn || btn.disabled) return;
    if (Date.now() < swallowClickUntil) {
      event.preventDefault();
      return;
    }
    onTap(btn);
  });
}
