# Operaciones

[← Documentación](README.md) · [README del proyecto](../README.md)

Manual para quien mantiene el servidor y publica versiones. Las convenciones de código y las trampas conocidas están en [AGENTS.md](../AGENTS.md).

## Desplegar una versión

```sh
cd apps/mobile && npx expo export --platform web   # o pnpm e2e, que ya lo hace
cd ../.. && node tools/deploy.mjs <versión>
```

`tools/deploy.mjs`:
1. Se niega a seguir si el export web es anterior al último cambio de `apps/mobile/src`, y pasa `pnpm -r typecheck` y `pnpm -r test` (`--skip-tests` para saltarlo).
2. Construye la imagen para `linux/amd64` (el VPS es x86_64 y el Mac arm64) y la sube por SSH.
3. Hace una copia `pre-<versión>-<ms>.db` con `VACUUM INTO` dentro del contenedor y reinicia `~/servicios/cheluisfit`.
4. Espera a que `/health` responda con la versión nueva. Si no llega en ~60 s, **vuelve sola a la imagen anterior**.
5. Publica el APK y `version.json` en el volumen de datos (con `.tmp` + `mv`) e imprime la URL de descarga.

> El APK se descarga **siempre** desde `/app.apk?v=<versión>`, nunca a secas: Cloudflare cachea los `.apk` en su borde unas 4 h aunque el servidor diga lo contrario.

## Variables de entorno

| Dónde | Variable | Para qué |
|---|---|---|
| Servidor (`.env` del VPS) | `SETUP_CODE` | Crear la primera cuenta (admin) y recuperar el acceso del admin |
| | `GEMINI_API_KEY`, `GROQ_API_KEY` | Asistente, análisis e IA con foto (hace falta al menos una; la visión solo usa Gemini) |
| | `GEMINI_MODEL`, `GROQ_MODEL` | Opcionales: los modelos gratuitos cambian a menudo |
| | `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` | Opcionales: sin ellas, «Conectar Strava» responde 503 |
| | `ALLOWED_ORIGINS`, `APP_VERSION`, `LOG_LEVEL` | Lo habitual |
| App (al compilar) | `EXPO_PUBLIC_USDA_API_KEY` | Búsqueda en vivo en USDA (clave gratuita de [api.data.gov](https://api.data.gov)). Sin ella funcionan lo local y Open Food Facts. |
| | `EXPO_PUBLIC_API_URL` | Servidor (por defecto `https://cheluisfit.redgarverde.com`) |

Las claves se escriben en el servidor con `read -rsp`, nunca en el repo ni en un chat.

## Copias de seguridad

- **Automáticas**: el servidor hace una copia consistente (`VACUUM INTO`) cada 6 h en `~/servicios/cheluisfit/data/backups/cheluisfit-AAAA-MM-DD.db` (una por día, 14 días), y el despliegue hace otra, `pre-<versión>-<ms>.db`, justo antes de cada actualización.
- **Copias cruzadas** (`node tools/backup-offsite.mjs`, y solas al final de cada despliegue): las copias de la base de datos bajan al Mac (`~/Copias/cheluisfit/db/`), y el código con todo su historial (`git bundle`) y la clave de firma del APK suben al VPS (`~/backups/cheluisfit/`).
- La **contraseña** de la clave de firma (`~/.android-keystores/cheluisfit.properties`) no sale del Mac: guárdala en un gestor de contraseñas. Sin la clave y su contraseña, las actualizaciones del APK dejarían de instalarse encima de la versión anterior.

### Restaurar una copia (en el VPS)

```sh
cd ~/servicios/cheluisfit
docker compose stop
cp data/cheluisfit.db data/cheluisfit.db.antes-de-restaurar   # por si acaso
cp data/backups/<la copia>.db data/cheluisfit.db
rm -f data/cheluisfit.db-wal data/cheluisfit.db-shm             # si no, SQLite volvería a aplicar cambios posteriores
docker compose up -d
```

### Restaurar el código

`git clone repo-<fecha>.bundle cheluisfit`

### Volver a la versión anterior a mano

El despliegue ya lo intenta solo si `/health` no responde. A mano:

```sh
sed -i "s|image: cheluisfit:.*|image: cheluisfit:<anterior>|" docker-compose.yml
# y lo mismo con APP_VERSION= en .env
docker compose up -d
```

Las imágenes anteriores siguen cargadas (`docker images cheluisfit`).

## Probar en un móvil

- **Expo Go ya no basta** para la app completa: las notificaciones de descanso y Health Connect (Garmin) son módulos nativos que solo existen en un APK o *development build* (`npx expo run:android`). Expo Go sigue sirviendo para iterar rápido en el resto de pantallas.
- **Garmin**: en Garmin Connect → Ajustes → Health Connect → «Escribir» → Sesiones de ejercicio tiene que estar activado. Sin eso no hay nada que sincronizar.
- **Para leer un cierre de la APK**: `adb logcat -d | grep AndroidRuntime` y simbolizar con `metro-symbolicate`.
