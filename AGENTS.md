# CheluisFIT — convenciones

Monorepo pnpm. Todo el texto de la interfaz y los comentarios, **en español (es-ES)**.
Ver también `apps/mobile/AGENTS.md` (avisos sobre Expo) y `README.md`.

## Servidor (`apps/server`)

Fastify 5 + `node:sqlite` + Zod, mismo patrón que `compra-en-familia/apps/api` (ver ese repo
como referencia si hace falta ampliar algo): `db.ts` (migraciones lineales con
`PRAGMA user_version`, helpers `get/all/run/tx`), `auth.ts` (scrypt + sesiones por token
opaco, igual que Compra), `routes/*.ts` (uno por área, `registerX(app, ctx)`), `app.ts`
(monta Fastify: cors/helmet/rate-limit/multipart, manejador de errores con `HttpError`/`ZodError`).

**Modelo de datos — deliberadamente distinto de Compra**: los datos de fitness son
**personales, no de hogar** (§2b del plan). En vez de tablas normalizadas por dominio
(rutinas, entrenos, series…), el servidor guarda **el blob entero que cada tienda zustand ya
persiste en `AsyncStorage`** (`blobs(user_id, key, data, updated_at)`, ver `db.ts`). Un único
endpoint genérico (`routes/data.ts`) sirve las 4 claves conocidas
(`cf_nutrition_v1`, `cf_running_v1`, `cf_strength_v1`, `cf_active_workout_v1`) sin tocar el
dominio ni migrar lógica al servidor. Es una simplificación consciente: sin fusión ni outbox
por operación (a diferencia de Compra). **Desde la 0.11, con control de versión optimista**:
`PUT /api/blobs/:key?base=<updatedAt>` devuelve **409** con el blob del servidor si este ya no
está en esa versión (`base=0` = «espero que aún no haya nada»); sin `base` escribe sin
comprobar (lo que siguen haciendo las APK ≤ 0.10). Responde `{updatedAt}` (antes 204) y
`GET /api/blobs?meta=1` da solo claves y versiones. Exige el envoltorio `{state, version}` y
limita cada blob a 3 MB (413 claro: en Android una entrada de AsyncStorage falla hacia los 2 MB).
Qué hace el móvil con un conflicto: ver «Cliente» más abajo. Si algún día hace falta edición
simultánea de verdad desde varios móviles, ahí sí tocaría un outbox por operación como en Compra.

**Cuentas**: mismo esquema que Compra (`households`/`users`/`sessions`/`invites`), pero sin
recuperación de contraseña ni gestión de sesiones múltiples (se puede añadir copiando el
patrón de Compra si hace falta). Primera cuenta = `SETUP_CODE` del `.env`; el resto, invitación
de un admin (`POST /api/household/invites`). **Cuenta real ya creada en producción** con el
correo del propietario — no se reinicia ni se genera otra por iniciativa propia.
**Aceptar** una invitación ya funciona de punta a punta (campo en `app/cuenta.tsx`); **generar**
una desde la app también — sección «Cuenta» de `(tabs)/mas.tsx`, visible solo si
`user.role === "admin"`, llama a `api.createInvite` y comparte el código con `Share.share` de
React Native (sin dependencias nuevas).

**Fotos** (`routes/media.ts`): subir exige sesión; **descargar no** — la protección es el id
aleatorio de 128 bits en la URL (como las fotos del catálogo de `raw.githubusercontent.com`),
no la sesión. Así `expo-image`/`expo-video` las cargan con `source={{ uri }}` normal, sin
propagar cabeceras de autorización por todos los sitios donde ya se pintan fotos de ejercicio.
Antes de creer que hace falta blindar más esto, recordar: es una app privada para amigos y
familia detrás de un túnel Cloudflare, no un producto público — no sobre-diseñar seguridad
que el propio contexto de uso no pide.

**Asistente de IA** (`routes/ai.ts`, `POST /api/ai/chat`, protegida con sesión): proxy a
Gemini (principal) con Groq de respaldo automático si el primero falla — ninguna clave llega
nunca al móvil. Paquete `ai` (Vercel AI SDK) + `@ai-sdk/google`/`@ai-sdk/groq`, que dan una
interfaz común de *tool calling* para los dos proveedores. Sin `GEMINI_API_KEY`/`GROQ_API_KEY`
en el `.env` (ninguna es obligatoria por separado, pero hace falta al menos una), la ruta
devuelve `503` y la burbuja del móvil ni siquiera se muestra si no hay sesión — pero si hay
sesión y no hay claves, el chat falla con un mensaje claro, no en silencio (el móvil enseña el
`message` del servidor tal cual: 503, 429, 502). Timeout del chat en el móvil: 45 s (Gemini y, si
falla, Groq). **Historial**: el móvil manda los últimos 20 mensajes (`chatHistory()` de
`domain/aiContext.ts`): quita sus propios mensajes de error y convierte las respuestas que solo
traían propuesta en «[propuse añadir…]». El servidor (`AiChatInput` en `schemas.ts`) es además
tolerante: quita vacíos, recorta a 2000 caracteres y a 20 mensajes empezando por la persona —
antes un 400 rompía el chat en el segundo mensaje tras una respuesta sin texto. Claves gratuitas,
sin tarjeta: Gemini en `aistudio.google.com/apikey`, Groq en `console.groq.com/keys`; los
catálogos de modelos gratuitos de ambos cambian con frecuencia, así que los ids de modelo son
variables de entorno opcionales (`GEMINI_MODEL`/`GROQ_MODEL`), no una constante en el código.
**Las herramientas del modelo nunca ejecutan nada por su cuenta** (sin `execute` en la
definición de cada `tool()`): el modelo solo puede *proponer* `add_meal_entry`/`add_note`/
`adjust_goal`, el servidor traduce esas *tool calls* a un `Proposal` tipado en la respuesta, y
es el móvil (`components/ai/AiAssistant.tsx`) quien aplica el cambio de verdad —y solo tras que
la persona pulse «Aplicar»— llamando a las acciones reales de cada tienda (`addEntry`,
`updateActivity`, `updateWorkout`, `setTargetsOverride`), nunca escribiendo el estado a mano.
Cuando el modelo usa una herramienta, `reply` puede venir **vacío** (lo hace de verdad con
Gemini): el móvil no pinta entonces la burbuja de texto, solo la tarjeta de propuesta — que
lleva todo el detalle (nombre, gramos, comida, kcal y macros), porque es lo único que la persona
ve antes de confirmar.
Burbuja flotante visible en cualquier pantalla con sesión iniciada (mismo patrón que
`WorkoutBar`, ver `_layout.tsx`); la sección (nutrición/running/fuerza/general) se deduce de la
ruta actual (`domain/aiContext.sectionForPath`) y decide tanto el texto del sistema que recibe
el modelo como sobre qué actividad/entreno se aplicaría un `add_note`. El contexto que se manda
al modelo es un resumen compacto por sección (`domain/aiContext.ts`: `nutritionContext`/
`runningContext`/`strengthContext`, apoyados en los mismos cálculos que ya usan las pantallas:
`weekSummary`, `weeklyTotals`, `workoutTotals`…) — nunca el histórico entero, por el límite de
tokens/minuto de los planes gratuitos. La conversación del panel es solo en memoria (no se
guarda ni se sincroniza) — cerrar el panel la borra.

**IA con foto** (`routes/aiVision.ts`, `server/src/vision.ts`): dos endpoints aparte de
`/api/ai/chat` — `POST /api/ai/vision/fridge` (Nevera) y `POST /api/ai/vision/product` (escanear
un producto por foto en vez de por código de barras, `escaner-foto.tsx`). Mismas reglas que el
asistente normal (el servidor solo propone, nunca aplica), pero con dos diferencias a propósito:
- **Solo Gemini, sin el respaldo de Groq** — el modelo de Groq configurado por defecto
  (`GROQ_MODEL`) no tiene visión; un reintento silencioso contra él fallaría igual pero sin decir
  por qué. Sin `GEMINI_API_KEY`, 503 directo.
- **Las fotos nunca se guardan**, ni en el móvil ni en el servidor — no pasan por
  `routes/media.ts` ni la tabla `media`: `vision.ts`'s `readImages()` las lee a `Buffer` en
  memoria desde el propio multipart de la petición y se descartan al terminar. Distinto de las
  fotos de publicaciones sociales, que sí se guardan porque se muestran después.
- **La subida reintenta una sola vez, y solo ante un fallo de red inmediato**: `uploadForAi`
  (`api.ts`) — en datos móviles la subida puede no salir a la primera sin que el servidor falle
  (verificado: el endpoint responde en ~2 s). **Un timeout (60 s) no se reintenta**: ese intento
  puede haber llegado ya a Gemini y repetirlo gastaría dos veces la cuota y el límite de 20/hora.
  Un error HTTP se respeta a la primera. Los mensajes distinguen timeout («La subida tardó
  demasiado — prueba con WiFi»), sin conexión y error del servidor. La foto se redimensiona a
  960 px **por el lado largo** (sin ampliar las pequeñas, ~200 KB) antes de subir: una foto del
  sensor sin tocar tarda tanto que el abort se la come antes de salir (visto de verdad: cero
  peticiones en los logs del servidor).
- **Nada de fotos ni datos de salud en los logs**: los errores del SDK de IA (`APICallError`)
  llevan `requestBodyValues` con la foto en base64 o el contexto de la persona. Se registran
  siempre con `logSafeError()` (`http.ts`: nombre, mensaje, `statusCode`, url), nunca el error
  entero. `readImages()` vacía (`part.file.resume()`) cualquier archivo de un campo inesperado —
  sin eso la petición se queda colgada para siempre — y traduce los errores de la librería
  multipart (413 «La foto pesa demasiado»). Sin clave de Gemini, 503 **antes** de leer las fotos.
- **Límites por sesión, no por IP** (`perUserKey` de `http.ts`, en IA, IA con foto y blobs): con
  `trustProxy: true` la IP sale de `X-Forwarded-For`, que el cliente puede inventarse.

`propose_food` es la única *tool* del endpoint de producto (mismo patrón sin `execute` que
`add_meal_entry`/`add_note`/`adjust_goal`): el modelo lee las fotos (delantera obligatoria,
trasera opcional con la etiqueta nutricional) y propone `per100` siempre por 100 g/ml — si la
etiqueta viene por ración, la conversión la hace el modelo, nunca el servidor. La app
(`escaner-foto.tsx`) enseña la propuesta con Aplicar/Descartar y, si se aplica, navega a
`crear-alimento.tsx` con los valores como parámetros de ruta (ampliación del mismo mecanismo de
prefill que ya usaba `barcode`/`name` desde el escáner de códigos) — **no** con `edit=<id>`,
porque no existe ningún `Food.id` todavía; ese `Callout testID="ai-proposed-warning"` avisa de
revisar los datos antes de guardar.
**Ojo con el modelo por defecto**: Google retira modelos del nivel gratuito sin aviso —
`gemini-2.5-flash-lite` pasó a devolver 404 («no longer available to new users») y como el
`catch` de `callVision` convertía todo en un 503 idéntico al de «falta la clave», el fallo fue
invisible en los logs hasta depurarlo a mano (2026-09-24). El defecto ahora es
`gemini-3.5-flash-lite` y el `catch` deja el error real en el log del contenedor. Ante un 503
de visión, mirar primero `docker logs cheluisfit | grep vision` y luego si el modelo sigue vivo.

Nevera (`nevera.tsx`) es solo lectura de contexto, sin *tool calling* (una lista de líneas de
texto es más simple que forzar una `tool` para eso): la lista de ingredientes vive en
`useNutrition().fridge` (mismo blob `cf_nutrition_v1`, sin tocar el servidor) y
`domain/aiContext.ts`'s `nutritionContext()` la añade al contexto del asistente normal si hay
algo escaneado — así "más contexto para sugerir qué cocinar" no necesita ninguna función de
lista de la compra dentro de CheluisFIT (esa existe en la otra app del usuario, Compra en
Familia, repo distinto — fuera de alcance aquí a propósito).

**TDEE adaptativo** (`domain/tdee.ts`, puro, sin acceso a la tienda): en vez de un % de ajuste
fijo por objetivo (`GOAL_ADJUST` en `domain/nutrition.ts`), corrige el objetivo poco a poco según
cómo responde el peso real al déficit/superávit — **siempre con confirmación, nunca en
silencio** (único precedente real de "la app te cambia un número tuyo" en el proyecto es el
asistente de IA, que también usa Aplicar/Descartar). `checkTdeeAdjustment()` compara el cambio de
peso esperado (kcal medias registradas de los últimos 14 días frente al TDEE de fórmula) con el
cambio real (`weightTrendPerDay()`, regresión lineal sobre los pesos de la ventana — no una resta
de dos puntos como `weightChange()`, insuficiente con ruido diario) y devuelve un ajuste
amortiguado (±75 kcal/día por ciclo) y acotado (±300 kcal/día en total). **Si el peso cambia
MENOS de lo esperado, el ajuste BAJA el objetivo, no lo sube** — significa que el mantenimiento
real de la persona es más bajo que el que calculó la fórmula (ojo si se toca esta lógica: el
signo es `esperado − real`, no al revés, verificado con casos numéricos reales en
`tdee.test.ts`). `useNutrition().tdee` (`kcalAdjustment`/`enabled`/`lastCheckedAt`/`pending`) es
**un estado separado de `targetsOverride`** a propósito: un objetivo puesto a mano pausa el
motor (`checkTdee()` no hace nada mientras `targetsOverride !== null`), no compite con él —
mezclarlos haría ambiguo si un número lo puso la persona, la IA o el algoritmo. La cadencia
semanal (`TDEE_CHECK_EVERY_DAYS`) se comprueba en `checkTdee()` (la tienda), no dentro de
`checkTdeeAdjustment()` — así `lastCheckedAt` solo avanza cuando de verdad se evalúa, nunca en
cada montaje de `nutricion.tsx`. **Una sola cuenta del objetivo: `targetsFor()`
(`domain/tdee.ts`)**, que usan `selectTargets()`/`useTargets()` (`data/store.ts`) y `objetivo.tsx`
(antes eran tres copias). Correcciones de la 0.13 (tests en `tdee.test.ts`): el mantenimiento
de referencia es **fórmula + ajuste ya aprendido** (antes cada semana volvía a proponer la
corrección entera encima de la anterior hasta el tope); solo cuentan los **días completos**
(≥ 40 % del mantenimiento y ≥ 800 kcal: los días con solo el desayuno apuntado bajaban el
objetivo); si «sumar calorías de ejercicio» está activado, la media de kcal de ejercicio de la
ventana se suma al gasto; el interruptor apaga de verdad el motor; `lastCheckedAt` solo avanza
si había datos suficientes (`hasEnoughTdeeData`); cambiar objetivo o actividad descarta la
propuesta pendiente. `calcTargets` tiene **suelo** (≥ metabolismo basal y ≥ 1.500/1.200 kcal en
déficit) y calcula proteína y grasa sobre el **peso a IMC 25** si el IMC es mayor. Si la IA
cambia solo las kcal, se recalculan los hidratos (`carbsFor`) y los límites (`limitsFor`).

**PRs de running** (`domain/running.ts`'s `runningPRs()`): mismo espíritu que los récords de
Fuerza pero mucho más simple (una carrera tiene una sola distancia/duración, no varias series) —
la más larga, el mejor ritmo (carreras ≥1 km, para que un sprint corto de prueba no falsee la
marca) y el mejor tiempo en 5K/10K/media maratón: la carrera tiene que cubrir **al menos el 98 %
de la distancia oficial** y se compara (y se enseña) el **tiempo llevado a la distancia oficial**
(`prTimeS`). Hasta la 0.12 bastaba con 4,5 km para un «5K» y ganaba la de menos tiempo, así que
una carrera más corta batía a un 5K de verdad más rápido. Solo `type:
"run"` cuenta — las caminatas no compiten por ritmo. Pura función de lectura sobre
`activities`, sin ningún aviso de "nuevo récord" al guardar (a diferencia de Fuerza): se enseña
en la pestaña Progreso de Running como un resumen siempre actualizado, más simple que
replicar el flujo de celebración de un PR en cada sincronización (que además puede traer varias
actividades de golpe con Garmin/Strava).

**Medidas corporales** (`domain/measurements.ts`, `medidas.tsx`, enlazada desde `peso.tsx`):
mismo patrón que el peso (`domain/weight.ts`/`peso.tsx`) pero con una `kind` además de la fecha
— cintura, pecho, brazo, muslo, cadera. La clave de "una sola medida por día" es (`date`,`kind`),
no `date` a secas, porque varias zonas pueden anotarse el mismo día.

**Racha de constancia** (`domain/streak.ts`, badge en `(tabs)/index.tsx`): días seguidos con
algo registrado, juntando las fechas de las tres tiendas (comidas, carreras, entrenos de
fuerza) en un único conjunto antes de llamar a la función pura — esta no conoce tiendas, solo
fechas. Detalle importante: si hoy todavía no hay nada, no rompe la racha por sí solo (cuenta
desde ayer), para no enseñar un 0 a media mañana. Sin puntos ni gamificación: solo hacer
visible lo que ya está en los datos. Con los datos de ejemplo la racha es de 7 días (lo aserta
`e2e/hoy.spec.ts`).

**Recordatorios más allá del descanso** (`lib/reminders.ts`, sobre `lib/notifications.ts` —
extraído de `restTimer.ts` para que los dos compartan la misma carga condicional de
`expo-notifications`, nunca duplicada): un aviso la mañana (8:00) de un entrenamiento
planificado, identificado por el id del propio plan (`workout-<id>`) para poder cancelarlo sin
tener que guardar el id de la notificación en ningún sitio nuevo — programar/cancelar son
efectos secundarios *best-effort*, sin `await` desde `runningStore.ts`'s `planTemplate()`/
`unplan()`, que siguen siendo síncronas como antes (nunca podían fallar por un problema de
notificaciones). El aviso de comidas es más simple a propósito: una notificación diaria repetida
a las 21:00 (`useNutrition().remindMeals`, interruptor en Más) — no sabe de verdad si ese día ya
se registró algo (eso exigiría reprogramar cada día con la app abierta), mismo compromiso que
cualquier recordatorio de una app de dieta normal.

**Exportar tus datos** (`lib/exportData.ts`, botón en Más): empaqueta los mismos blobs que
`blobSync.ts` ya sincroniza con el servidor (nunca pasa por él, se lee directo de
`AsyncStorage`) en un JSON descargable. **Comportamiento distinto por plataforma, a propósito**:
en la web, descarga por navegador (`Blob`+`<a download>`) porque `expo-sharing` no puede
compartir archivos locales por URI ahí, solo URLs remotas; en nativo, `expo-file-system`
(API nueva basada en clases, `File`/`Paths.cache` — la SDK 57 cambió esto de las funciones
sueltas de antes) escribe un archivo temporal y `expo-sharing` abre la hoja de compartir del
sistema.

**Modo social** (`routes/social.ts`, tabla `profiles`/`follows`/`posts`/`post_media`/`likes`/
`comments` en `db.ts`) — perfiles públicos por defecto (opción privada con solicitudes de
seguimiento), feed, posts con foto y comentarios/likes. Diseño completo en `docs/plan-social.md`
(léelo si vas a tocar esta zona). Lo esencial:
- **Los blobs de fitness siguen siendo privados siempre** — un post comparte un *snapshot*
  copiado en el momento de publicar (`domain/socialSnapshot.ts`: `runSnapshot`/
  `strengthSnapshot`/`freeSnapshot`, `snapshotVersion: 1` para poder cambiar de forma sin migrar
  nada en el servidor), el servidor nunca lee el blob de otro usuario ni interpreta el snapshot
  (Zod solo valida forma/tamaño, ≤8 KB).
- **La ruta GPS no se comparte por defecto**: `trimRoute()` recorta los primeros/últimos ~400 m
  (revelan casa) y deja solo el tramo intermedio; si la carrera es tan corta que no queda tramo
  intermedio seguro, no se comparte nada de la ruta. El switch «incluir recorrido» empieza en off.
- **Cada usuario nuevo recibe un `username` solo automáticamente** (`insertProfileFor()` en
  `db.ts`, llamado desde el registro en `account.ts` y desde el backfill de la migración para la
  cuenta real ya existente): slug del nombre sin acentos, con sufijo numérico si choca.
  `MIGRATIONS` en `db.ts` admite pasos función además de SQL puro precisamente por esto — SQL
  solo no puede reintentar con otro sufijo si hay colisión.
- **`canViewPosts()`** (`routes/social.ts`) es la única regla de visibilidad, usada en todas las
  rutas que devuelven posts: propio, o perfil público, o seguidor con `status = 'accepted'`.
- El feed pagina por cursor compuesto `created_at:id` (evita duplicados/huecos si dos posts
  comparten el mismo milisegundo). `GET /api/social/posts/:id` (un post suelto, para el detalle
  y para «Ver comentarios» desde el feed) respeta la misma regla de visibilidad que el feed.
- Cliente: `data/socialStore.ts` es **la única tienda sin `persist`** del proyecto — el feed es
  paginado y del servidor, no un dato propio que deba sobrevivir offline. `api.ts` absolutiza las
  urls relativas de `/api/media/:id` que manda el servidor (avatar, fotos de posts) una sola vez,
  para que ninguna pantalla tenga que conocer `API_BASE`.
- **Subir foto en una publicación (`social/publicar.tsx`)**: la selección múltiple
  (`allowsMultipleSelection`) es incompatible con `allowsEditing` en `expo-image-picker`, así que
  el picker devuelve el archivo en su formato original — un iPhone puede entregar HEIC, que
  `routes/media.ts` rechaza (`ALLOWED` solo admite jpeg/png/webp/mp4) con un 415 fácil de no ver
  en el toast. `addPhotos()` re-codifica siempre a JPEG con `expo-image-manipulator`
  (`manipulateAsync(uri, [], {compress:0.8, format: SaveFormat.JPEG})`) antes de subir, sea cual
  sea el formato de origen — arreglo de raíz, no depende de `kind` (el bloque de fotos es el
  mismo para publicación libre, carrera o entreno).
- **Buscador de personas** (`social/buscar.tsx`, botón nuevo junto a «Publicar» en la cabecera de
  `(tabs)/social.tsx`): mismo patrón de debounce (~250 ms, sin buscar con menos de 2 caracteres)
  que `anadir.tsx`. Usa `api.socialSearch()`, que ya existía del plan original sin ninguna
  pantalla que lo llamara.

**Cliente** (`apps/mobile/src/data/`): `api.ts` (fetch a `EXPO_PUBLIC_API_URL` o, por defecto,
`https://cheluisfit.redgarverde.com`; **todo fallo sale como `ApiError`** —red caída o timeout
= `status 0` con mensaje en español; el cuerpo se lee como texto antes de interpretarlo, porque
Cloudflare puede responder HTML—), `authStore.ts` (token en `expo-secure-store`; **en
web no existe SecureStore**, ahí el almacén es en memoria — ver trampas), `sync.ts`
(`syncNow()` → `syncBlobs()` de `blobSync.ts`; el blob va **tal cual lo escribe `persist`**, con
su envoltorio `{state, version}` — cualquier código que inspeccione lo subido tiene que mirar
`.state.x`, no `.x` directamente), `useAutoSync.ts` (al volver a primer plano con cerrojo de
1 min, al pasar a segundo plano sin cerrojo, y ~15 s después del último cambio en una tienda).
**Cómo sincroniza `syncBlobs()`** (`cf_sync_meta_v1` guarda, por clave, la versión del servidor
y una huella del JSON local de la última vez que coincidieron): cambió solo lo local → sube con
`base`; cambió solo el servidor → baja y rehidrata esa tienda; **cambiaron los dos → gana el
servidor** (el uso real es casi siempre un solo móvil, decisión del usuario 2026-09-28) y lo
local se guarda en `cf_conflict_backup_<clave>`, recuperable desde Más → Cuenta («Recuperar lo
de este móvil»), con un toast avisando. Excepción: un entreno en curso en este móvil nunca pierde.
**`needsPull`**: `login()` lo marca **antes** de bajar; si la descarga falla (red, timeout),
`syncBlobs()` solo reintenta **bajar**, nunca sube — antes el auto-sync subía lo local (datos de
ejemplo, de otra cuenta o viejos) por encima del historial real de la cuenta. Tests en
`data/blobSync.test.ts` (con tiendas y AsyncStorage dobles) y `e2e/cuenta.spec.ts`.
**Cerrar sesión no borra nada del móvil** (la app es usable sin cuenta), pero los datos quedan
marcados con su `ownerId`: si otra persona se registra en ese móvil, `adoptNewAccount()` no los
hereda (vacía todo), y `pullAllBlobs()` solo respeta un entreno en curso si es de la misma cuenta.
Sin sesión iniciada, la app funciona exactamente igual que antes (local-first, sin red) — el
servidor es aditivo, no un requisito para usar la app.

**⚠️ Datos de ejemplo vs. datos reales — no confundirlos al sincronizar.** La app arranca
siempre con datos de ejemplo (`src/data/seed*.ts`: rutinas, comidas, un perfil con el nombre
`SEED_PROFILE.name`) — **no hay instalación con la app vacía**. Por eso `authStore.login()`/
`register()` (`authStore.ts`) bajan los blobs **en el propio login** (`pullAllBlobs()` +
`rehydrateAllStores()` de `blobSync.ts`), sin preguntar nada: lo que diga el servidor pisa lo
local, y si la cuenta no tiene nada cada tienda se vacía de verdad con `startFresh()` (que
**no** existía al principio y hubo que añadir: `resetDemo()` solo vuelve a poner los datos de
ejemplo, no los quita). Sin este paso, cualquier cuenta real habría recibido las rutinas y el
perfil de ejemplo como si fueran de verdad la primera vez que alguien iniciara sesión — lo
cazan los e2e de `cuenta.spec.ts`, no a ojo. **Excepción deliberada: el registro** (`register()`
de `authStore.ts`, vía `adoptNewAccount()` de `blobSync.ts`) — la app es usable sin cuenta y
al crearla los datos locales reales **pasan a la cuenta** en vez de borrarse; solo se vacían las
tiendas nunca tocadas (sin escritura en AsyncStorage = aún el estado de ejemplo intacto, porque
`persist` no vuelca el estado inicial hasta el primer `set()`). En el **login**, en cambio, el
servidor manda siempre. Al tocar el sync, el login/registro o las tiendas, comprobar que este
paso sigue existiendo.

**Entrar/crear cuenta sale nada más abrir la app la primera vez**, no escondido en Más: `_layout.tsx`
(`Shell`) redirige a `/cuenta?onboarding=1` mientras no haya sesión **y** `useOnboarding` (tienda
nueva, `onboardingStore.ts`) siga en `seen: false` — «Seguir sin cuenta» o cualquier login/registro
marca `seen` y no vuelve a molestar en ese dispositivo. **`onboardingSeen` vive en su propia
tienda sobre `AsyncStorage`, nunca en `authStore`**: en web `authStore` guarda su token en un
`Map` en memoria (no hay `SecureStore` ahí, ver arriba) que se vacía en cada recarga de página —
si el flag viviera allí, cualquier `page.goto()` de los e2e (o cualquier recarga real) volvería a
ver `false` y redirigiría de más. `AsyncStorage` en web sí es `localStorage`, sobrevive a una
recarga. Por eso casi todos los specs de `e2e/` importan `test`/`expect` de `./fixtures` en vez
de `@playwright/test` directamente — ese fixture compartido pone `cf_onboarding_v1` a `true`
antes de cada test para no chocar con la redirección; `cuenta.spec.ts` es la excepción a
propósito, porque es el que prueba la redirección en sí.

**Despliegue**: `node tools/deploy.mjs <versión>` desde la raíz — construye la imagen
(`buildx --platform linux/amd64`, el VPS es x86_64 y el Mac arm64), la sube por SSH, copia
`apps/mobile/dist/cheluisfit.apk`+`version.json` al volumen de datos y reinicia
`~/servicios/cheluisfit` en el VPS. El `Dockerfile` empaqueta el servidor **y** el export web
de Expo (para «un vistazo rápido» desde el ordenador); el APK y `version.json` no van en la
imagen, los deja el script directamente en el volumen (cambian sin recompilar). **Ya
desplegado y accesible** en `https://cheluisfit.redgarverde.com` (Cloudflare Tunnel, ruta
pública ya configurada). Antes de desplegar: `cd apps/mobile && npx expo export --platform
web` (o `pnpm e2e`, que ya lo hace) para tener `apps/mobile/dist/` al día.

## Reglas

- **Expo cambia mucho entre SDK** (ahora la 57): antes de tocar una API de Expo/RN,
  consultar `https://docs.expo.dev/llms.txt`. Dependencias con `npx expo install`.
- **Estilos**: `StyleSheet`/objetos con los tokens de `src/theme/tokens.ts`, nunca colores
  sueltos (salvo el fondo negro fijo del escáner). Sin NativeWind: v4 no está cerrado para la
  SDK 57 y v5 es candidata a versión.
- **Lógica en `src/domain/`**, pura y **con tests** (`pnpm test`). Se moverá tal cual a
  `packages/shared` cuando exista el servidor.
- **Todo dato de historial guarda una copia**: las entradas de comida copian los nutrientes y
  las sesiones de running copian la plantilla (`Activity.plan`). Editar el alimento o la
  plantilla no reescribe el pasado.
- **`cf_active_workout_v1` y `cf_strength_v1` son dos `persist` de AsyncStorage independientes,
  sin transacción compartida** — al terminar un entreno, guardar en el historial (`addWorkout`)
  siempre va ANTES de vaciar el entreno activo (`clearActive()`, `entreno/[id].tsx`): si se
  hiciera al revés (como estaba antes), un cierre de la app justo entre las dos escrituras
  perdía el entreno entero sin posibilidad de recuperarlo (ni retomable, ni en el historial).
  Mismo principio que el resto de "dos escrituras separadas, sin atomicidad" del proyecto (ver
  sync del servidor) — si se añade un flujo nuevo que toque dos `persist` distintos, guardar
  primero el que sea más caro de perder.
- **`findPRs()` (récords de una sesión)**: nunca condicionar la búsqueda de un tipo de récord al
  resultado de otro tipo ya encontrado en una serie anterior del mismo bucle — un récord de peso
  en la primera serie no debe esconder un récord de repeticiones en una serie posterior a otro
  peso distinto (bug real, corregido 2026-09-23: `!best.weight` era del entreno entero, no de la
  serie).
- **Accesibilidad (WCAG 2.1 AA)**: contraste ≥ 4,5:1 en ambos temas, objetivos táctiles
  ≥ 48 dp, `accessibilityLabel` en todo botón sin texto, `aria-checked` en radios/switches.
  Pasar axe (Playwright + `@axe-core/playwright`) en claro y oscuro antes de dar una pantalla por
  buena.
- **No anidar botones**: en web un `Pressable` dentro de otro genera `<button>` en `<button>`.
- **Catálogo de ejercicios** (`src/data/exerciseCatalog.ts` + `catalogGen.json` generado por
  `tools/build-catalog.mjs`): la «semilla» de 75 ejercicios sigue siendo la base (nombres ES
  propios, fotos de free-exercise-db); encima se fusiona el catálogo generado (2.927
  ejercicios más tras deduplicar, 2026-09-28) desde cuatro fuentes abiertas, con prioridad RepDB free (601, nombre e
  instrucciones ES/EN/DE, ilustraciones — **uso en app gratis con atribución visible**, ya
  puesta en «Acerca de» y en el detalle de ejercicio) > hasaneyldrm (1.324, **datos MIT**,
  instrucciones en 10 idiomas; nombres EN traducidos con Gemini — la caché `tools/catalog-cache/
  names-es.json` va en el repo, sin clave no se re-traduce nada) > wger (910, CC-BY-SA, ~70%
  nombre ES, fotos en ~30%) > free-exercise-db. La fusión es por nombre inglés normalizado
  (`normKey`): gana la fuente de mayor prioridad y las demás aportan lo que falte (fotos,
  instrucciones ES, aliases). Las cachés de las fuentes (`tools/catalog-cache/*.json`) están
  commiteadas: el build no depende de red salvo para re-traducir nombres nuevos. Las fotos
  siguen siendo URLs remotas (GitHub raw / wger.de) como hasta ahora — el mirror al VPS propio
  (previsto desde la fase de diseño) sigue pendiente. `catalogGen.json` NO se edita a mano:
  se regenera con `node tools/build-catalog.mjs` y `exerciseCatalog.ts` lo importa y filtra
  colisiones con la semilla (la semilla gana siempre). Lo que decide el script y cubre
  `data/catalog.test.ts`: el **tipo** sale de `inferKind()` (isométricos → `duration`,
  equipamiento de peso corporal → `bodyweight` salvo «weighted»; antes 333 ejercicios de peso
  corporal pedían kilos); se descartan también las copias de free-exercise-db de la semilla
  **por id** (`fed:<id de la semilla>`, el nombre no coincidía y salían dos veces); se fusionan
  los que acaban con el mismo nombre en español; las URLs de fotos van con prefijo corto
  (`fed:`/`repdb:`/`wger:`, las expande `exerciseCatalog.ts`); y **las instrucciones van en
  `catalogInstructions.json` aparte**, cargadas bajo demanda con `loadInstructions()` al abrir la
  ficha (en web es un trozo aparte: el paquete inicial bajó de 5,3 a 4,2 MB).
  **Imágenes (0.15, a petición del usuario: «todos con foto o GIF»)**, por orden de preferencia:
  vídeo propio → fotos (free-exercise-db, RepDB, wger; dos fotogramas alternando) → **GIF de
  ExerciseDB** → nada. Los GIF salen de hasaneyldrm: su `media_id` (guardado en
  `tools/catalog-cache/hv.json`) es el `exerciseId` de ExerciseDB, y la app los **enlaza**
  (`edb:<id>` → `https://static.exercisedb.dev/media/<id>.gif`, 180×180, `contentFit="contain"`,
  caché en disco, parados en miniaturas y con «reducir movimiento»). **Licencia**: la API gratuita
  de ExerciseDB permite apps no comerciales con atribución a AscendAPI; los GIF son © Gym visual
  (atribución en Acerca de y en la ficha). **Si la app llegara a cobrar algo, hay que licenciarlos**
  (ExerciseDB Starter, 199 $) o quitarlos. Además el build **cruza por nombre** los que siguen sin
  imagen con otros que sí la tienen (mismo conjunto de palabras, o Dice ≥ 0,9 con el mismo
  equipamiento; revisión en `tools/catalog-cache/cross-fill-review.txt`), y marca `hidden: true`
  en los que no tienen ninguna imagen (393): `filterExercises` y `suggestSubstitutes` no los
  ofrecen, pero siguen en `CATALOG`/`CATALOG_BY_ID`/`useLibrary` para rutinas y entrenos que ya los
  usaran. Las fotos de free-exercise-db usan la **carpeta real** del repositorio (`folder` en
  `fed.json`; «3/4 Sit-Up» vive en `3_4_Sit-Up/`) — 34 enlaces daban 404. Visibles: 2.534, todos con
  imagen (lo comprueba `data/catalog.test.ts`).
- **Datos de ejemplo** (`src/data/seed*.ts`): los productos con marca y código de barras son
  reales de Open Food Facts; el resto, aproximados. Migraciones del almacén: **hay datos reales,
  migrar de verdad**. Los `migrate` rellenan los campos nuevos desde `empty()`, **nunca desde
  `initial()`** (metería pesos, actividades o rutinas de ejemplo entre los datos reales). Toda
  tienda con `persist` lleva `migrate` (sin él, subir `version` descarta lo guardado).
- **Open Food Facts es de verdad**: `lookupBarcode()` (`src/data/foodApi.ts`) mira primero lo
  local y, si no hay nada, consulta `src/data/offClient.ts` en vivo (`GET world.openfoodfacts.org/
  api/v2/product/:código`, con el `User-Agent` que exige OFF). `BarcodeResult` tiene un cuarto
  estado `"error"` (OFF no contactable, distinto de "no existe") con reintentar y crear a mano, y
  lleva el motivo real (`message`) hasta la pantalla (`scan-error-detail`).
- **`searchFoods()` (buscador de texto) mezcla lo local con USDA FoodData Central en vivo**
  (`src/data/usdaClient.ts`, `GET api.nal.usda.gov/fdc/v1/foods/search`, clave gratuita de
  api.data.gov — no es secreto sensible, solo limita peticiones por IP, 1000/hora). Es en
  inglés: no traduce, así que "lentejas con chorizo" no lo va a encontrar aunque tenga 600.000
  alimentos — por eso los platos caseros españoles concretos (lentejas con chorizo, macarrones
  con atún, paella, fabada...) están precargados a mano en `seed.ts`, con valores de tablas
  orientativos (ninguna base de datos gratuita los tiene con ese nombre exacto). A los
  resultados de USDA **no** se les exige pasar el filtro de coincidencia palabra a palabra de
  `score()` (`foodApi.ts`) — USDA ya hizo su propia búsqueda contra su índice; exigir además que
  el texto en español coincida letra a letra los habría descartado casi siempre.
- **El mismo bug se repite en dos sitios, mismo arreglo**: tanto `escaner.tsx` (código de
  barras) como `anadir.tsx` (`open()`, buscador de texto) navegan a `/alimento/[id]` pasando
  solo el `id`, y esa pantalla busca por id en el estado **local** (`foods`) — un resultado en
  vivo (OFF o USDA) que nunca se ha guardado no se encuentra, aunque la búsqueda haya ido bien.
  Los dos sitios llaman a `saveFood()` **antes** de navegar para evitarlo — si se añade un
  tercer sitio que abra `/alimento/[id]` con un resultado que pueda venir de fuera, necesita el
  mismo `saveFood()` previo.
  **`offClient.ts` distingue dos respuestas de OFF que parecen iguales pero no lo son**: `status:
  0` con `status_verbose: "product not found"` es un "no existe" legítimo (`null`); `status: 0`
  con cualquier otro `status_verbose` (p. ej. `"no code or invalid code"`, que pasa cuando la
  petición en sí llega mal formada) **lanza** en vez de devolver `null` — si no, un fallo real se
  ve exactamente igual que "no está en la base de datos" y no hay forma de distinguirlos sin
  reproducirlo a mano (nos pasó: costó varias rondas de diagnóstico manual dar con esto).
- **Muchas fichas de OFF están genuinamente vacías** (completeness 0,17-0,26, sin `nutriments`
  en absoluto) — no es un fallo nuestro, es la propia base de datos comunitaria (comprobado con
  varios códigos de barras reales de «Estrella de Levante»). `nutrientIssues()`
  (`domain/nutrition.ts`) ya lo detecta («Faltan los valores nutricionales»), y desde 2026-09-23
  el escáner lo avisa **en el propio resultado del escaneo** (`escaner.tsx`, `testID=
  "scan-warning"`), con un atajo directo a `crear-alimento?edit=<id>` para rellenarlo con los
  datos de la etiqueta — antes solo se veía el aviso al llegar a la pantalla de cantidad, un
  paso más tarde.
  **kcal con respaldo en kJ**: `offClient.ts`'s `kcalFrom()` calcula las kcal a partir de
  `energy_100g` (kJ) si `energy-kcal_100g` no está (fichas antiguas/manuales que solo rellenaron
  la energía en kJ) — antes daba 0 aunque la energía sí estuviera, solo que en otra unidad.
  **El alcohol de OFF está en % vol, no en gramos**, pese a llamarse `alcohol_100g`
  (comprobado con una respuesta real: `"alcohol_unit":"% vol"`) — `offClient.ts` lo convierte a
  gramos con la densidad del etanol (× 0,789) antes de guardarlo en `Food.alcoholPer100` (aparte
  de `Nutrients`, no se muestra en pantalla, solo lo usa `nutrientIssues(per100,
  alcoholPer100)` para no confundir la energía real de una bebida alcohólica con macros que no
  cuadran — antes cualquier cerveza/vino/licor real disparaba un falso «las kcal no cuadran con
  los macros», comprobado con datos reales de un whisky: 254 kcal/100 g con macros ≈ 0).
- **Garmin es de verdad, vía Android Health Connect** (`src/data/healthConnect.ts`,
  `react-native-health-connect`, config plugin propio, **no funciona en Expo Go**): Garmin no
  tiene API pública, escribe en el almacén compartido de Android y de ahí se lee. **Para que
  aparezca algo, Garmin Connect necesita el interruptor Ajustes → Health Connect → «Escribir» →
  Sesiones de ejercicio activado a mano en el móvil** — sin eso no hay nada que sincronizar, no es
  un fallo del código. `ExerciseSessionRecord` no trae distancia/calorías/FC embebidas: hace falta
  `aggregateRecord` por sesión (`Distance`, `TotalCaloriesBurned`, `HeartRate`,
  `ElevationGained`) — son opcionales (`sessionAggregates()` los trata con `Promise.allSettled`,
  si faltan se deja el campo vacío). **Solo `ExerciseSession` es imprescindible como permiso**:
  antes se pedían los 5 juntos y se exigía tenerlos TODOS concedidos para considerar que había
  permiso — si Android concedía solo el esencial (la persona no entiende "desnivel" y lo
  deniega, algo habitual), `requestHealthConnectPermissions()` devolvía `false` entero y
  bloqueaba el sync con "sin permiso" aunque de sobra bastara con el esencial. Se pasó a exigir
  solo `ExerciseSession`; el toast de "sin permiso" además ofrece un botón
  ("Conceder permiso" → `openHealthConnectSettings()`) que abre la pantalla de permisos de
  Health Connect directamente, por si el diálogo del sistema no bastó. Solo se importan
  `ExerciseType.RUNNING`/`RUNNING_TREADMILL` → `"run"` y
  `WALKING`/`HIKING` → `"walk"`; el resto (fútbol incluido) se ignora a propósito hasta que exista
  esa pestaña. Deduplicado por `Activity.externalId` (id del registro de Health Connect) vía la
  función pura `mergeImportedActivities()` en `domain/running.ts` — **si necesitas probar la
  lógica de sincronización, hazlo contra esa función pura, no instanciando `useRunning`
  directamente**: la tienda usa `persist`+`AsyncStorage`, que revienta con `window is not
  defined` en vitest (entorno Node) al intentar escribir. **El sync lee con 7 días de solape**
  (`markSynced` en `runningStore.ts` resta una semana a `lastSync` antes de consultar): Garmin
  Connect propaga las sesiones a Health Connect con horas de retraso, así que una carrera
  sincronizada antes de que Garmin la escribiera caía en un hueco que nunca se releía — el
  solape no duplica nada porque el dedupe por `externalId` descarta las ya importadas. **Ojo con
  las borradas**: una actividad importada que la persona borra se apunta en
  `dismissedExternalIds` (`runningStore.ts`, tope 500) para que el solape no la vuelva a traer;
  «Deshacer» la quita de esa lista.
  **Recorridos GPS compactos** (`domain/route.ts`): al guardar se reducen a 300 puntos con 5
  decimales (van dentro de `cf_running_v1`, que se sincroniza entero), y al publicar a 120 (el
  snapshot de un post tiene un tope de 8 KB). La migración v6 compacta los ya guardados.
  **Diagnóstico**: `getSdkStatus()` distingue tres casos, no dos (`checkHealthConnectStatus()`
  en `healthConnect.ts` devuelve `"available" | "not_installed" | "update_required"`) — antes se
  trataban "no instalado" e "instalado pero desactualizado" igual, un mensaje confuso si Health
  Connect ya está en el móvil. Todas las llamadas nativas pasan por `callNative()` (mismo
  archivo), que si lanzan, relanza con el mensaje original incluido — `syncGarmin`
  (`(tabs)/running.tsx`) lo enseña tal cual en el toast en vez de un "no se pudo sincronizar"
  fijo. Antes de asumir que el módulo nativo no está bien enlazado en el build de *release* (R8),
  compruébalo de verdad, no de memoria: `android/app/build/outputs/mapping/release/
  {seeds,mapping,usage}.txt` del build ya compilado dicen si una clase sobrevivió o no.
  **Permisos**: solo `ExerciseSession` es imprescindible (el resto —distancia, calorías, FC,
  desnivel— son opcionales, ya tolerados con `Promise.allSettled` en `sessionAggregates()`); se
  piden los 5 juntos pero solo se exige tener concedido el esencial —pedir los 5 y exigirlos
  todos bloqueaba el sync si Android concedía solo el esencial, algo habitual—.
  `requestHealthConnectPermissions()` primero mira `getGrantedPermissions()` por si ya estaba
  concedido de antes (pedirlo dos veces no siempre vuelve a mostrar el diálogo). **Si aun así
  sale "sin permiso" y Health Connect no ofrece la opción de conceder el permiso a la app**: en
  Android 14+ el interruptor a veces vive en Ajustes del sistema → Seguridad y privacidad →
  Privacidad → Salud (no solo dentro de la propia app «Salud conectada») — varía por fabricante.
  El aviso de "sin permiso" en `running.tsx` deja fijas las dos rutas (`openAppSettings()`,
  ajustes de la propia app, y `openHealthConnectSettings()`, la app de Health Connect) en vez de
  un toast que desaparece solo. Este flujo (`registerForActivityResult` de Android + Activity
  Result Contracts) es históricamente frágil en Android 14 según los issues de la librería
  (matinzd/react-native-health-connect#50, #117, #147) — la mayoría se debían a una regresión ya
  arreglada en RN core (facebook/react-native#42478, en RN desde 0.71.16), y este proyecto va en
  RN 0.86, así que no debería aplicar.
  **La causa real, encontrada con `adb logcat` + `adb shell dumpsys package` en un móvil real
  (Xiaomi/HyperOS, Android 16) el 2026-09-22**: el diálogo de permiso SÍ se abría
  (`GrantPermissionsActivity`, confirmado en el registro) pero se cerraba solo sin conceder nada,
  porque **`app.json` nunca declaraba los permisos de salud** — el plugin de Expo de
  `react-native-health-connect` (`app.plugin.js`, leído directamente) **solo** añade la
  actividad de justificación y el alias de `ViewPermissionUsageActivity`; nunca añade
  `<uses-permission>` para los tipos de dato. Confirmado con `dumpsys package
  com.redgarverde.cheluisfit`: cero permisos `android.permission.health.*` en la lista de
  permisos solicitados, pese a que el resto del manifiesto (`<queries>`, actividad de
  justificación) estaba perfecto — son cosas independientes. Hace falta añadirlos a mano en
  `app.json` → `expo.android.permissions` (documentado en la propia guía de la librería,
  sección Expo):
  ```json
  "android.permission.health.READ_EXERCISE",
  "android.permission.health.READ_DISTANCE",
  "android.permission.health.READ_TOTAL_CALORIES_BURNED",
  "android.permission.health.READ_HEART_RATE",
  "android.permission.health.READ_ELEVATION_GAINED",
  "android.permission.health.READ_EXERCISE_ROUTE",
  "android.permission.health.READ_ACTIVE_CALORIES_BURNED"
  ```
  **Qué se importa (0.13, tests en `healthConnect.test.ts`)**: duración **en movimiento** (se
  restan los segmentos de pausa, como el ritmo del reloj); kcal **activas** (las totales incluyen
  el basal, que ya está en el objetivo del día y se contaba dos veces; sin activas, total − basal
  del rato); agregados **solo del mismo origen** que la sesión (`dataOriginFilter`); paginación con
  `pageToken`; las sesiones ya conocidas no se vuelven a agregar; y las **vueltas** del reloj
  (`lapsFrom`), que al vincular con una plantilla reciben el tipo de su paso si coinciden en
  número (`applyTemplate`) — así «plan vs. real» funciona con datos reales. `matchPlanned` solo
  empareja **carreras** (no caminatas) y primero por plantilla.
  (`READ_EXERCISE_ROUTE` es para «Ver recorrido»: consentimiento aparte por sesión.)
  Comprobar siempre tras `expo prebuild` que aparecen de verdad en
  `android/app/src/main/AndroidManifest.xml` (`grep "permission.health" ...`) — no basta con
  mirar `app.json`, el plugin podría dejar de aplicarlos silenciosamente en una futura versión.
  **La causa real del cierre de la app al pedir el recorrido (o los permisos), encontrada
  2026-09-24**: `react-native-health-connect` 4.x **nunca registra sus `ActivityResultLauncher`**
  — `HealthConnectPermissionDelegate.setPermissionDelegate()` existe en su código pero no la
  llama nadie (ni la librería, ni su app.plugin.js) — así que `requestPermission` y
  `requestExerciseRoute` reventaban con `UninitializedPropertyAccessException` (crash nativo que
  cierra la app, incapturable desde JS: el try/catch de `fetchExerciseRoute()` no servía de
  nada). De hecho los permisos de Garmin nunca se pudieron pedir desde la app: se concedieron
  desde los ajustes del sistema (el código ya comprueba `getGrantedPermissions()` antes, por eso
  el sync funcionaba y solo explotaba «Ver recorrido»). Arreglo: `plugins/withHealthConnectDelegate.js`
  inyecta la llamada en el `onCreate` de `MainActivity` vía `withMainActivity`. Si algún día se
  quita el plugin, el crash vuelve — comprobar tras prebuild que la línea sigue en
  `android/app/src/main/java/.../MainActivity.kt`.
- Los apartados con acceso a red (alimentos, Garmin) se hacen detrás de módulos de datos propios
  (`src/data/foodApi.ts`, `src/data/healthConnect.ts`) para poder cambiarlos sin tocar pantallas.
- **Strava es de verdad, vía OAuth2** (`apps/server/src/strava.ts` + `routes/strava.ts`,
  `apps/mobile/src/data/stravaAuth.ts`): es la **fuente alternativa** a Garmin para
  carreras/caminatas — Health Connect nunca comparte el recorrido GPS de Garmin (límite
  externo, ver más abajo), Strava sí. La fuente es **elección de la persona** (`source` en
  `runningStore.ts`, selector Garmin/Strava en `(tabs)/running.tsx`): conectar una no desactiva
  la otra, y cada una tiene su botón de sincronizar (`sync-garmin`/`sync-strava`) y su
  `lastSync` propio (`lastSync`/`lastStravaSync`). Por defecto es Garmin (no necesita servidor
  ni cuenta). Si Strava está seleccionado pero no conectado, la pantalla lo dice con un aviso y
  ofrece volver a Garmin de un toque — de ahí vinieron los «mis actividades no se cargan»: el
  selector había quedado en Strava y el botón de Garmin ni se veía. Strava exige suscripción de pago para la API desde 2026 — sin claves en el VPS,
  «Conectar Strava» da 503 claro; si algún día se quiere ruta GPS sin Strava, la opción B
  acordada es importar el GPX exportado de Garmin Connect.
  **Registro de la app** en `strava.com/settings/api`: "modo un solo jugador" (sin revisión de
  Strava mientras tenga &lt;10 atletas conectados, de sobra para este uso), dominio de callback
  de autorización = `cheluisfit.redgarverde.com` (sin `https://` ni ruta). Claves en
  `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET` del `.env` del VPS — igual que
  `GEMINI_API_KEY`/`GROQ_API_KEY`, opcionales: sin ellas, «Conectar Strava» da un 503 claro, nunca
  un fallo silencioso.
  **`client_secret` nunca sale del servidor** (a diferencia de OFF/USDA, que el móvil consulta en
  directo): el móvil solo pide `POST /api/strava/connect` (devuelve la URL de autorización con un
  `state` de un solo uso) y abre `WebBrowser.openAuthSessionAsync` esperando el redirect a
  `cheluisfit://strava-connected` (esquema ya registrado en `app.json`); el intercambio del
  código por los tokens lo hace `GET /api/strava/callback` (sin sesión propia — lo visita el
  navegador de Strava, no el móvil autenticado) y guarda/renueva los tokens en `strava_tokens`.
  **Primera sincronización de cada cuenta = desde el momento de conectar, no todo el
  histórico** — evita duplicar carreras ya importadas antes por Garmin (decisión consciente, sin
  fusión automática por fecha: demasiada complejidad para el problema real). El servidor solo
  mapea y devuelve actividades (`toImportedActivity()` en `strava.ts`); la fusión con lo local
  la decide el móvil con `mergeImportedActivities()`, igual que ya hace con Health Connect — el
  servidor nunca toca el blob ni decide dominio.
  La energía de Strava (`kilojoules`) es **trabajo mecánico, no energía gastada**: con ~24 % de
  eficiencia muscular, 1 kJ de trabajo ≈ 1 kcal gastada, y así se guarda (misma equivalencia que
  usa Strava). Hasta la 0.10 se dividía por 4,184 y daba ~4 veces menos.
  **Paginación**: `fetchActivities()` pide hasta 2 páginas de 100; si se corta por el tope, la
  respuesta lleva `until` y el móvil avanza `lastStravaSync` solo hasta ahí (lo demás llega en
  la siguiente). Los recorridos se reducen a 300 puntos con 5 decimales ya en el servidor.

## Robustez (desde la 0.12)

- **Toda tienda con `persist` usa `guardedJSONStorage()` + `guardRehydrate(nombre)`**
  (`data/persistSafety.ts`). En zustand 5 una lectura que falla (JSON corrupto, `migrate` que
  lanza, entrada > 2 MB en Android, SecureStore que no descifra) deja la tienda sin cargar para
  siempre, y `_layout.tsx` no pinta nada hasta que todas cargan: pantalla de carga infinita.
  Con la protección, la tienda arranca vacía, queda **marcada como fallida** (copia del texto en
  `<clave>__ilegible_<fecha>`, salvo la sesión, que lleva el token), `syncBlobs()` nunca la sube y
  baja la copia de la cuenta si la hay. `useStoresHydrated()` además corta a los 5 s. Los fallos
  al **escribir** (disco lleno) y los blobs de más de 1,5 MB avisan con un toast
  (`onStorageProblem`, que escucha `_layout.tsx`; los avisos de antes de montar se encolan).
  Tienda nueva con `persist` → usar lo mismo, o vuelve el riesgo.
- **`ErrorBoundary`** exportado desde `app/_layout.tsx` (`components/ErrorScreen.tsx`, con sus
  propios proveedores: sustituye al layout entero): «Reintentar» / «Volver a Hoy».
- **AsyncStorage de Android a 50 MB** (`plugins/withAsyncStorageSize.js`; por defecto 6 MB, que
  se llenaba en 2-3 años de uso). Comprobar tras prebuild: `grep AsyncStorage_db_size_in_MB
  android/gradle.properties`.
- **Notificaciones**: un único manejador de primer plano (`lib/notifications.ts`), que enseña todo
  salvo el fin de descanso mientras se ve la `RestBar`. El descanso usa el id fijo `rest-timer`
  (antes el id vivía en memoria y tras cerrar la app sonaba dos veces o no se podía cancelar).
  Sin notificaciones reales (web, Expo Go) y fuera de la pantalla del entreno, avisa
  `RestNotifier` con vibración + toast. `resyncWorkoutReminders()` (`lib/reminders.ts`) deja
  programados justo los planes futuros: al cargar `cf_running_v1`, al borrar una plantilla y al
  deshacer quitar un plan; **no pide permiso** (se pide al planificar).
- **Aviso de APK nueva** (`data/appUpdate.ts`, `components/UpdateCallout.tsx` en Hoy y Más):
  lee `/version.json` al abrir y al volver a primer plano (cada 12 h como mucho, solo Android).
- **Despliegue** (`tools/deploy.mjs`): se niega si el export web es anterior al último cambio de
  `apps/mobile/src`; pasa `pnpm -r typecheck` y `pnpm -r test` (`--skip-tests` para saltarlo);
  copia `pre-<versión>-<ms>.db` con `VACUUM INTO` dentro del contenedor antes de reiniciar;
  espera a `/health` con la versión nueva y, si no llega en ~60 s, **vuelve sola a la imagen
  anterior**; el APK se publica solo después, con `.tmp` + `mv`. `.dockerignore` en la raíz.
  Restaurar una copia: README → «Copias de seguridad y cómo restaurar».
- **Servidor**: `backupDb` escribe a `.tmp` y renombra; cada copia purga las sesiones caducadas
  (`purgeExpiredSessions`); `db.close()` al cerrar. CSP con `raw.githubusercontent.com` y
  `wger.de` en `img-src` (las fotos del catálogo; sin eso la web no enseñaba ninguna — los e2e no lo
  ven porque sirven la web sin Helmet).
- **git** en la raíz desde 2026-09-28 (local, sin remoto, decisión del usuario). Un commit por versión.

## Reglas de datos que fijó la 0.13 (no deshacer sin motivo)

- **Editar una entrada reescala su propia copia** de nutrientes (`rescaleNutrients`), nunca vuelve
  a la ficha del alimento; si solo cambia la comida, no se toca. La vista previa de la edición sale
  de esa copia.
- **Alimentos propios**: corregir uno tuyo lo edita en su sitio; corregir uno de fuera crea tu
  versión con `replaces: <id original>`, que oculta el original en la búsqueda y gana en el
  escáner (`saveFoodVersion`, que también pasa favoritos/recientes). `removeFood` + «Deshacer». Los
  alimentos que crea la IA (`ai-…`) no salen en «Mis alimentos».
- **Búsqueda** (`searchFoods`): un resultado de USDA ya usado sigue saliendo (se une por id con el
  guardado); no se exigen palabras vacías («de», «con»…); orden propios → genéricos locales →
  productos locales → USDA en vivo; sin esperas artificiales; `liveError` si USDA no responde (la
  pantalla avisa «Sin conexión»). El escáner consulta todas las variantes del código a la vez,
  solo de longitudes GTIN válidas, y vuelve a pedir a OFF las fichas que estaban vacías.
- **Fuerza**: un entreno olvidado abierto termina 2 min después de la última serie si pasaron más
  de 45 min (`plausibleEnd`); superseries desiguales descansan y vuelven al miembro con series
  pendientes; sustituir conserva el plan; «Repetir» conserva la rutina de origen y el rango de las
  series de trabajo, pero su rutina va marcada `adHoc` y el entreno sale **sin** `routineSnapshot`
  (0.16: antes «Actualizar rutina» pisaba la rutina de verdad con solo lo hecho aquel día); 1RM solo con ≤ 12 repeticiones; los drops no cuentan como serie; en los
  ejercicios por tiempo se progresa sobre lo último aguantado y no hay «1RM».
- **Números a la española** (`parseNum`): «1.000» = mil, «1.234,5» = 1234,5.

## Trampas encontradas

- **`docker-compose.yml` usa `env_file: .env`, que gana a la variable `ENV APP_VERSION` ya
  horneada en la imagen** (`ARG`/`ENV` del `Dockerfile`): si `.env` no se actualiza, `/health`
  sigue informando la versión de la primera vez que se creó ese `.env` en el VPS, aunque la
  imagen y el APK ya sean los nuevos — pasó de verdad (2026-09-23), hizo falta un `ssh` a mano
  para encontrarlo. `tools/deploy.mjs` ya lo arregla solo (un `sed` que solo toca la línea
  `APP_VERSION=`, sin tocar el `SETUP_CODE` real de esa línea de abajo).
- **Cloudflare cachea `/app.apk` en su borde ~4h aunque el servidor mande `Cache-Control:
  no-store`** — comprobado comparando `curl` directo al contenedor por SSH (respeta la cabecera
  del servidor) contra `curl` público (llega `max-age`, `cf-cache-status` distinto de
  `DYNAMIC`). Un móvil que se descargue `/app.apk` a secas puede recibir una copia vieja sin que
  quede ni rastro en los logs del servidor (la petición ni llega a pasar de Cloudflare). No hay
  forma de arreglarlo desde aquí (configuración del panel de Cloudflare, no CLI/SSH — ver
  memoria de trampas del homelab): la URL de descarga real **siempre** lleva `?v=<versión>`
  (`tools/deploy.mjs` la imprime al desplegar), que cambia la clave de caché de Cloudflare y
  fuerza ir al origen.
- **`minSdkVersion` por defecto (24) queda por debajo de lo que pide Health Connect (26)** —
  comprobado con `cd android && ./gradlew -q :app:properties` tras `expo prebuild`, no asumido de
  memoria. Se sube con el plugin `expo-build-properties` (`{"android": {"minSdkVersion": 26}}` en
  `app.json`), sin tocar `compileSdk`/`targetSdk` (ya estaban en 36, por encima de lo que pide).
- pnpm 12 + Metro: `.npmrc` con `node-linker=hoisted`.
- Expo Router 57 trae su propia copia de React Navigation: el tipo de la barra personalizada
  se deduce de `Tabs` (ver `AppTabBar.tsx`); no instalar `@react-navigation/bottom-tabs`.
- `expo start` con `CI=1` desactiva la recarga y sirve código antiguo.
- Android: `borderRadius: 999` no se aplicó en el indicador de la barra de pestañas (usar radio
  explícito = mitad de la altura). `onSwipeableOpen` no borra: la papelera es un `RectButton`.
- Los «códigos» `20512`/`00020512` de Open Food Facts no pasan el dígito de control: se descartan.
- **Hidratación del estado guardado**: los almacenes (zustand + AsyncStorage) cargan de forma
  asíncrona. `src/data/hydration.ts` mantiene la pantalla de carga hasta que están listos; si no,
  un formulario que copia el estado a su `useState` en el primer dibujado muestra los datos de
  ejemplo en vez de los guardados (lo cazó un e2e). Ojo: `useAuth` usa SecureStore, que **no
  existe en web** (objeto vacío, `getItemAsync` lanza) — en web su almacén es en memoria
  (`src/data/authStore.ts`); si se añade otra tienda con persist, su `getItem` debe resolver
  siempre o la app entera se queda en blanco.
- **Teclado en Android** (borde a borde desde la SDK 55+): la ventana ya no se redimensiona; `Screen`
  envuelve todo en `KeyboardAvoidingView behavior="padding"` y `BottomSheet` también. Sin eso el botón
  fijo de abajo queda tapado por el teclado.
- `keyboardType="numbers-and-punctuation"` **solo existe en iOS**, y el teclado numérico de Android no
  tiene «:». Para tiempos y ritmos usar `DurationField` (h · min · s en campos numéricos).
- **Chips y `flexWrap`**: sin `flexShrink: 0` + `numberOfLines={1}` Android parte el texto («jue 17» →
  «jue»). Ya está en `Chip`.
- `pnpm e2e` exporta la web y ejecuta Playwright (funcionales + axe en claro y oscuro); `pnpm e2e:only`
  reutiliza el último export. Tras cambiar código de la app hay que volver a exportar.
- Iconos: `node tools/gen-icons.mjs` (necesita Playwright). Se regeneran solos desde el script.
- **`expo-notifications` rompe Expo Go de Android** (SDK 53+): con solo importarlo lanza un error y la
  app entera queda en blanco. Se carga a mano y solo fuera de Expo Go (`src/lib/restTimer.ts`, comprobando
  `Constants.executionEnvironment`). En Expo Go y en la web el fin de descanso avisa dentro de la app
  (vibración + barra); las notificaciones reales requieren APK o *development build*.
- **Kilos con hasta 2 decimales** (`fmtKg`): los discos de 1,25 kg no caben en un decimal (`fmtNum` los
  mostraba como «1,3»). Usar `fmtKg` para cualquier peso.
- **Un `ScrollView` horizontal crece en vertical** dentro de un contenedor flex: ponerle `flexGrow: 0`
  (los círculos de ejercicios dejaban un hueco enorme).
- **Saltarse un ejercicio no es quitarlo**: al terminar, lo no hecho se descarta del historial, pero los
  cambios para «actualizar la rutina» se calculan ANTES (`routineUpdateFor`). Si no, aceptar borraba de la
  rutina los ejercicios que simplemente no hiciste.
- **Navegación**: volver a las pestañas con `router.dismissTo("/fuerza")`; `router.replace("/fuerza")` desde
  una pantalla raíz apila una segunda copia de las pestañas.
- **ARIA**: no usar `accessibilityRole="tablist"` con hijos que no sean `tab` (axe: aria-required-children);
  `aria-checked` directo en checkbox/radio/switch; esperar a que acaben las animaciones antes de auditar con axe.
- Mover archivos a `src/app/` (un `cat >` desde otra carpeta dejó `crear-ejercicio.tsx` fuera y la ruta seguía
  siendo un marcador vacío).
- La comprobación de coherencia de nutrientes **no suma la fibra aparte** (USDA la incluye en
  los hidratos y la UE no).
- **La navegación de escritorio vive en el `Shell` raíz** (`app/_layout.tsx`), no en
  `(tabs)/_layout.tsx`: `DesktopSidebar` y `WorkoutBar` son hermanos del `Stack`, dirigidos por
  `usePathname()`, para que no desaparezcan al entrar en una ruta fuera de `(tabs)` (`objetivo`,
  `sesion/[id]`, `entreno/[id]`…). `AppTabBar` solo lleva la rama móvil; `Tabs` recibe
  `tabBar={isWide ? () => null : ...}` para no duplicar la barra. Los e2e de escritorio corren
  a 1280×800 en `e2e/escritorio.spec.ts` (los demás specs son 390×844 y nunca prueban `isWide`).
- **Lo que flota abajo** (`WorkoutBar`, burbuja de la IA) se pone encima de lo fijo de la pantalla
  enfocada: cada `Screen` publica en `components/bottomChrome.ts` el alto de la barra de pestañas o
  de su `footer` (medido con `onLayout`) al ganar el foco, y deja hueco al final del contenido para
  cada capa. Antes iban siempre a 68 dp y tapaban el pie de los formularios (visto en el móvil: el
  editor de rutina con un entreno abierto). La burbuja no se pinta en el entreno en curso (tapaba
  los círculos de «hecha»). Una `Screen` fuera del navegador lleva `reportChrome={false}`.
- **`Callout` con texto e interpolaciones** (`Superserie {x}: …`): `children` llega como lista de
  trozos, no como un solo texto; se envuelve en `<Text>` si hay algún trozo de texto. Antes en
  Android esas notas salían **vacías** (la web sí las pintaba: fallo solo del móvil).
- **Editor de rutina**: pregunta «¿Salir sin guardar?» con cambios (flecha propia + `beforeRemove`
  para el «atrás» de Android; en la web `router.back()` va por el historial y `beforeRemove` no
  puede pararlo). Los campos mín./máx. guardan el texto y lo aplican al salir (`commitRepRange`).
- **e2e en la web**: tras elegir en un selector (`Modal`), esperar a que se cierre del todo antes
  de tocar un campo: al acabar de cerrarse devuelve el foco a donde estaba y se pierde lo escrito.
  React Native Web no refleja `accessibilityState.selected` como `aria-selected` en `role="tab"`
  en esta versión: no depender de ese atributo en tests, comprobar con la URL o el color de fondo.

## Sistema de diseño: qué componente usar para cada cosa

Tras la auditoría de coherencia visual (21-22/9/2026), toda pantalla usa estos componentes
comunes de `src/components/ui` en vez de montar el patrón a mano. `src/theme/design.test.ts`
(vitest) falla si reaparece un hex/rgba, un `fontSize`/`lineHeight`/`borderRadius` numérico en
línea, un tamaño de icono numérico o una etiqueta `variant="label"` fuera de `Overline`.

| Necesitas... | Usa | No montes a mano |
|---|---|---|
| Un número grande + unidad + etiqueta (kcal, kg, km) | `Stat` (`sm`/`md`/`lg`/`xl`) y `StatGrid` para varios en fila | `Tile`/`MacroTile` propios |
| Una fila de lista (icono/miniatura + título + subtítulo + extremo) | `ListRow` dentro de `ListGroup` (pone los separadores) | `Row`/`Option`/`*Row` con `Pressable` suelto |
| Un aviso o nota con icono y texto | `Callout` (`tone="neutral\|brand\|success\|warning\|danger"`) | `Card tone="alt"` con borde en hex |
| Un título de sección | `Section` (`kind="content"` = título grande; `kind="overline"` = mayúsculas pequeñas para agrupar listas) o `Overline` suelto para cabeceras de columna (`header={false}`) | `<Text variant="label" color="muted">` repetido |
| Una etiqueta + control (chips, segmentos) en un formulario | `FieldGroup` | `<Text variant="caption">` + control sin agrupar |
| Un selector − valor + | `Stepper` (`layout="stacked"` o `"inline"`, admite `icon`) | Otro `IconButton`×2 + `Text` a mano |
| Casilla/interruptor con texto | `CheckRow` (`kind="checkbox"` o `"switch"`) | `Pressable` con icono de casilla suelto |
| Una opción única dentro de un grupo (radio) | `RadioCard` dentro de `RadioGroup` | `Option` propio |
| Menú de acciones en una hoja inferior | `ActionRow` (uno por acción, `tone="danger"` para borrar) | Varios `Button fullWidth` apilados |
| Confirmar algo que **no** se puede deshacer (vaciar datos, descartar un entreno, borrar en el servidor) | `ConfirmSheet` (título en pregunta, qué se pierde, botón con el verbo) | Borrar al primer toque. Si se puede deshacer, mejor toast con «Deshacer» |
| Fila de chips de filtro | `ChipRow` (desplazable en móvil, se ajusta en varias líneas en escritorio) | `View flexWrap` a mano |
| Modal a pantalla completa (selector, foto ampliada) | `FullScreenModal` (misma cabecera que `ScreenHeader`, `backIcon="close"`) | `Modal` propio con su propia cabecera |
| Ancho, relleno y pie de una pantalla | `Screen` con `variant="tab"\|"detail"\|"form"` | `edges`/`maxWidth` sueltos por pantalla |
| Subsección plegable dentro de una pantalla con mucho contenido | `CollapsibleSection` (`kind="content"\|"overline"`, `defaultOpen`) | Meter todo en una lista plana sin agrupar |
| Lista de tarjetas homogéneas en escritorio (rutinas, plantillas, historial) | `ResponsiveGrid` (1 columna en móvil, 2 desde `medium`) | Una sola columna estirada a todo el ancho |
| Contenido asimétrico en escritorio (mapa/tabla + panel lateral) | Patrón de `nutricion.tsx`/`sesion/[id].tsx`: `isWide ? <Row><Col w={380}/><Col flex={1}/></Row> : <Stack/>` | `ResponsiveGrid` forzado sobre contenido distinto |
| Lista larga o sin techo (biblioteca de ejercicios, búsqueda de alimentos) | `FlatList` (ver `ExercisePicker.tsx`); con `Screen scroll={false}` el contenedor que lleva el `FlatList` necesita `flex: 1` | `ScrollView`/`.map()` sin virtualizar |

**Buscadores y filtros: iguales en toda la app** (desde la 0.12.1, a petición del usuario):
- `SearchField` tiene **alto fijo** (52), el hueco del × siempre reservado y `autoCapitalize="none"`:
  mide lo mismo vacío, lleno, con 120 caracteres o con emojis. Ocupa el ancho de su contenedor;
  en una fila con botones va dentro de `<View style={{ flex: 1 }}>` (nunca `flex: 1` en él mismo:
  en una columna con altura acotada crecía en vertical).
- Reglas comunes en `domain/search.ts`: mínimo `SEARCH_MIN_CHARS` (2) letras, espera
  `SEARCH_DEBOUNCE_MS` (250 ms) si la búsqueda va a red (lo local es inmediato), y la línea de
  estado `SearchStatus` («Escribe al menos 2 letras» / «Buscando…» / «1 resultado»). Buscador nuevo →
  usar lo mismo. Filas de chips de filtro: siempre `ChipRow`.
- `anadir.tsx` es **un solo árbol**: el buscador nunca se vuelve a montar al pasar de «sin
  resultados» a «con resultados». `ExercisePicker` se limpia al abrirse y tiene los mismos filtros
  y contador que la pestaña Ejercicios.

**Textos que no se salen** (0.12.1): `Text` limita la letra del sistema a ×1,3 por defecto
(`maxFontSizeMultiplier`; menos en números grandes y celdas); `Badge` nunca es más ancha que su
contenedor y corta con «…»; `Button` encoge y corta su etiqueta; el valor de `Stat` va en una línea
y se encoge (nativo) o corta (web); `SegmentedControl` en una línea con borde siempre presente. La
tabla de series usa `useSetColumns()` (compacta por debajo de 380 dp: antes medía 344 dp y en un
móvil de 360 el círculo de «hecha» se salía). Fila con texto + etiqueta/botón: el texto con
`flex: 1` o `flexShrink: 1` (en nativo un hijo de fila **no encoge** por defecto), y si no caben
en una línea, `flexWrap`.
**`e2e/estres-visual.spec.ts`** lo comprueba midiendo el DOM a 360 y 390 dp con nombres de 70
caracteres, números grandes y las tres fuentes de actividad: sin scroll horizontal, ningún texto
fuera de la pantalla ni encima de otro (lo que pasa bajo la barra de pestañas o detrás de un modal
no cuenta), y los buscadores del mismo tamaño escribas lo que escribas. Tiene un test de control
que mete un solape a propósito para asegurar que el detector no aprueba siempre. Capturas en
`test-results/estres/`. Lo que **no** cubre: la letra del sistema al 130 % (en la web no se puede
simular; probar en el móvil con `adb shell settings put system font_scale 1.3`).

**Desde la 0.14**: toque mínimo 48 dp en todo (`touch.min`); `IconButton` y `RadioCard` tienen
`disabled` (anunciado al lector de pantalla); `SegmentedControl role="radio"` en los formularios
(sexo, escala de esfuerzo, tema, fuente Garmin/Strava…) y `tabs` solo cuando cambia lo que se ve
debajo; el fondo de `BottomSheet` es un botón «Cerrar hoja» **hermano** de la hoja (si la envolviera,
axe lo marca como `nested-interactive`), así que las hojas no necesitan un «Cerrar» propio;
esfuerzo RIR/RPE con `EffortChips` (una sola copia); tarjetas pulsables con `PressableCard`;
letras de tipo de serie en español (C calentamiento, F fallo, D drop). ESLint: `pnpm lint`
(`eslint.config.js`; las reglas del compilador de React quedan como aviso).

**Guía de textos**: pantallas de creación se titulan «Nuevo/Nueva X», las de edición «Editar X»
(«Corregir datos» cuando es una corrección de un dato ajeno, no una edición propia). El botón
final dice «Crear X» al crear o «Guardar cambios» al editar. «Añadir» es poner algo en una
lista (comida, ejercicio a una rutina); «Registrar» es solo para actividades y peso; «Empezar»
es iniciar un entrenamiento. Formularios de corrección (no creación) usan «Guardar corrección»
o «Guardar cambios», nunca «Guardar X».

**Galería de componentes** (`/galeria`, `src/app/(dev)/galeria.tsx`): todas las variantes del
sistema de diseño en una sola pantalla, en claro y oscuro (se cambia con el propio selector de
Apariencia de la galería). No está enlazada desde ninguna pestaña; se abre entrando a la ruta a
mano. Pasa axe (`e2e/accesibilidad.spec.ts`). Añadir aquí cualquier componente nuevo de
`src/components/ui` antes de darlo por terminado.

**Capturas de referencia** (`e2e/capturas.spec.ts`, `toHaveScreenshot`): ~10 pantallas clave en
claro/oscuro + 2 de escritorio, para detectar cambios visuales no intencionados. Las fotos de
ejercicio (`raw.githubusercontent.com`) se interceptan con `page.route` y se sustituyen por un
PNG fijo, para que la captura no dependa de la red. Tras un cambio de diseño **intencionado**,
regenerar las líneas base:
```
npx playwright test e2e/capturas.spec.ts --update-snapshots
```
`pnpm e2e -- --update-snapshots` **no** reenvía el flag a Playwright a través del `&&` del
script (falla la primera vez con «A snapshot doesn't exist», aunque diga que escribe la
imagen): usar `npx playwright test` directo, o `pnpm e2e:only -- --update-snapshots` una vez
ya exportada la web.
