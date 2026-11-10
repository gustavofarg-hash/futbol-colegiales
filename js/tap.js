// Un tap es apoyar y soltar sin arrastrar. Si el dedo se movió o la lista
// scrolleó en el medio, el gesto es un desliz y no elige nada.
export function tapChose({ dx = 0, dy = 0, scrolled = false, limit = 10 } = {}) {
  if (scrolled) return false;
  const x = Number(dx) || 0;
  const y = Number(dy) || 0;
  return Math.hypot(x, y) <= limit;
}
