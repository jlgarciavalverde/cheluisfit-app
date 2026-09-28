# CheluisFIT

App de fitness para uso personal y de amigos y familia: **nutrición**, **running**,
fútbol y fuerza. Android nativo (APK) y web.

**Estado:** la app funciona con datos en el dispositivo y **servidor propio** (`apps/server`,
Fastify: cuentas, sincronización y fotos) desplegado en el VPS casero
(`node tools/deploy.mjs <versión>` desde la raíz). Alimentos por código de barras vía **Open
Food Facts en vivo**, buscador de texto ampliado con **USDA FoodData Central en vivo**
(+600.000 alimentos, gratis, más los platos caseros españoles precargados en `seed.ts` — USDA es
en inglés y no los encuentra por su nombre), y actividades reales de **Garmin, vía Android
Health Connect** (`react-native-health-connect` — requiere que Garmin Connect tenga activado el
interruptor de escritura en Health Connect, y un *development build*, no Expo Go). **Asistente
de IA** (Gemini con Groq de respaldo, gratis, ver `AGENTS.md`) en una burbuja flotante en
cualquier pantalla: recomienda comidas, comenta el rendimiento y puede proponer cambios que la
persona confirma antes de que se apliquen — necesita `GEMINI_API_KEY`/`GROQ_API_KEY` en el
`.env` del servidor. **Modo social** (pestaña Social): perfiles públicos u opcionalmente
privados, seguir gente, feed con posts vinculados a una carrera o entreno real (o libres, con
fotos), comentarios y likes — el diseño completo está en `docs/plan-social.md`.

## Arrancar

```bash
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
pnpm install
cd apps/mobile
npx expo start --web            # navegador: http://localhost:8081
npx expo start --android        # emulador Android (instala Expo Go solo)
pnpm typecheck && pnpm test     # comprobaciones (tipos + lógica)
pnpm e2e                        # exporta la web y pasa Playwright + axe (156 pruebas)
cd ../server && pnpm test       # tests del servidor (36)
```

**Expo Go ya no basta** para probar la app completa: las notificaciones de fin de descanso y
Health Connect (Garmin) son módulos nativos que solo existen en un APK/*development build*
(`npx expo run:android`). Expo Go sigue sirviendo para iterar rápido en el resto de pantallas.

## Estructura

```
apps/mobile/src
  app/         rutas (Expo Router): (tabs)/ = Hoy, Nutrición, Running, Fuerza, Más
  components/  ui/ = sistema de diseño; nutrition/, running/, charts/
  domain/      lógica pura sin React Native (objetivos, nutrientes, GTIN, running)
  data/        estado local (zustand+AsyncStorage) + datos de ejemplo + Open Food Facts
               (`offClient.ts`) + USDA FoodData Central (`usdaClient.ts`) + Health Connect
               (`healthConnect.ts`) + cliente del servidor (`api.ts`, `authStore.ts`, `sync.ts`)
  components/ai/AiAssistant.tsx  burbuja flotante del asistente de IA (ver AGENTS.md)
  components/social/  Avatar, PostCard — piezas reutilizadas por la pestaña Social y app/social/*
  theme/       tokens de color/tipografía y ThemeProvider (oscuro/claro)
apps/server/src
  db.ts, auth.ts, app.ts, server.ts, routes/  Fastify + node:sqlite: cuentas, sincronización
                                              de los blobs de cada tienda, fotos, el proxy de IA
                                              (`routes/ai.ts`) y lo social (`routes/social.ts`,
                                              ver AGENTS.md y `docs/plan-social.md`)
```

El plan completo (stack, decisiones, diseño de pantallas) está en
`~/.claude/plans/merry-inventing-stearns.md`.

## Copias de seguridad y cómo restaurar

- **Automáticas**: el servidor hace una copia consistente (`VACUUM INTO`) cada 6 h en
  `~/servicios/cheluisfit/data/backups/cheluisfit-AAAA-MM-DD.db` (una por día, 14 días) y
  `tools/deploy.mjs` hace otra, `pre-<versión>-<ms>.db`, justo antes de cada actualización.
- **Restaurar una copia** (en el VPS):
  ```sh
  cd ~/servicios/cheluisfit
  docker compose stop
  cp data/cheluisfit.db data/cheluisfit.db.antes-de-restaurar   # por si acaso
  cp data/backups/<la copia>.db data/cheluisfit.db
  rm -f data/cheluisfit.db-wal data/cheluisfit.db-shm             # si no, SQLite reaplicaría cambios posteriores
  docker compose up -d
  ```
- **Volver a la versión anterior** si una actualización sale mal (el despliegue ya lo intenta solo
  si `/health` no responde): `sed -i "s|image: cheluisfit:.*|image: cheluisfit:<anterior>|" docker-compose.yml`,
  lo mismo con `APP_VERSION=` en `.env`, y `docker compose up -d` (las imágenes anteriores siguen
  cargadas: `docker images cheluisfit`).
- **Copias cruzadas** (`node tools/backup-offsite.mjs`, y solas al final de cada despliegue):
  las copias de la base de datos bajan al Mac (`~/Copias/cheluisfit/db/`), y el código con todo su
  historial (`git bundle`; restaurar: `git clone repo-<fecha>.bundle cheluisfit`) y la clave de
  firma del APK suben al VPS (`~/backups/cheluisfit/`). La **contraseña** de la clave
  (`~/.android-keystores/cheluisfit.properties`) no sale del Mac: guárdala en tu gestor de
  contraseñas. Sin clave ni contraseña, las actualizaciones dejarían de instalarse encima.

## Próximos pasos

De lo más cercano a lo más lejano:

- **Activar el asistente de IA en producción**: el código ya está desplegable, pero hace falta
  crear las claves gratuitas (`aistudio.google.com/apikey` para Gemini, `console.groq.com/keys`
  para Groq — ninguna pide tarjeta) y añadirlas a mano al `.env` del VPS
  (`GEMINI_API_KEY`/`GROQ_API_KEY`, ver `AGENTS.md`); sin al menos una, la burbuja no responde.
- **Verificación en dispositivo real** (solo la puede hacer quien tenga el móvil y el reloj):
  instalar el APK desde `/app.apk?v=<versión>` (**con el `?v=`, nunca a secas** — Cloudflare
  cachea `.apk` en su borde ~4h ignorando la cabecera del servidor; `node tools/deploy.mjs`
  imprime la URL correcta al final de cada despliegue), confirmar en Garmin Connect → Ajustes →
  Health Connect → «Escribir» → Sesiones de ejercicio activado, probar una sincronización real,
  escanear un producto de supermercado de verdad, probar el asistente de IA con datos reales y
  probar lo social con dos cuentas de verdad (follow, publicar, comentar, dar like, perfil privado).
- **Notificaciones sociales** (fuera de v1 a propósito, ver `docs/plan-social.md`): «X te ha
  seguido/comentado» necesitaría push o un cron, ninguno existe hoy.
- **Fútbol**: pestaña sin diseñar todavía. Health Connect ya expone `ExerciseType.SOCCER`,
  ignorado a propósito en la importación de Garmin hasta que exista.
- **Vídeos propios de ejercicios de Fuerza** (hoy son fotos de free-exercise-db).
- **Recuperación de contraseña**: el esquema de cuentas no la tiene, a diferencia de Compra en
  Familia — se puede añadir copiando su patrón si hace falta.
