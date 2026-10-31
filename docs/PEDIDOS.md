# Mis Partidos: lista de pedidos y control de regresiones

> **Antes de cada cambio, revisar esta lista y no quitar nada sin pedido explícito de Gustavo. Al terminar, actualizarla.**

Auditoría de solo lectura sobre `main` en `/workspace/fc-audit`, con la versión **f7c-v61** (`js/app.js:37`, `sw.js:3`). Hecha el 30/10/2026.
**Actualizada para f7c-v79** (rama `cursor/promo-sin-gratis-c20d`, 31/10/2026): un partido marcado «Juega gratis» no entra en la promo del día. Si quedan 2, se cobra la promo de 2; si queda 1, el precio suelto. Si ya habían pagado la promo y uno pasa a gratis, el que queda se acomoda al precio nuevo y lo que sobró vuelve como saldo a favor de quien lo había cobrado. En la hoja de pago ya no está «Aplicar a los N partidos»: si hay promo, el toque pone el total y abajo se ve el reparto en partes iguales. `firestore.rules` no cambió.
**Actualizada para f7c-v78** (rama `cursor/pago-toca-precio-c20d`, 31/10/2026): en el celular, tocar un monto vacío de la hoja «Pago» (Efectivo, Transferencia, Transfiere después) otra vez lo completa con el precio del partido. El número no queda marcado y el cursor queda al final, así que borrar saca el último dígito. v77 no lo completaba: el toque suelta el dedo antes de enfocar el campo y el precio no se escribía. El primer número ya no reemplaza el precio. `firestore.rules` no cambió.
**Actualizada para f7c-v77** (rama `cursor/pago-sin-seleccion-c20d`, 31/10/2026): ↩️ en la hoja «Pago», tocar un monto no lo marcaba y el primer número reemplazaba el precio. En Android el campo vacío no se completaba. v78 lo completa con el cursor al final. `firestore.rules` no cambió.
**Actualizada para f7c-v76** (rama `cursor/deuda-abre-pago-c20d`, 31/10/2026): si se puede anotar, tocar la línea roja de deuda bajo «Debe en total» abre directo la hoja «Pago» de ese jugador en ese partido (también uno ya jugado). No pasa por el menú del partido. Cancelar y Guardar vuelven al panel de donde se tocó (el menú o la ficha) y la deuda se actualiza. Si no se puede anotar, la línea sigue siendo texto rojo y no hace nada. `firestore.rules` no cambió.
**Actualizada para f7c-v75** (rama `cursor/deuda-abre-menu-c20d`, 31/10/2026): ↩️ cada línea roja de deuda abría el menú de ese jugador en ese partido. v76 abre la hoja «Pago» directo. Si no se puede anotar, la línea sigue siendo texto rojo y no hace nada. `firestore.rules` no cambió.
**Actualizada para f7c-v74** (rama `cursor/registro-cobro-c20d`, 31/10/2026): en Registro > Pagos, el efectivo y la transferencia dicen «Cobró» con el desplegable del pago, al lado de «Registró». Una transferencia repartida es una sola línea con todos los que cobraron. El crédito cobra el organizador que estaba logueado. Una carga que no paga deudas se lee «Carga de crédito» y la ve solo quien la hizo. Una edición o un borrado muestran quién cobraba y quién cobra. El pago no se guarda si falta quién cobró el efectivo o la transferencia. Las líneas viejas no se rellenan. `firestore.rules` acepta `paidTo`.
**Actualizada para f7c-v73** (rama `cursor/registro-20-dias-c20d`, 31/10/2026): Registro arranca en los últimos 20 días según cuándo se anotó la línea (hoy inclusive, desde hace 20 días). Un partido futuro entra si el evento se anotó en esa ventana. Desde/Hasta filtra recién al tocar Ver, en Partidos y en Pagos. Ve la línea quien podía ver el partido o anotar y quitar jugadores, más el creador y quien la anotó. Las líneas viejas no se reescriben. `firestore.rules` no cambió.
**Actualizada para f7c-v72** (rama `cursor/registro-pagos-partido-c20d`, 31/10/2026): en Registro > Pagos, cada línea dice qué partido se pagó (fecha, hora y sede, la misma etiqueta que en Partidos), además de cuándo se anotó el pago. El crédito repartido en varios partidos nombra cada uno. Una carga de crédito sin partido dice «Carga de crédito». Usa la copia guardada en la línea, así un partido borrado sigue figurando. `firestore.rules` no cambió.
**Actualizada para f7c-v71** (rama `cursor/promo-invitado-nombre-c20d`, 31/10/2026): el apodo que se escribe en el menú del invitado (el mismo campo del panel) se copia a los otros partidos del día de ese anfitrión, y la promo no pasa al precio suelto. Lo mismo si el nombre se cambia en Editar invitado, en Equipos o en la ficha. El invitado de otro anfitrión no se toca. `firestore.rules` no cambió.
**Actualizada para f7c-v70** (rama `cursor/registro-tab-c20d`, 31/10/2026): pestaña Registro, a la derecha de Estadísticas, con Partidos y Pagos. Anota de ahora en adelante (sin rellenar lo viejo). Cada organizador ve solo los partidos que puede ver y editar, con el permiso copiado en la línea. El admin puede borrar el registro al resetear; nadie lo edita. También se sacó de Ajustes el aviso de Firebase y el filtro «Solo lo que anoté y lo que cobré». `firestore.rules` cambió: colección `log`.
**Actualizada para f7c-v69** (rama `cursor/credito-boton-deuda-c20d`, 30/10/2026): en el panel del jugador, «Cargar crédito» es verde y queda justo debajo del saldo a favor. El detalle de cada partido queda justo debajo de «Debe en total», los dos en rojo. En la ficha y en el menú. `firestore.rules` no cambió.
**Actualizada para f7c-v68** (rama `cursor/estadisticas-tab-c20d`, 30/10/2026): cuarta pestaña «Estadísticas», a la derecha de Historial. De la ficha salió el bloque de pagos (filtros, «Pagó», meses, «Por organizador», «Anotado por») y pasó a Estadísticas, a pedido de Gustavo. Las notas de partido se quedan en el menú del jugador (el mismo bloque en cada entrada), con «Agregar nota». En las estadísticas del jugador se ven solo para leer. `firestore.rules` no cambió.
**Actualizada para f7c-v67** (rama `cursor/whatsapp-checkbox-fila-c20d`, 30/10/2026): el casillero del WhatsApp queda a la derecha del número, con el texto «Permitir que otros organizadores vean su WhatsApp». Quién ve el número no cambió. `firestore.rules` no cambió.
**Actualizada para f7c-v66** (rama `cursor/credito-cancela-deuda-c20d`, 30/10/2026): «Cargar crédito» cancela primero las deudas con el organizador logueado, de la más vieja a la más nueva, y solo el sobrante queda como saldo. `firestore.rules` no cambió. «Cargar pago» sigue detrás de `canAdd` (ver Otros puntos).
**Actualizada para f7c-v65** (rama `cursor/ficha-credito-apodo-c20d`, 30/10/2026): en la ficha del jugador y en el menú, el mismo bloque con el apodo editable, el saldo a favor en verde, la deuda en rojo y «Cargar crédito». En Firebase el botón no aparecía si el uid de la sesión no estaba en `adders` (`canAdd`); ahora lo ve cualquier organizador o el admin. `firestore.rules` no cambió.
**Actualizada para f7c-v64** (rama `cursor/saldo-credito-deudas-253c`, 30/10/2026): saldo a favor, descontar del crédito, deudas viejas, sobrante del pago dividido y renombre del invitado en la promo del día. Los números de línea son de la versión en que se revisó cada punto y pueden correrse.
Fuentes: los títulos y textos de los PR #1–#46, `git log` y `README.md`.
**Nota:** no pude leer las conversaciones del bot «Creador de apps». El acceso a ese otro agente me devolvió la sesión propia, así que puede faltar algún pedido que se hizo en el chat y nunca llegó a un PR.
Las fechas son de cuando se mergeó el PR, en hora de Buenos Aires.

Pruebas sobre esta copia: **e2e 658/658 OK** (`node tests/e2e.mjs`, modo demo, 390×844) y **unit 96/96 OK** (`node --test tests/unit.test.mjs`). El e2e de v79 revisa que la promo se reparte al tocar el monto, que un partido gratis no cuenta, y que lo que sobra queda como saldo.

Estados: ✅ está · ⚠️ parcial · ❌ falta o se perdió · ↩️ reemplazado a pedido (no es regresión)

---

## Partidos (Próximos, detalle, anotar)

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 19/10 (#3) | Lista de espera, lugar reservado, confirmación por link | ✅ | `js/waiting.js`, `confirmar.html`, «Confirmar lugar» |
| 19/10 (#7) | «Subir al partido» en cada fila de espera y aviso por WhatsApp al subir | ✅ | `app.js`: «Subir al partido». Desde v63 el aviso pregunta con Sí/No (`offerPromotionWhatsApp`, `app.js:1397`) |
| 19/10 (#5) | Anotar en varios partidos desde el perfil | ✅ | «Anotar en …» en el perfil, «Aplicar a los» |
| 19/10 (#10) | La selección del perfil persiste y los de la espera no figuran como «sin respuesta» | ✅ | PR #10, e2e OK |
| 20/10 (#12) | Hoy queda todo el día en el inicio | ✅ | `matchCard`: `rel==='Hoy'` |
| 20/10 (#14) | Cancelar partido (con jugadores) y notas | ✅ | «Cancelar partido» y «Reactivar partido» |
| 20/10 (#16, #22) | Link corto de confirmación `/c/?k=`, acortado con spoo.me o da.gd | ✅ | `js/short.js`, `js/shorten.js`, `js/short-go.js`, `c/index.html` |
| 20/10 (#17) | Tres pestañas fijas; Próximos 7 días y «Ver más adelante» | ✅ | «Ver más adelante» en `app.js`. **v68:** cuarta pestaña «Estadísticas». **v70, a pedido:** quinta pestaña «Registro», a la derecha. Siguen fijas y entran a 390px |
| 20/10 (#20) | La pantalla no se refresca sola; «Cancelar» solo en partidos no pasados | ✅ | `app.js:3725`: no re-renderiza con una hoja abierta |
| 20/10 (#21) | Sede del partido y jugadores por equipo (5–11) | ✅ | «Jugadores por equipo», `js/venues.js` |
| 20/10 (#23) | Botón «+» para agregar nuevo, sin duplicados, amigos del jugador | ✅ | «Agregar como nuevo», «Ya anotado» |
| 20/10 (#24) | Completar el nombre y el WhatsApp de un amigo | ✅ | «Editar invitado» en el formulario del jugador |
| 20/10 (#25) | «Invitado de», colores, «Bajar a lista de espera» | ✅ | «invitado de», «Bajar a lista de espera» |
| 20/10 (#26) | Un invitado no puede agregar invitados | ✅ | «Un invitado no puede agregar invitados» |
| 26/10 (#27 A1–A5, D1) | «Fútbol N», cancha, precio por partido, «Se anotó con», «Juega gratis», cupo coherente | ✅ | `signupFields` «Se anotó con:» (`app.js:237`), «Juega gratis», «Cancha» |
| 26/10 (#28 E1–E2) | La lista muestra «21hs ($5.000)»; el detalle muestra dd/mm/aaaa y «Cancelar» rojo abajo con confirmación | ✅ | `matchCard` (`app.js:514`) |
| 26/10 (#29 F3) | «Anotar como pendiente de confirmación» | ✅ | Está en `app.js` |
| 27/10 (#31) | La lista no muestra la sede ni el formato al pie | ✅ | PR #31 |
| 27/10 (#33, #34) | Las filas de pendiente y de espera no se aplastan en vertical | ✅ | `styles.css` |
| 27/10 (#42) | WhatsApp arriba del botón de pago y nombres sin cortar | ✅ | En `#slots` (`slotSide`, `app.js:48`; `.slot-actions` en columna). **v63:** la lista de espera (`#wait-list`) tampoco corta: muestra el apodo (o el nombre) entero, baja de línea entre palabras y las etiquetas se ven completas (`styles.css`, reglas `#wait-list`). e2e «La lista de espera muestra nombres y etiquetas enteros, sin partir palabras» |
| 29/10 (#43 R1) | Agregar N invitados de una vez | ✅ | `#friend-count` (`app.js:2754`) |
| 29/10 (#43 R5) | Pregunta Sí/No para la lista de espera | ✅ | **v63:** `askYesNo` (`app.js:3527`) en «¿Subir a X…?», en el aviso por WhatsApp al subir, en «¿Quitar también a sus invitados…?» y en «¿Bajar también a sus invitados…?». e2e «… pregunta con Sí y No». Quedan otras preguntas con `confirm()` (ver «Otros puntos») |
| — | Interfaz compacta y moderna | ✅ | Cambios de estilo en #30–#42; no hay una lista de puntos para comparar |

## Jugadores / agenda

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 19/10 (#3) | Agenda de jugadores con perfil | ✅ | «Mis jugadores», `js/roster.js` |
| 19/10 (#9) | El perfil abre sin WhatsApp y el número es opcional | ✅ | PR #9 |
| 20/10 (#19) | Solo edita un jugador quien lo agregó | ✅ | `canEditRoster` y «Solo lo puede editar el organizador que lo agregó» |
| 20/10 (#25) | Nivel con un decimal | ✅ | e2e OK |
| 26/10 (#27 C2) | «Nombre corto (o apodo)» | ✅ | **v62 (#47):** en la lista del partido y en la de espera se ve **solo** el apodo (sin apodo, el nombre completo), sin cortarse. El campo se llama «Nombre corto (o apodo)» en Jugadores (`app.js`) y en Editar jugador (`nickField`), y está en **cualquier** jugador ya creado: sin ficha, o con ficha de otro organizador (queda en el jugador del partido). Se ve en Equipos (`shownName`). El nombre completo sigue en el menú del jugador y en Jugadores. **v65:** el mismo campo está en la ficha (`#profile-nick`) y arriba del menú (`#menu-nick`). Lo guarda quien ya podía: en la ficha, quien la creó o el admin (`canEditRosterNick`); en el menú, quien puede escribir el jugador (`canWritePlayer`, `saveNick`). La lista del partido no cambia de forma: sigue mostrando solo el apodo |
| 26/10 (#27 C3) | No se puede borrar de Jugadores a alguien que está anotado | ✅ | «está anotado en»; e2e «No se borra de Jugadores si está anotado» |
| 26/10 (#28 E5) | Jugadores es solo la lista; se saca la pestaña Pagos | ↩️ | Se sacó a pedido. El resumen («Pagó», meses, «Por organizador», «Anotado por») quedó en el perfil. **v68, a pedido:** ese bloque salió de la ficha y está en Estadísticas (`#ledger`, `#pay-filter`). La ficha conserva apodo, saldo, deuda y «Cargar crédito» |
| 27/10 (#35) | El buscador de Jugadores funciona | ✅ | e2e OK |
| 29/10 (#43 R4) | Cada organizador ve en Jugadores solo a los que agregó él | ⚠️ | `rosterForOrganizer` (`roster.js:67`) se usa en Jugadores (`app.js:2132`) y en la búsqueda del partido (3021). e2e «Martín no ve en Jugadores a quien anotó Gustavo». **Las fichas viejas que no tienen dueño las ven todos** |

## Pagos y deudas

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 19/10 (#3) | Pagos y cobradores | ✅ | `js/payments.js`, `js/ledger.js` |
| 19/10 (#5) | Partir el pago en efectivo y transferencia; «Transfiere después» | ✅ | «Transfiere después», «Marcar transferencia como cobrada» |
| 19/10 (#6) | Quién cobró cada parte, precios en Ajustes, promo 2 y 3 del mismo día | ✅ | `price-form` en Ajustes, `js/prices.js`. **v79:** «Juega gratis» no cuenta para la promo. 2 partidos y 1 gratis: el otro sale a precio suelto. 3 y 1 gratis: los otros dos usan la promo de 2. Si ya pagaron la promo y uno pasa a gratis, lo cobrado se acomoda al precio nuevo y lo que sobra queda como saldo de quien lo cobró (`promoRefundAfterFree`). En la hoja ya no está «Aplicar a los N partidos»: el toque pone el total y `#pay-promo-split` muestra el reparto. El peso que sobra queda en el primer partido. e2e «Tocar el monto pone el total de la promo…» y «Si uno juega gratis…» |
| 20/10 (#25) | Al tocar un campo de pago vacío, se completa con el precio | ✅ | PR #25, e2e OK. **v78:** en el celular el toque suelta el dedo antes del foco y v77 no escribía el precio: el campo seguía vacío y el cursor al principio. Ahora Efectivo, Transferencia y Transfiere después, vacíos o en 0, se completan con el precio del partido. El texto no queda marcado (no abre Cortar/Copiar/Pegar) y el cursor queda al final. Borrar saca el último dígito. El primer número ya no reemplaza el precio (↩️ v77). Siguen siendo `type=text` con `inputmode=decimal`, así el cursor se puede poner al final. e2e «Un toque del celular completa la transferencia…» |
| 26/10 (#29 F1) | El formulario de pago abre directo | ✅ | `openPaymentForm` (`app.js:3134`) |
| 26/10 (#29 F2) | «Debe en total» en rojo en el perfil | ✅ | «Debe en total». **v69:** el detalle de cada partido queda justo debajo, también en rojo, en la ficha y en el menú (`playerPanelPieces`) |
| 29/10 (#43 R2) y 30/10 (#44, #46) | Dividir un pago entre el jugador y sus invitados | ✅ | «Dividir entre él y sus invitados», `allocateAcrossDebts` (`payments.js:41`); se guarda de a un jugador |
| 30/10 (v63) | **Invitados en la promo del día: son «quien invita + su nombre»** | ✅ | `personKey` (`js/roster.js`) y `playerPromoKey` (`js/prices.js`): un invitado sin teléfono ni ficha se identifica por la identidad de su anfitrión (`invitedBy` → ese jugador) más su nombre. El Invitado 1 de Vinicio y el de Ernesto no juntan promo; el Invitado 1 del mismo Vinicio en dos partidos del día sí. Lo mismo en los resúmenes de pagos y transferencias (`summaryKey`, `ledger.js`) y en Jugadores (`playerMatchesPerson` no junta invitados por nombre). Unit «promo de invitados…» |
| 30/10 (v63) | **«Guardar backup en Google Drive» descargaba el archivo en vez de guardarlo en Drive** | ✅ | Causa: el botón compartía el archivo con `navigator.share`, pero Chrome solo comparte ciertos tipos y `.json` / `application/json` no está; `canShare` daba falso y caía en la descarga. Además el archivo se armaba después del toque y el permiso del toque podía vencer. Ahora (`js/drive.js`, `openBackup` en `app.js`): el archivo se arma al abrir la hoja. **Con `GOOGLE_DRIVE_CLIENT_ID` en `config.js`**, Google Identity Services pide permiso `drive.file` (solo los archivos que crea la app) y se sube con la API de Drive a la carpeta «Mis Partidos - backups». **Sin ese ID** (o si Drive falla), se abre el menú de compartir con el archivo como `.txt` (mismo JSON adentro), donde se elige Drive; si no hay menú, se descarga. «Restaurar» acepta `.json` y `.txt`. Para activar la subida directa, ver los pasos en `config.js`. Unit «Drive: …» y e2e «Guardar en Drive…», «Drive: …». Capturas `shots-v63/antes|despues-backup-drive.png` |
| 30/10 (v63) | **Agregar invitados en todos sus partidos del mismo día** | ✅ | En «Agregar invitados» (menú del jugador), si esa persona (misma `personKey`) está anotada en otros partidos del mismo día, aparece «También en sus partidos del día» con cada partido marcado (hora, sede si es otra y lugar libre). Al agregar, se crean los mismos invitados (mismo nombre; `invitedBy` = su fila en ese partido) de a uno, así les toca la promo del día. Si el partido está lleno o él está en espera, van a la lista de espera; lo que ya estaba no se repite y lo que no se puede (solo lectura, tope de anotados) se avisa (`sameDayHostMatches`, `addGuestsToSameDay`, `app.js`). e2e «Agregar invitados ofrece sus otros partidos del mismo día…» y siguientes. Captura `shots-v63/despues-invitados-mismo-dia.png` |
| 29/10 (#45 S1) | **La deuda es siempre del organizador de «Se anotó con»** | ✅ | `owesOrganizer` (`ledger.js`). `organizerMatchDebt` y el cuadro «Faltan pagar (que anoté yo)» filtran por «Se anotó con». Si ese dato no está, siguen con «Agregó». Unit «la deuda es el precio…» y e2e «Faltan pagar cuenta a quien se anotó con Gustavo…» |
| 29/10 (#45 S2) | **Cargar crédito (saldo a favor), por jugador y por organizador** | ✅ | `js/credit.js`, colección `credits`. En el menú del jugador, arriba: saldo en verde (`#menu-credit`) y deuda en rojo (`#menu-debt`). Botón «Cargar crédito». e2e «El saldo a favor del menú está en verde…». **v65:** el mismo bloque (`playerPanelPieces`) está en la ficha (`#profile-credit`, `#debt-total`, `#profile-credit-btn`) y en el menú desde la lista, la espera, Faltan pagar, Historial y Equipos. El botón ya no depende de `canAdd`: en Firebase un admin cuyo uid no está en `adders` no lo veía. `canOfferCredit` lo muestra a cualquier organizador o admin. El crédito se suma al del organizador logueado. `firestore.rules` no cambió. **v69:** el botón es verde (`btn primary`) y queda inmediatamente debajo del saldo. e2e «En el menú, Cargar crédito verde queda bajo el saldo…» |
| 30/10 (v69) | **Saldo con el botón verde, y la deuda con su detalle en rojo** | ✅ | Mismo orden en cada entrada del panel. `firestore.rules` no cambió. **v76:** si se puede anotar, tocar una línea abre la hoja «Pago» de ese jugador en ese partido (título «Pago», jugador, día y hora). Cancelar y Guardar vuelven al menú o a la ficha y la deuda se refresca. Si no se puede anotar, sigue en texto. **v75** abría el menú (↩️). e2e «Tocar la deuda abre el pago de ese partido…» y «Guardar el pago vuelve al menú y actualiza la deuda» |
| 31/10 (v70) | **Pestaña Registro: partidos y pagos** | ✅ | `#/registro/partidos` y `#/registro/pagos`. Partidos: nuevo, borrado, cancelado, reflotado, editado (horario, precio, sede), alta y baja (también en espera; el invitado dice quién lo invitó). Pagos: una línea por medio; la carga de crédito va arriba y después cada pago a un partido; «Transfiere después» entra recién cuando se cobra. `js/log.js`, colección `log`. Índice `editors` + `at` en `firestore.indexes.json`. **v72:** en Pagos, cada línea dice el partido (fecha, hora y sede, `pagoMatchText`). **v73:** el rango arranca 20 días antes de hoy y llega hasta hoy, por `at` (no por la fecha del partido). Desde/Hasta se aplica con Ver. `editorsOf` junta a quien puede ver y a quien puede anotar o quitar; el creador y quien anota el evento siguen. Las líneas ya guardadas no se tocan. e2e «El registro arranca 20 días atrás…», «Cambiar Desde y Hasta no filtra hasta tocar Ver» y «Quien solo puede ver el partido igual ve su registro». **v74:** «Cobró» / «Registró» en Pagos (`paidTo`). Transferencia repartida, una línea. Crédito: el organizador logueado. Carga sin deuda: solo la ve quien la hizo. Edición y borrado: quién cobraba y quién cobra. El pago exige cobrador. e2e «Efectivo, transferencia y crédito dicen quién cobró…» |
| 30/10 (v65) | **La ficha del jugador deja editar el apodo y cargar crédito** | ✅ | Reemplaza el texto fijo «En los partidos se ve como…». Apodo, saldo verde, deuda roja y «Cargar crédito» junto a «Debe en total». e2e «Jugadores: el perfil tiene apodo…» y «Guardar el apodo en el perfil cambia la lista del partido». **v68:** el mismo bloque (`playerPanelPieces`) también tiene «Notas de partido», «Agregar nota» y «Ver estadísticas», en la ficha y en el menú (lista, espera, Faltan pagar, Historial, Equipos) |
| 30/10 (v68) | **Pestaña Estadísticas** | ✅ | A la derecha de Historial. Por jugador, partido, mes y año. Cada organizador ve en la lista solo su agenda (`rosterForOrganizer`); si se abre a un jugador de un partido, se calcula con los partidos visibles y no se muestra el teléfono. Incluye lo que salió de la ficha más partidos jugados, ausencias (`confirmed === 'no'`), goles si están cargados, deuda, saldo, cobrado contra lo que correspondía y totales por medio y por organizador. Las notas en esta pantalla son solo lectura. `js/stats.js`. `firestore.rules` no cambió |
| 29/10 (#45 S3) | **Descontar del crédito, sin cobrador, siempre paga al organizador logueado** | ✅ | Campo «Descontar del crédito» en el pago, sin desplegable. `fromCredit` / `creditTo`. e2e «Descontar del crédito no tiene desplegable…» y «Pagar con crédito figura como Crédito…» |
| 29/10 (#45 S4) | **Sacar del pago los botones 1 partido / Promo 2 / Promo 3 y la ayuda larga** | ✅ | No está `#pay-prices` ni el texto «Lo cobrado es efectivo…». Sigue el cartel de la promo del día y completar el precio al tocar un monto vacío. e2e «El pago no muestra los botones de promo…» |
| 29/10 (#45 S5) | **Los pagos de deudas viejas cancelan primero los partidos más viejos** | ✅ | `settleOldestDebts` (`payments.js`). El pago muestra a qué partido fue cada monto. e2e «La deuda vieja se reparte primero…». **v66:** «Cargar crédito» usa la misma función (`creditAgainstDebts`): primero las deudas con el organizador logueado, de la más vieja a la más nueva. Lo que sobra queda como saldo. La hoja muestra la vista previa (`#credit-preview`) y al guardar el aviso es «Se aplicó…». El pago queda con `fromCredit` y `creditTo`. e2e «La vista previa paga primero el partido más viejo…» y «El crédito pagó las deudas con Gustavo y no la de Martín» |
| 30/10 (v66) | **Cargar crédito cancela la deuda antes de dejar saldo** | ✅ | Solo deudas de «Se anotó con» el organizador que carga. Faltan pagar, Debe en total y el partido quedan al día. Unit «cargar crédito cancela primero la deuda más vieja…». `firestore.rules` no cambió |
| 29/10 (#45 S6) | **Lo que sobra de un pago dividido queda como saldo de quien paga** | ✅ | `splitLeftoverCredit`. El texto dice «queda como saldo a favor de {jugador} con {organizador}». e2e «Lo que sobra del pago dividido…» |
| 30/10 (#45 S7) | **Renombrar un invitado de la promo del día lo renombra en los otros partidos de ese anfitrión** | ✅ | `sameDayPromoGuestRenames` (`guests.js`). Misma identidad anfitrión + nombre. No toca al invitado de otro anfitrión. La promo sigue. No cambia el apodo. e2e «El otro partido del día también se llama Pedro…». **v71:** el campo «Nombre corto (o apodo)» del menú del partido (`#menu-nick`, el mismo en Equipos) solo guardaba el apodo en ese partido: el otro seguía diciendo Invitado 1. Ahora `setPlayerShortName` copia ese apodo a los otros partidos del día del mismo anfitrión. Si se cambia el nombre, o si Ver perfil le crea ficha a uno, esa ficha y el nombre van a los otros y la promo no baja a $5.000. e2e de 2 y 3 partidos por menú, Editar invitado, Equipos y ficha |

## Historial

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 20/10 (#12) | Historial: lo pasado no se borra | ✅ | Pestaña Historial |
| 20/10 (#17) | Últimos 30 por defecto y filtros por fecha | ✅ | «Por defecto muestra los últimos 30» |
| 20/10 (#25) | Chips de sede en Historial | ✅ | PR #25, e2e OK |
| 26/10 (#27 C4, #28 E3) | Importar el historial desde un texto, incluidas las fechas en formato viejo | ✅ | «Importar partidos desde texto», `js/parser.js` |
| 27/10 (#41) y 29/10 (#43 R3) | Cuadro rojo «Faltan pagar (que anoté yo)» en Historial y en las tarjetas de HOY, con la lista que se despliega | ✅ | `oweBox` (`app.js`), `data-owe-toggle`. Desde v64 cuenta por «Se anotó con» (`owesOrganizer`). Si ese dato no está, sigue con «Agregó» |
| 27/10 (#41) | Filtro «Partidos con deudores» | ✅ | `#hist-debtors` (`app.js:804–866`) |

## Equipos

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 20/10 (#13) | Equipos por partido, pechera, azar y WhatsApp | ✅ | `js/teams.js`, «Mezclar al azar», «Compartir lista» |
| 26/10 (#27 B1–B4) | Dos columnas, marcador, goles y «Fue al arco» | ✅ | `normalizeScore`, «Fue al arco», «Faltan ir al arco» |
| 26/10 (#28 E4) | Equipos parejos por nivel; cambiar arrastrando | ✅ | `balanceTeams`, `dropPlayerOn`, «Está desbalanceado» |
| 27/10 (#32) | Los arqueros quedan arriba, en el orden en que se marcaron | ✅ | `orderTeamsByGoal` |
| 27/10 (#35, #36, #39) | La pechera es una musculosa naranja, el ícono de arco en la fila, el nombre abre el menú | ✅ | `team-name`, `data-team-name` (`app.js:613`) |
| 26/10 (#27 C2) | El apodo se ve en Equipos | ✅ | `shownName` (`app.js:611–628`) |

## Ajustes / menú

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 19/10 (#3) | Aviso 2 horas antes y recordatorios | ✅ | «Aviso 2 horas antes», «Enviar recordatorios», `js/reminders.js` |
| 19/10 (#4), 27/10 (#30, #40) | Tamaño del texto: A−/A+, achicar hasta 8px, elegirlo de una lista en Ajustes | ✅ | `index.html:49–51`, `#set-text-size` (`app.js:1526`) |
| 20/10 (#15) | El filtro «Mis» pasó a Ajustes: «Solo lo que anoté y lo que cobré» | ↩️ | **v70, a pedido:** se sacó de Ajustes el casillero y el texto «Oculta… no cambia». Las listas muestran a todos, como con el filtro apagado. Al abrir se borra `f7c-mine` si quedó guardado |
| 20/10 (#11) | Elegir desde qué app de WhatsApp salen los mensajes | ↩️ | Se sacó a propósito en #15 |
| 20/10 (#25) | La app se llama «Mis Partidos» | ✅ | `index.html`, manifest |
| 26/10 (#27 C1) | «Compartir app» | ✅ | `#set-share-app`, `js/share.js` |
| 27/10 (#35, #37, #38) | Backup, carga y reseteo de la base por el admin (BORRAR), con errores claros | ✅ | `#set-backup`, `#set-restore`, `#set-reset-db` (`app.js:1536–1541`) |
| 27/10 (#38) y 29/10 (#43 R6) | El pie del menú muestra solo la versión | ✅ | `<p class="footer-note" id="app-version">Versión ${APP_VERSION}</p>` (`app.js:1549`) |

## Permisos y privacidad

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 19/10 (#3) | Cuentas: el admin crea organizadores | ✅ | `#/usuarios`, «Organizadores» (`app.js:2391`) |
| 19/10 (#8) | Quién ve y quién anota cada partido, «Solo yo» y un límite por organizador | ✅ | «Solo yo», «Llegaste a tu límite» |
| 20/10 (#15, #18) | El WhatsApp del jugador es privado, con el casillero «Mostrar el WhatsApp para todos» | ✅ | `js/privacy.js`. **v67:** el texto pasó a «Permitir que otros organizadores vean su WhatsApp» y el casillero queda a la derecha del número (perfil, alta de partido y alta de Jugadores). Sigue arrancando destildado: el número lo ve solo quien lo cargó. e2e «Permitir ver el WhatsApp arranca desactivado» y «A 390px el número y el casillero van en la misma fila» |
| 20/10 (#19) | Solo edita la ficha quien la creó | ✅ | `canEditRoster`, `js/edit-lock.js` |

## Otros puntos (no son pedidos)

- ⚠️ Siguen con `confirm()` del navegador (Aceptar/Cancelar) preguntas que no son de la lista de espera: «¿Quitar a X del partido?», cancelar, borrar o reactivar un partido, avisar que se canceló, rearmar o resetear equipos, partido duplicado, borrar de Jugadores, notas, organizadores, sedes y datos de demo. Si Gustavo quiere Sí/No en todas, pasarlas a `askYesNo`.
- ⚠️ `README.md` quedó viejo: todavía nombra el botón «Mis», la pestaña Pagos de Jugadores y los tamaños «Chica…Enorme».
- ⚠️ `js/share.js` no está en la lista de precache de `sw.js`. Se guarda en caché igual en la primera visita con conexión, pero en una instalación nueva sin conexión podría fallar la carga.
- ⚠️ **v66, sin cambiarlo:** «Cargar pago» (y el botón 💵 de la fila) siguen detrás de `canAdd`. Un organizador que está en `adders`, creó el partido o el partido es de todos, lo ve. Si el uid de Firebase no está en esa lista, no lo ve: es el mismo caso que escondía «Cargar crédito» en v64. La regla del pago en `players` pide lo mismo (`adders` del jugador); el admin sí puede escribir por la regla general, pero el botón no se abrió para no mostrar un formulario que a un organizador Firestore le rechaza. e2e «Cargar pago sigue oculto si el uid no está en adders» y «En ese partido no aparece Cargar pago».
