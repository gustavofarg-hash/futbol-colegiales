# Versión de prueba

La app de todos los días sigue en

https://gustavofarg-hash.github.io/futbol-colegiales/

La de prueba, cuando se publique, queda en

https://gustavofarg-hash.github.io/futbol-colegiales/prueba/

Ahí se prueba un cambio. Si Gustavo da el OK, ese cambio se mergea a `main` y recién entonces llega a producción. La de prueba usa otra base. No puede escribir en el Firestore `futbol-partidos`.

Hoy GitHub Pages publica la rama `main` entera en la raíz. Para sumar `/prueba/` sin pisar la raíz hace falta un workflow. El archivo es `.github/workflows/pages.yml`. **No publica nada** hasta que se hagan los dos cambios de Settings de más abajo. Mientras Pages siga en «Deploy from a branch», producción queda igual que ahora.

## Qué publica el workflow

Cada vez que corre, arma un sitio con las dos partes:

- la raíz es exactamente la rama `main` (el mismo `config.js` de producción);
- `/prueba/` es la rama `prueba`, pero su `config.js` se reemplaza por `config.prueba.js`.

Si `config.prueba.js` dice `projectId: "futbol-partidos"`, el workflow se detiene y no publica. Así no se sube una prueba que apunte a producción.

Si todavía no existe la rama `prueba`, se publica solo la raíz.

## Settings que hay que cambiar (cuenta con permiso de admin del repo)

Hacerlo en este orden, después de mergear este cambio a `main`:

1. GitHub → repositorio `futbol-colegiales` → **Settings** → **Secrets and variables** → **Actions** → pestaña **Variables** → **New repository variable**.
   - Name: `PAGES_VIA_ACTIONS`
   - Value: `true`
2. **Settings** → **Pages** → **Build and deployment** → Source: **GitHub Actions** (dejar de usar «Deploy from a branch»).
3. **Actions** → workflow **Pages** → **Run workflow**, en la rama `main`.

Hasta el paso 2, el sitio sigue saliendo de la rama `main` como hoy. El paso 2, hecho sin un deploy exitoso, puede dejar el sitio en blanco unos minutos. Por eso el paso 3 va enseguida.

La raíz publicada es el contenido de `main`. La carpeta `/prueba/` es extra y no cambia `index.html` de producción.

## Cómo se aísla la prueba

En una dirección que contiene `/prueba/`:

- el cartel rojo dice **VERSIÓN DE PRUEBA**;
- `localStorage` y `sessionStorage` se guardan con el prefijo `prueba:` (la sesión, el modo demo, el tamaño de letra y los avisos no se mezclan);
- el service worker de `/prueba/sw.js` usa otra caché (`prueba-f7c-…`) y no borra la caché de producción. El de la raíz no intercepta pedidos a `/prueba/`;
- los links de confirmar asistencia, el link corto `/c/?k=` y el de instalar la app apuntan a `/prueba/`;
- si `config.prueba.js` sigue con `TU_...`, no se abre Firebase: queda el modo demo. No se usa `config.js` de producción;
- si igual la página de `/prueba/` llegara a cargar el `projectId` `futbol-partidos`, la app no abre Firebase y se queda en modo demo.

Firebase Auth, cuando más adelante haya un proyecto de prueba, guarda la sesión en IndexedDB con la apiKey de **ese** proyecto. No reutiliza la sesión de `futbol-partidos`.

## Backup: qué copia y qué no

En Ajustes, **Hacer backup** baja un JSON con las colecciones de Firestore: partidos, jugadores, plantel, teléfonos, confirmaciones, links, saldos, registro, compensaciones, notas, suspensiones, usuarios (`users`) y el resto listado en `BACKUP_COLLECTIONS`.

**No copia** las cuentas de Authentication (mail, contraseña, ni el uid con el que se entra). El documento `users/{uid}` sí viaja en el archivo, pero el uid es el de producción.

Para probar la interfaz sin Firebase: en producción, Hacer backup. En `/prueba/` (modo demo), Cargar base de datos desde un backup. Eso escribe solo en el navegador, con la clave `prueba:…`, y no toca producción. Los partidos «Solo yo» siguen nombrando los uid viejos: en el demo se entra como Gustavo/Martín de prueba (`gustavo` / `martin`), que no son esos uid.

Para una copia en el Firebase de prueba: primero crear ese proyecto (pasos de abajo), pegar su config en `config.prueba.js`, publicar la rama `prueba`, entrar en `/prueba/` con el admin **de ese proyecto** y recién ahí cargar el backup. Las reglas del proyecto de prueba tienen que estar publicadas. El backup se escribe en el proyecto al que apunta la página, que en `/prueba/` no es `futbol-partidos`.

En `/prueba/`, al cargar el backup, cada uid de producción (viewers, adders, createdByUid, addedByUid, ownerUid, holders, el id de `users` y el resto de campos de uid) pasa a ser el uid del admin que está logueado. `*` queda. El id de un invitado (`invitedBy`) no es un uid y no se toca. Así las reglas aceptan la escritura y Próximos lista los partidos. La cuenta de Auth de producción no se copia: en la prueba entra la cuenta nueva. Fuera de `/prueba/` el archivo se carga tal cual, sin reasignar uid.

## Pasos en la cuenta Google de Gustavo (gustavof.arg@gmail.com)

Todo esto lo tiene que hacer él. Un asistente no entra a esa cuenta.

1. Abrir https://console.firebase.google.com con `gustavof.arg@gmail.com`.
2. **Agregar proyecto** (o «Crear un proyecto»). Nombre visible, por ejemplo `Mis Partidos prueba`. El ID del proyecto **no** puede ser `futbol-partidos`. Anotar el ID (algo como `mis-partidos-prueba`).
3. Google Analytics se puede desactivar en el asistente. No hace falta.
4. En el proyecto nuevo: **Compilación** → **Authentication** → **Comenzar** → **Sign-in method** → **Correo electrónico/contraseña** → **Habilitar** → Guardar. No activar otros proveedores.
5. **Authentication** → **Settings** → **Authorized domains**. Tiene que figurar `gustavofarg-hash.github.io`. Si no está: **Add domain** → `gustavofarg-hash.github.io`. No hace falta un dominio distinto para `/prueba/`: Firebase autoriza el host, no la carpeta.
6. **Compilación** → **Firestore Database** → **Crear base de datos**. Ubicación: la misma región que producción si se quiere (en `futbol-partidos` mirar Firestore → engranaje o la ubicación que ya muestra la consola; si no se acuerda, `southamerica-east1` es São Paulo). Empezar en **modo de producción** (reglas cerradas).
7. Firestore → **Reglas** → borrar lo que venga → pegar el archivo `firestore.rules` de este repo → **Publicar**. El mail de admin del archivo ya es `gustavof.arg@gmail.com`.
8. Firestore → **Índices** → **Índice compuesto** → **Crear índice**. Hacen falta dos, los mismos que usa producción:
   - Colección `matches`: campo `viewers`, alcance **Matrices** (array), y campo `date`, **Ascendente**. Sin este, Próximos e Historial no leen. El descendente lo cubre el mismo índice.
   - Colección `log`: campo `editors`, alcance **Matrices**, y campo `at`, **Descendente**. Sin este, Registro no lee. Está descripto en `firestore.indexes.json`.
   Si otra pantalla pide un índice, el mensaje de la consola del navegador trae un link para crearlo en el proyecto de prueba. No usar los links de `futbol-partidos`.
9. **Configuración del proyecto** (engranaje al lado de «Descripción general del proyecto») → **Tus apps** → **</>** (Web). Nombre de la app: `Mis Partidos prueba`. No hace falta Hosting de Firebase. Registrar. Copiar el `firebaseConfig` (`apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).
10. Pegar esos valores en `config.prueba.js` del repo, en la rama `prueba`. No tocar `config.js`. El `projectId` tiene que ser el del paso 2, nunca `futbol-partidos`.
11. Abrir https://gustavofarg-hash.github.io/futbol-colegiales/prueba/ . Tiene que verse el cartel rojo. Crear la cuenta de administrador con `gustavof.arg@gmail.com` **en esa dirección**, no en la de producción. Es otra cuenta, en otro proyecto, aunque el mail sea el mismo.
12. Recién ahí, Ajustes → Cargar base de datos desde un backup bajado de producción.

Opcional, solo si se quieren los mismos uid de Auth: en el proyecto de producción, Authentication no exporta usuarios desde la pantalla. Hace falta la CLI con la cuenta de Gustavo (`firebase auth:export` en `futbol-partidos` y `firebase auth:import` en el proyecto de prueba). Eso copia hashes de contraseña. No está automatizado en este repo y no hace falta para el modo demo.

Plan Spark (gratis) alcanza: Auth, Firestore y las reglas. No hace falta Blaze ni Cloud Functions para esta copia. El backup a Drive sigue siendo el de `config.js` / `config.prueba.js`; el ID de cliente de Drive de producción no se copia. En la prueba, «Guardar en Google Drive» descarga el archivo o abre el menú de compartir, igual que con el ID vacío.
