# CheluisFIT — plan social (feed, entrenos compartidos, follows, fotos, comentarios, likes)

**Estado: construido y desplegado (2026-09-23).** Las 5 fases de la sección 6 están hechas:
servidor (`routes/social.ts`, migración con backfill), dominio (`domain/socialSnapshot.ts`),
cliente (`data/api.ts`, `data/socialStore.ts`, pestaña `(tabs)/social.tsx`, `app/social/*`),
e2e (`e2e/social.spec.ts`) y despliegue. Este documento se queda como referencia de diseño; los
detalles de implementación reales (algún ajuste sobre lo aquí escrito) están en `AGENTS.md`.

## Contexto y decisiones tomadas

CheluisFIT pasa de app estrictamente privada (datos personales por usuario, blobs privados) a
tener capa social **pública con follows**: perfiles descubribles, follow, feed, posts
vinculados a entrenos reales (running/fuerza) o libres con fotos, comentarios y likes.

Decisiones de diseño que gobiernan todo lo demás:

1. **Los blobs siguen siendo privados. Siempre.** El modelo actual (`blobs(user_id, key)`,
   último PUT gana) no se toca. Compartir un entreno = **copiar un snapshot denormalizado**
   de los datos elegidos dentro del post. Nadie lee el blob de otro; el feed nunca toca
   `routes/data.ts`. Esto respeta el §2b del plan original y evita rehacer el sync.
2. **El snapshot se construye en el móvil** (dominio puro, testeable), no en el servidor: el
   servidor solo valida y guarda. El publisher decide qué comparte; el servidor no filtra
   blobs ajenos porque nunca los ve.
3. **La ruta GPS no se comparte por defecto** — revela casa/puntos de salida. El snapshot la
   recorta (primeros/últimos ~400 m) y el usuario puede quitarla del todo en el editor de
   publicación.
4. **Perfil público por defecto, con opción privada.** Si el perfil es privado, sus posts solo
   los ven seguidores aceptados y los follows pasan a ser solicitudes (`status` en la tabla
   `follows` desde el día 1 — no añadirlo después es una migración innecesaria).
5. **Sin sobre-diseño de moderación** (contexto: app de amigos/familia detrás de Cloudflare):
   borrar comentarios lo puede quien lo escribió o el dueño del post, rate-limit en
   mutaciones, y nada más en v1.

## 1. Servidor — `apps/server`

### 1.1 Migración nueva en `db.ts` (MIGRATIONS, `PRAGMA user_version` lineal)

```sql
CREATE TABLE profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,              -- slug corto, único, editable
  bio TEXT NOT NULL DEFAULT '',
  avatar_media_id TEXT REFERENCES media(id),  -- reutiliza tabla media existente
  is_private INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE follows (
  follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (follower_id, followee_id)
);
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('run','strength','free')),
  text TEXT NOT NULL DEFAULT '',              -- comentario del autor
  snapshot TEXT NOT NULL,                     -- JSON denormalizado del entreno (o '{}')
  created_at INTEGER NOT NULL
);
CREATE TABLE post_media (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (post_id, media_id)
);
CREATE TABLE likes (
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
);
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
-- Índices para el feed y los perfiles
CREATE INDEX idx_posts_user_created ON posts(user_id, created_at DESC);
CREATE INDEX idx_follows_followee ON follows(followee_id, status);
CREATE INDEX idx_comments_post ON comments(post_id, created_at);
```

Backfill: usuarios existentes (hay cuenta real en producción) obtienen fila en `profiles` al
arrancar la migración si no la tienen, con `username` derivado de `name` (slug + sufijo
numérico si colisiona). `UNIQUE` en `username` reserva el problema de carreras: reintento con
otro sufijo.

**Nota técnica (comprobado en `db.ts`)**: `MIGRATIONS` es hoy `string[]` — cada paso es una
sola sentencia SQL ejecutada con `db.exec()`, sin forma de correr lógica JS por fila dentro de
la misma migración. El backfill de `username` con colisiones necesita justo eso (slug, y si
choca, probar `slug-2`, `slug-3`...). Antes de escribir la migración de `profiles`: ampliar
`MIGRATIONS` a `(string | ((db: DB) => void))[]` y que `migrate()` ejecute la función dentro de
la misma transacción `BEGIN`/`COMMIT` si el paso no es un `string` — cambio pequeño y contenido
en `db.ts`, mantiene el backfill como parte atómica de su propio paso de migración en vez de un
script de arranque aparte (que podría saltarse o desincronizarse del `PRAGMA user_version`).

### 1.2 Ruta nueva `src/routes/social.ts` — `registerSocial(app, ctx)`

Registrada en `app.ts` junto a `registerData`/`registerMedia`/`registerAi`, mismo patrón
`registerX(app, ctx)`. Todo exige sesión (`requireUser`). Validación Zod como el resto.
Rate-limit propio en mutaciones (mismo mecanismo que `authLimit` en `account.ts:19`,
p. ej. `max: 60, timeWindow: "1 hour"` para posts/likes/comentarios).

Endpoints:

| Método y ruta | Qué hace |
|---|---|
| `GET /api/social/feed?cursor=` | Posts propios + de seguidos aceptados, paginado por cursor (`created_at,id`), incluye por post: autor (username, nombre, avatar), snapshot, media (urls), `likesCount`, `likedByMe`, `commentsCount`. |
| `GET /api/social/users/:username` | Perfil público: bio, avatar, counts (posts, seguidores, seguidos), `followState` (none/pending/accepted/self) y sus posts públicos (o todos si lo sigues y es privado). |
| `POST /api/social/posts` | Crea post `{kind, text?, snapshot, mediaIds[]}` — **verifica que cada `mediaId` del array pertenece al usuario** (`media.user_id`) antes de enlazar; si no, 403. |
| `DELETE /api/social/posts/:id` | Solo el dueño. Cascada en `post_media`/`likes`/`comments`. |
| `PUT /api/social/posts/:id/like` / `DELETE` | Like idempotente (PK evita duplicados). |
| `GET /api/social/posts/:id/comments` | Lista con autor. |
| `POST /api/social/posts/:id/comments` | Crea comentario (texto 1–500). |
| `DELETE /api/social/comments/:id` | Dueño del comentario o dueño del post. |
| `PUT /api/social/follows/:username` / `DELETE` | Follow: si el perfil es privado → `pending`, si público → `accepted`. Unfollow borra la fila. |
| `GET /api/social/search?q=` | Búsqueda de usuarios por username/nombre (LIKE, máx. 20). |
| `PUT /api/social/profile` | Editar bio, avatar (mediaId propio), `is_private`, username (con chequeo de UNIQUE). |
| `GET /api/social/follows/pending` | Solicitudes pendientes (perfil privado) + `PUT /accept`/`DELETE /decline` por username. |

Visibilidad centralizada en un helper `canViewPosts(viewerId, profile)` — siempre misma
regla: propio, o perfil público, o seguidor aceptado. El feed solo consulta posts de gente que
pasa el filtro (self + accepted followees), así no hace falta filtrar por post.

### 1.3 Decisiones backend concretas

- **IDs**: `randomUUID()` de `node:crypto`, igual que `routes/media.ts:37` (id aleatorio de
  122 bits, no adivinable por fuerza bruta — la misma garantía que ya usan las fotos).
- **Snapshot opaco para el servidor**: se valida con Zod como `z.record(z.unknown())` más
  límites de tamaño (máx. ~8 KB serializado) — el servidor no interpreta el contenido; lo
  devuelve tal cual. La interpretación la firma el móvil con tipos versionados
  (`snapshotVersion: 1`), así cambiar campos no migra nada en el servidor.
- **Media de posts**: reutiliza `/api/media` tal cual (subida autenticada, descarga por id
  aleatorio). Las fotos de posts comparten la protección por-ofuscación de las fotos de
  ejercicio — coherente con el nivel de seguridad que ya aceptó el proyecto (AGENTS.md,
  sección Fotos). Se documenta como decisión consciente, no como descuido.
- **Borrado de cuenta**: cascadas `ON DELETE CASCADE` ya cubren perfiles/follows/posts/likes/
  comentarios. El `snapshot` muere con el post.
- **Tests servidor** (`api.test.ts`, mismo estilo que la suite de `/api/ai/chat`): registro de
  2-3 usuarios de prueba y verificación de — aislamiento (B no ve posts de A si A es privado y
  no hay follow; B sí si follow aceptado), creación con media ajena → 403, like idempotente,
  comentar y borrar (propio/ajeno/no-dueño → 403), unfollow, paginación del feed, backfill de
  `profiles` en la migración.

## 2. Snapshot — funciones puras en `domain/`

Nuevo `apps/mobile/src/domain/socialSnapshot.ts` (seco, con tests, mismo patrón que
`aiContext.ts`):

- `runSnapshot(activity)` → `{ snapshotVersion: 1, kind: "run", title, date, distanceM,
  durationS, avgHr, maxHr, ascentM, kcal, pace, laps?: {label, pace}[], route?: {lat,lon}[] }`.
  La **ruta se recorta** en el dominio (`trimRoute(route, ~400m por extremo`, función pura
  testeada) y el caller puede pasar `route: undefined` para no compartirla.
- `strengthSnapshot(workout, routine, exerciseNames)` → `{ snapshotVersion: 1, kind:
  "strength", title, date, exercises: [{name, sets: [{reps, kg, rpe?}]}], totals }`. Es el
  «registro de pesos y series» visible socialmente: se comparte lo que la pantalla de detalle
  ya muestra (`workoutTotals`), sin más.
- `freeSnapshot()` → `{ snapshotVersion: 1, kind: "free" }`.
- `snapshotSummary(snapshot)` → texto corto para tarjetas/IA (reutilizable por el asistente).

Test nuevo `socialSnapshot.test.ts`: recorte de ruta (extremos recortados, interior intacto,
rutas cortas → sin ruta), totales de fuerza, tamaño del JSON < límite del servidor.

## 3. Cliente móvil

### 3.1 `data/api.ts`

Métodos nuevos sobre `request()` (mismo patrón que `aiChat`): `socialFeed(token, cursor)`,
`socialPublish`, `socialDeletePost`, `socialLike/socialUnlike`, `socialComments`,
`socialAddComment`, `socialDeleteComment`, `socialFollow/socialUnfollow`,
`socialAcceptFollow/socialDeclineFollow`, `socialProfile`, `socialSearch`,
`socialUpdateProfile`, `socialPendingFollows`. Tipos `Post`, `PostAuthor`, `Comment`,
`Profile`, `FollowState`, `Snapshot` exportados de aquí (son el contrato cliente-servidor).

### 3.2 Tienda ligera `data/socialStore.ts`

No va al blob de sync (el feed es paginado y del servidor, como cualquier red social): zustand
con `{ posts, cursor, hasMore, loading, refresh(), loadMore(), applyPost/updateCounts }` — la
pantalla del feed lee de aquí; las acciones (like, comentar, publicar) actualizan el post en
caché tras la llamada, sin refetch completo. Sin persistencia en AsyncStorage (o solo caché de
la primera página si se nota parpadeo; v1: en memoria).

### 3.3 UI — nueva pestaña Social

- **Pestaña nueva `(tabs)/social.tsx`** — feed. Hay que tocar `(tabs)/_layout.tsx` (icono
  `people`/`account-group`, etiqueta «Social»). Feed con `FlatList` paginado (mismo patrón de
  virtualización que `ExercisePicker`), pull-to-refresh, tarjetas `PostCard`.
- **`components/social/PostCard.tsx`**: cabecera (avatar, username → perfil, fecha relativa),
  cuerpo según `kind` — *run*: distancia, ritmo, tiempo, FC + mini `RouteMap` si el snapshot
  trae ruta; *strength*: lista «Press banca 4×8 @ 80 kg» con totales; *free*: solo texto —
  carrusel de fotos (`expo-image`, mismas urls de media que ya usa la app), fila de acciones
  (like con contador, comentarios con contador) y texto del autor.
- **`app/social/publicar.tsx`**: eliges **entreno reciente** (selector sobre `runningStore`/
  `strengthStore` de los últimos 30 días) o «publicación libre» → texto, switch «incluir
  recorrido» (por defecto **off**; si se activa, va recortada), fotos opcionales (comprobado
  contra la documentación real de `expo-image-picker` 57: `launchImageLibraryAsync({
  allowsMultipleSelection: true, selectionLimit: 4 })`, devuelve `assets[]`; subidas una a una
  con `api.uploadMedia` antes de publicar, igual que ya hace donde se suben fotos de ejercicio).
  Previsualización del snapshot antes de enviar.
- **`app/social/post/[id].tsx`**: detalle + lista de comentarios + caja de comentario
  (`TextField`, mismo patrón que comentarios de notas de sesión).
- **`app/social/perfil/[username].tsx`**: cabecera (avatar grande, bio, counts), botón
  Seguir/Dejar de seguir/Solicitado, solicitudes pendientes si es el propio perfil privado,
  grid/lista de sus posts. Entrada al perfil propio desde `(tabs)/mas.tsx` (fila nueva
  «Mi perfil social») además de desde cualquier PostCard.
- **`components/social/`**: `PostCard`, `LikeButton`, `CommentRow`, `FollowButton`,
  `UserRow`, `ActivityPicker` — mismo lenguaje visual que `Callout`/`ActionRow`/tokens
  existentes (nada de estilos nuevos fuera de sistema).
- **Permisos/estados**: sin sesión, la pestaña Social muestra EmptyState «Inicia sesión»
  (igual que hacen las secciones con servidor). Errores de red → `toast()`/`Callout`, nunca
  pantalla rota (mismo criterio que el chat de IA).

### 3.4 Asistente de IA (extensión opcional, fase 2)

`socialContext` en `aiContext.ts` («tus seguidos publicaron X, Chelu hizo 10 km hoy») — **no
incluido en v1**; el snapshot ya deja los datos listos. Se apunta en el documento como mejora.

## 4. Seguridad — checklist explícito

- Aislamiento por usuario en **todas** las consultas: el `WHERE` nunca devuelve posts de
  quien no pasa `canViewPosts`. Test de penetración básico en la suite: B nunca recibe ni en
  feed ni en perfil ni en detalle lo que no debe (incluido adivinar ids de posts UUID por
  fuerza bruta trivial → el GET de detalle también aplica `canView`).
- `mediaIds` de otros → 403 (verificación de propiedad, no solo existencia).
- Rate-limit en creación de posts/comentarios/likes/follows (anti-spam de la cuota del VPS).
- Snapshot con límite de tamaño y sin campos libres ilimitados (Zod acota `text` ≤ 1000,
  `snapshot` ≤ 8 KB).
- Ruta GPS recortada en el dominio + off por defecto en la UI (anti-stalking domicilio).
- Comentarios: solo texto (nada de HTML/markdown renderizado → sin XSS; se pinta como `Text`).
- Fotos: sin EXIF-strip en v1 (mismo nivel que las fotos de ejercicio actuales); se documenta.
  Si se quiere, `expo-image-manipulator` quita EXIF en el móvil antes de subir — 3 líneas,
  se deja anotado.
- nada de PII nueva en logs: los logs de Fastify existentes loguean URL — los ids de post son
  UUID, aceptable; no loguear cuerpos de posts/comentarios.

## 5. Verificación

- `pnpm test` server: suite social (aislamiento, permisos, likes, follows, paginación).
- `pnpm test` mobile: `socialSnapshot.test.ts`.
- `pnpm e2e`: `social.spec.ts` — intercepta `/api/social/*` (mismo patrón que `ai.spec.ts`):
  feed pinta posts mockeados, publicar desde un entreno seed crea el snapshot esperado (ruta
  recortada), like cambia contador, comentar aparece en la lista, follow cambia el botón,
  perfil privado sin follow no muestra posts.
- Typecheck ambos. Despliegue `0.3.0` con `tools/deploy.mjs`, APK incluido
  (`tools/build-apk.mjs 0.3.0`).
- Manual: dos cuentas reales (la del propietario + una de prueba con invitación), follow en
  ambos sentidos, publicar un rodaje con y sin ruta, comentar/dar like desde la otra cuenta,
  comprobar que un tercero sin follow no ve nada si el perfil es privado.

## 6. Fases de entrega

1. **Backend**: migración + `routes/social.ts` + suite de tests servidor.
2. **Dominio**: `socialSnapshot.ts` + tests (ya desbloquea la fase 3).
3. **Cliente**: `api.ts` + `socialStore` + pestaña feed + publicar + detalle + perfil + follows.
4. **e2e** `social.spec.ts` + accesibilidad básica de las pantallas nuevas (testid, foco).
5. **Deploy** 0.3.0 (imagen + APK) y prueba manual de las dos cuentas.

Fuera de v1 (apuntado en el documento, no construido): notificaciones de «X te ha seguido/
comentado» (hoy no hay push ni cron), edición de posts, historial de marcas (PRs) como vista
social propia, compartir fuera de la app, `socialContext` para la IA, strip de EXIF, «quitar
seguidor» sin necesidad de que él te deje de seguir (solo `unfollow` desde el lado propio).
