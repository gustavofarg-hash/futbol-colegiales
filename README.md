# ⚽ Fútbol 7 · Polideportivo Colegiales

App web (PWA, se instala en el celular) para organizar los partidos de **fútbol 7 contra 7 (14 jugadores)** del Polideportivo Colegiales. Es un sitio **estático** (HTML + CSS + JavaScript, sin compilación), listo para publicar en GitHub Pages.

## Qué hace (v1)

- **Inicio:** partidos de los próximos 7 días (día, fecha y hora, en orden), con la cantidad de anotados (ej. `9/14`). Los que están más lejos aparecen en “Más adelante”.
- **Agregar partido:** fecha, hora y nota opcional.
- **Importar desde texto:** pegás un mensaje del grupo de WhatsApp y la app detecta expresiones como `jueves 22/10 21hs`, `miércoles 20:00`, `mañana 19 hs`, `sábado 24 de octubre a las 18`, `hoy a las 21 y media`, `jueves 20 y 21hs`. Muestra una **vista previa** para corregir y confirmar. Si pegás el mensaje con encabezado de WhatsApp (`[19/10/26, 12:40] Martín: …`), usa esa fecha como referencia para “mañana”, “jueves”, etc.
- **Detalle del partido:** 14 lugares. Agregás jugador con nombre y WhatsApp (el número se normaliza: `11 1234-5678` → `5491112345678`; acepta `011 15…`, `15…`, `+54 9…`, otras características como `0351 15…`). Botón de **WhatsApp** por jugador que abre `https://wa.me/<número>?text=…` con un mensaje con día, fecha y hora. Editar y quitar jugadores. **Copiar / compartir** la lista como texto.
- **Pagos:** en cada jugador, el botón 💵 abre un formulario para marcar si pagó, el monto en pesos y si fue Efectivo o Transferencia. En la fila se ve en verde (`Pagó $5.000 · Transferencia`) o atenuado (`No pagó`). Arriba del partido aparece el total (`Recaudado: $45.000 · 9/14 pagaron`). Eso también entra en el texto de copiar/compartir. Se guarda en el mismo jugador y se sincroniza en tiempo real.
- Cada jugador muestra **quién lo anotó** (Gustavo o Martín). La primera vez la app pregunta **“¿Quién sos?”**; se cambia en ⚙️ Ajustes.
- **Tiempo real** con Firebase Firestore: lo que carga uno lo ve el otro al instante. Funciona también sin conexión (se sincroniza al volver).
- **Modo demo:** si `config.js` no tiene la configuración de Firebase, la app guarda todo solo en el teléfono y muestra el aviso *“Modo demo: los datos no se comparten todavía”*.
- Interfaz en castellano rioplatense, tema verde, modo oscuro automático según el teléfono. Zona horaria: America/Buenos_Aires.

> **WhatsApp automático:** en v1 no es posible leer el grupo “Polideportivo Colegiales” automáticamente (WhatsApp no da acceso a grupos personales). Por eso existe “Importar desde texto”. Los datos ya están pensados para que un importador automático escriba después (ver *Modelo de datos*).

## Archivos

```
index.html            Pantalla principal
styles.css            Estilos (claro/oscuro)
config.js             ← ACÁ va la configuración de Firebase (y código de acceso opcional)
js/app.js             Interfaz
js/store.js           Datos: Firestore en tiempo real o localStorage (modo demo)
js/parser.js          Lector de fechas/horas en español
js/phone.js           Normalización de números argentinos y links wa.me
js/dates.js           Fechas en hora de Buenos Aires
js/payments.js        Pagos: monto, medio y textos
js/waiting.js         Orden de la lista de espera
manifest.webmanifest  PWA (nombre, íconos, colores)
sw.js                 Service worker (funciona offline)
icons/                Íconos de la app
firestore.rules       Reglas de seguridad de Firestore (v1)
tests/                Pruebas (unitarias + Playwright)
screenshots/          Capturas con datos de ejemplo
```

---

## Paso 1 · Crear el proyecto gratis en Firebase

Necesitás una cuenta de Google. El plan gratuito (**Spark**) alcanza de sobra; no hace falta tarjeta.

1. Entrá a <https://console.firebase.google.com> y tocá **“Crear un proyecto”** (o “Agregar proyecto”).
2. Nombre: por ejemplo `futbol-colegiales`. Podés **desactivar Google Analytics** (no hace falta). Tocá **Crear proyecto**.
3. **Crear la base de datos Firestore:**
   1. En el menú de la izquierda: **Compilación (Build) → Firestore Database → Crear base de datos**.
   2. Edición **Standard**. Ubicación: `southamerica-east1 (São Paulo)` es la más cercana (no se puede cambiar después).
   3. Elegí **“Iniciar en modo de producción”** (después pegamos nuestras reglas). Tocá **Crear**.
4. **Pegar las reglas:** en Firestore Database → pestaña **Reglas**, borrá lo que hay, pegá el contenido de [`firestore.rules`](firestore.rules) y tocá **Publicar**.
5. **Registrar la app web:**
   1. Volvé a la página principal del proyecto (ícono de engranaje ⚙️ → **Configuración del proyecto**).
   2. En **“Tus apps”** tocá el ícono **`</>`** (Web).
   3. Apodo: `futbol-colegiales-web`. **No** hace falta tildar Firebase Hosting. Tocá **Registrar app**.
   4. Te muestra un bloque `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`. Copiá esos valores.
6. **Pegarlos en `config.js`:** reemplazá cada `"TU_..."` por el valor correspondiente:

   ```js
   export const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "futbol-colegiales.firebaseapp.com",
     projectId: "futbol-colegiales",
     storageBucket: "futbol-colegiales.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef123456",
   };
   ```

   > Si la app muestra *“No hay conexión con la base de datos de Firebase”*, la base Firestore no está creada (paso 3) o la API está deshabilitada.

   Listo: al recargar la app desaparece el aviso de modo demo y los datos se comparten en tiempo real.

> Estos valores **no son secretos** (cualquier web con Firebase los expone). Lo que protege los datos son las **reglas** de Firestore; ver *Seguridad* abajo.

7. (Recomendado, después de publicar) En Firebase → **Authentication** no hace falta nada en v1. Pero en Google Cloud podés restringir la API key a tu dominio: Configuración del proyecto → *General* → link a la consola de Google Cloud → **APIs y servicios → Credenciales** → la clave “Browser key” → *Restricciones de aplicaciones: Sitios web* → agregá `https://TU_USUARIO.github.io/*`.

## Paso 2 · Publicar en GitHub Pages (gratis)

1. Creá una cuenta en <https://github.com> si no tenés.
2. Arriba a la derecha **+ → New repository**. Nombre: `futbol-colegiales`. Visibilidad **Public** (GitHub Pages gratis requiere repositorio público). **Create repository**.
3. Subí los archivos de esta carpeta (todo el contenido de `futbol-colegiales/`, incluida la carpeta `icons/`, `js/` y el archivo `.nojekyll`):
   - **Desde la web:** en el repositorio vacío, *“uploading an existing file”*, arrastrá todos los archivos y carpetas → **Commit changes**.
   - **O desde la terminal:**
     ```bash
     cd futbol-colegiales
     git init && git add . && git commit -m "Fútbol 7 Colegiales v1"
     git branch -M main
     git remote add origin https://github.com/TU_USUARIO/futbol-colegiales.git
     git push -u origin main
     ```
4. En el repositorio: **Settings → Pages**. En *Build and deployment*: Source **“Deploy from a branch”**, Branch **`main`** y carpeta **`/ (root)`** → **Save**.
5. En uno o dos minutos la app queda en `https://TU_USUARIO.github.io/futbol-colegiales/`.
6. Mandale ese link a Martín. Cada uno elige “¿Quién sos?” la primera vez.

### Instalarla en el celular

- **Android (Chrome):** abrí el link → menú ⋮ → **Instalar app** (o “Agregar a pantalla principal”).
- **iPhone (Safari):** abrí el link → botón Compartir → **Agregar a inicio**.

### Publicar cambios

Cada vez que cambies archivos, subilos de nuevo al repositorio. Para que los teléfonos tomen la versión nueva enseguida, subí el número de `VERSION` en `sw.js` (ej. `f7c-v2`).

---

## Seguridad (importante)

Las reglas de v1 (`firestore.rules`) son **abiertas**: cualquiera que tenga el link de la app puede leer y modificar los partidos y jugadores (incluidos los números de teléfono). Solo validan el formato de los datos. Es aceptable para empezar entre dos personas, pero conviene endurecerlo:

1. **Código de acceso compartido (ya incluido, opcional):** en `config.js` poné `ACCESS_CODE = "algo-que-sepan-ustedes"`. La app lo pide la primera vez en cada teléfono. **Ojo:** es solo una barrera visual; como el código queda en la página pública, no protege la base.
2. **Mejor: PIN validado por las reglas.** Guardar el PIN en un documento que nadie puede leer y exigirlo en cada escritura, o
3. **Lo más seguro: Firebase Authentication** (por ejemplo “Iniciar sesión con Google”) y reglas que permitan leer/escribir solo a los correos de Gustavo y Martín:
   ```
   allow read, write: if request.auth != null
     && request.auth.token.email in ['gustavo@ejemplo.com', 'martin@ejemplo.com'];
   ```
   Requiere agregar el botón de inicio de sesión en la app (siguiente versión).

## Modelo de datos (Firestore)

Pensado para que más adelante un importador automático (bot de WhatsApp, script, etc.) pueda escribir partidos sin duplicar.

**Colección `matches`** — id del documento: `AAAA-MM-DD_HHMM` (ej. `2026-10-22_2100`; si ya existe se agrega `-2`, `-3`…)

| campo | tipo | ejemplo |
|---|---|---|
| `date` | string `AAAA-MM-DD` (hora de Buenos Aires) | `"2026-10-22"` |
| `time` | string `HH:MM` 24 h | `"21:00"` |
| `startsAt` | número (epoch ms, calculado con `-03:00`) | `1792713600000` |
| `note` | string | `"Cancha 2"` |
| `capacity` | número | `14` |
| `source` | `"manual"` \| `"texto"` \| `"whatsapp"` | `"whatsapp"` |
| `sourceRef` | string o null — id del mensaje de origen, para deduplicar | `"wamid.HBg..."` |
| `sourceText` | string o null — texto original | `"jueves 22/10 21hs"` |
| `createdBy`, `updatedBy` | `"Gustavo"` \| `"Martín"` \| `"bot"` | |
| `createdAt`, `updatedAt` | número (epoch ms) | |

**Colección `players`** — id automático

| campo | tipo |
|---|---|
| `matchId` | id del partido |
| `matchDate` | copia de `date` (para consultar por fecha) |
| `name` | string |
| `phone` | solo dígitos, formato wa.me (ej. `5491112345678`) o vacío |
| `addedBy` | `"Gustavo"` \| `"Martín"` |
| `createdAt`, `updatedAt` | número (epoch ms) |
| `paid` | bool, opcional — si pagó |
| `amount` | número o null — pesos (ARS) |
| `method` | `"efectivo"` \| `"transferencia"` \| null |
| `paidUpdatedBy` | quién cargó el pago |
| `paidUpdatedAt` | número (epoch ms) |
| `waiting` | bool — `true` si está en la lista de espera |
| `waitOrder` | número o null — menor = más arriba en la espera. Los nuevos van al final |
| `rosterAt` | número o null — cuándo pasó a la lista principal |
| `confirmToken` | string — token del link de confirmación (se crea al armar el recordatorio) |
| `confirmed` | `"si"` \| `"no"` — respuesta del jugador |
| `confirmedAt` | número (epoch ms) |
| `reminderSentAt` | número (epoch ms) — cuándo se abrió el WhatsApp del recordatorio |

**Recordatorio:** en el partido, «Recordatorio de partido» arma un mensaje por jugador con WhatsApp y un link único `confirmar.html?m=<partido>&p=<jugador>&t=<token>`. La página solo muestra ese partido y ese nombre (sin teléfonos de nadie) y guarda `confirmed` si el token coincide.

**Lista de espera:** se puede anotar a alguien aunque el partido no esté lleno. Si ya hay 14, el alta normal también cae en la espera (al final). Las flechas ↑ ↓ cambian `waitOrder` y los dos organizadores ven el mismo orden al toque. «Subir al partido» (o al quitar un titular) pasa al primero de la lista.

El pago va en el documento del jugador (no en una colección nueva). Las reglas que ya están publicadas dejan pasar campos extra, así que estos se pueden escribir sin volver a publicar `firestore.rules`. La copia del repo además valida el tipo de esos campos para cuando se publiquen de nuevo.

Un importador automático solo tiene que hacer `set` en `matches/<AAAA-MM-DD_HHMM>` con `source: "whatsapp"` y `sourceRef`; la app lo muestra al instante. El parser de texto (`js/parser.js`, función `parseMatchesFromText`) es JavaScript puro y se puede reutilizar desde Node.

## Probar en la computadora

```bash
cd futbol-colegiales
python3 -m http.server 8080        # y abrí http://localhost:8080
```

(No funciona abriendo `index.html` con doble clic: los módulos de JavaScript necesitan un servidor.)

Pruebas:

```bash
npm install                        # instala Playwright (solo para pruebas)
npx playwright install chromium
npm test                           # pruebas del parser y de los teléfonos
npm run test:e2e                   # prueba completa en Chromium 390x844 (modo demo, con el servidor corriendo)
node tests/firebase-realtime.mjs http://localhost:8080/   # prueba contra Firebase real: 2 navegadores (Gustavo y Martín), tiempo real, edición, borrado y limpieza
```

Los datos del modo demo quedan solo en ese navegador. Para empezar de cero: ⚙️ Ajustes → *Borrar datos de demo*.
