# Arquitectura

[← Documentación](README.md) · [README del proyecto](../README.md)

CheluisFIT es un monorepo pnpm con dos aplicaciones. Las decisiones finas y las trampas conocidas están en [`AGENTS.md`](../AGENTS.md); aquí va la visión de conjunto con diagramas.

| Paquete | Qué es |
|---|---|
| `apps/mobile` | Expo 57 / React Native con Expo Router. Una sola base de código para el APK de Android y la web. Lógica pura en `src/domain`, estado en tiendas zustand persistidas en AsyncStorage. |
| `apps/server` | Fastify 5 sobre Node 22 con `node:sqlite`. Opcional: cuentas, sincronización de blobs, fotos, proxy de IA, Strava y modo social. Sirve también la web y el APK. |

## Contexto

```mermaid
flowchart LR
  user["Usuario<br/>(móvil Android o navegador)"]
  subgraph cf["CheluisFIT"]
    app["App<br/>APK + web"]
    srv["Servidor propio<br/>(opcional)"]
  end
  garmin["Reloj Garmin"] --> hc["Android Health Connect"]
  off[(Open Food Facts)]
  usda[(USDA FoodData Central)]
  strava[(Strava API)]
  gemini[(Gemini)]
  groq[(Groq, respaldo)]

  user --> app
  hc -- "sesiones, pasos, FC" --> app
  app -- "código de barras" --> off
  app -- "búsqueda de texto" --> usda
  app <-- "HTTPS" --> srv
  srv -- "OAuth2 + actividades" --> strava
  srv -- "chat, análisis, visión" --> gemini
  srv -. "si Gemini falla" .-> groq
```

## Local primero

La app funciona entera sin cuenta y sin red. Todo vive en el dispositivo y el servidor solo guarda copias.

```mermaid
flowchart TB
  subgraph app["apps/mobile"]
    ui["Pantallas (Expo Router)<br/>Hoy · Nutrición · Running · Fuerza · Social · Más"]
    domain["domain/<br/>objetivos, TDEE adaptativo, nutrientes,<br/>GTIN, running, 1RM (lógica pura, testeada)"]
    stores["Tiendas zustand<br/>store · runningStore · strengthStore · activeWorkoutStore…"]
    as[("AsyncStorage<br/>un blob por tienda<br/>{state, version}")]
    sync["blobSync.ts + useAutoSync.ts"]
    clients["Clientes de red<br/>offClient · usdaClient · healthConnect · api"]
    ui --> domain
    ui --> stores
    stores <--> as
    sync <--> as
    ui --> clients
  end
  sync <-- "GET/PUT /api/blobs/:key?base=…" --> srv["apps/server"]
```

El servidor guarda **el blob entero de cada tienda**, sin normalizar en tablas. Así el esquema del móvil puede evolucionar (con las migraciones de zustand `persist`) sin tocar el servidor, y el servidor nunca interpreta los datos de fitness de nadie.

## Servidor

```mermaid
flowchart LR
  subgraph srv["Contenedor cheluisfit (Node 22)"]
    http["http.ts<br/>helmet · CORS · límites por sesión"]
    auth["auth.ts<br/>scrypt · sesiones opacas · invitaciones"]
    blobs["routes: blobs<br/>versionado optimista (409) · 3 MB"]
    ai["routes: IA<br/>chat · análisis · visión (producto, nevera)"]
    social["routes: social<br/>perfiles · seguir · feed · likes · comentarios · avisos"]
    stravaR["strava.ts<br/>OAuth2 + sincronización"]
    media["media<br/>fotos (posts, perfil, portada)"]
    backup["backup.ts<br/>VACUUM INTO cada 6 h"]
    db[("SQLite WAL")]
    http --> auth & blobs & ai & social & stravaR & media
    auth & blobs & social & stravaR & media --> db
    backup --> db
  end
```

## Despliegue

```mermaid
flowchart LR
  movil((Móvil / navegador)) --> cloudflare["Cloudflare<br/>cheluisfit.redgarverde.com"] --> tunnel["cloudflared"]
  subgraph vps["VPS casero · Docker rootless"]
    tunnel --> app["cheluisfit<br/>API + web + /app.apk"]
    app --> data[("data/<br/>cheluisfit.db + backups/")]
  end
  mac["Mac: tools/deploy.mjs"] -- "imagen + APK firmado<br/>copia pre-despliegue<br/>vuelta atrás si /health falla" --> vps
  vps -- "tools/backup-offsite.mjs<br/>copias de la BD" --> mac
  mac -- "git bundle + clave del APK" --> vps
```

## Modelo de datos del servidor

```mermaid
erDiagram
  households ||--o{ users : agrupa
  households ||--o{ invites : emite
  users ||--o{ sessions : abre
  users ||--o{ password_resets : "código del admin"
  users ||--o{ blobs : "una fila por tienda"
  users ||--|| profiles : "perfil público"
  users ||--o{ follows : sigue
  users ||--o{ posts : publica
  posts ||--o{ post_media : fotos
  media ||--o{ post_media : ""
  posts ||--o{ likes : recibe
  posts ||--o{ comments : recibe
  users ||--o{ notifications : "bandeja de avisos"
  users ||--o| strava_tokens : conecta
  users ||--o{ strava_oauth_states : "OAuth en curso"

  blobs {
    text user_id FK
    text key "cf_running_v1, cf_strength_v1…"
    text data "JSON {state, version}"
    int updated_at "versión optimista"
  }
  posts {
    text id PK
    text snapshot "copia de la carrera o el entreno"
  }
  profiles {
    text username UK
    text display_name
    int is_private
    text stats "resumen que sube el móvil"
  }
```

## Decisiones

| Decisión | Por qué |
|---|---|
| Local primero | La app tiene que funcionar en el gimnasio sin cobertura y sin crear cuenta. |
| Blobs enteros en lugar de tablas | Un solo esquema que mantener (el del móvil) y un servidor que no lee datos de salud. |
| Versionado optimista y «gana el servidor» | El uso real es casi siempre un solo móvil. Lo local que pierde se guarda en `cf_conflict_backup_<clave>` y se puede recuperar. Un entreno en curso nunca se pierde. |
| La IA propone, el usuario confirma | El asistente nunca escribe nada por su cuenta. |
| IA en el servidor con respaldo | Las claves no viajan en el APK. Si Gemini falla, responde Groq. |
| Posts con snapshot | Compartir una carrera no expone el historial: el post lleva una copia y el servidor nunca lee el blob de otro usuario. |
| APK propio, sin tiendas | Uso personal y de familia. Se instala desde `/app.apk?v=<versión>` (con `?v=` para saltarse la caché de Cloudflare). |
| Expo con módulos nativos | Health Connect y las notificaciones de descanso necesitan un APK propio: Expo Go no basta. |
