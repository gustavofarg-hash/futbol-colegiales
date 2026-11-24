# Reenvío de Mis Partidos

Sitio estático para el repositorio público `futbol-colegiales`, después de
renombrar la app a `partidos`. GitHub Pages lo publica en
`https://gustavofarg-hash.github.io/futbol-colegiales/`.

Cada ruta, búsqueda y hash se reenvía a `/partidos` con `location.replace`.
`404.html` cubre las rutas que no existen acá (`/prueba/`, `/c/`,
`confirmar.html`, etc.). `sw.js` (y `prueba/sw.js`) reemplaza el service
worker viejo, borra su caché y redirige las navegaciones.

No indexar. Sin scripts externos. No hay datos personales.
