This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building the APK

Este proyecto **no usa EAS**: el APK se compila en local con Gradle, firmado con un keystore
fuera del repo — mismo principio que Compra en Familia (ver `../../AGENTS.md`), adaptado a un
proyecto Expo nativo (allí es una TWA/Bubblewrap; aquí `expo prebuild` genera el `android/`
real).

**Un solo comando** (desde `apps/mobile`):
```
node tools/build-apk.mjs [versión]   # p. ej. node tools/build-apk.mjs 0.2.0
```
Hace todo: si pasas una versión nueva, actualiza `app.json` (`version` y `android.versionCode`,
fórmula `1.2.3 → 10203`); regenera `android/` desde cero (`expo prebuild --platform android
--clean`, Continuous Native Generation — nunca se edita `android/` a mano); compila y firma con
Gradle; comprueba la firma con `apksigner verify`; y deja `dist/cheluisfit.apk` +
`dist/version.json` (versión, versionCode, `packageId`, tamaño, sha256, fecha).

**Requisitos** (ya instalados en este Mac, compartidos con Compra en Familia):
JDK 21 (`/opt/homebrew/opt/openjdk@21`) y el SDK de Android con `build-tools` 35.0.0
(`/opt/homebrew/share/android-commandlinetools`). Se pueden sobrescribir con `JAVA_HOME`/
`ANDROID_HOME`.

**Keystore de firma** — génesis única, guardar la copia de seguridad fuera del Mac (la clave es
insustituible: si se pierde, todos los usuarios tendrían que desinstalar y reinstalar):
```
mkdir -p ~/.android-keystores && chmod 700 ~/.android-keystores
keytool -genkeypair -v -keystore ~/.android-keystores/cheluisfit.jks \
  -alias cheluisfit -keyalg RSA -keysize 2048 -validity 10000 \
  -dname "CN=CheluisFIT, OU=redgarverde, O=redgarverde, L=, ST=, C=ES"
```
Los keystores PKCS12 (por defecto desde JDK 9) **no admiten contraseña de clave distinta de la
del almacén** aunque `keytool` deje ponerla: usa la misma para las dos. Luego crea
`~/.android-keystores/cheluisfit.properties`:
```
storeFile=/Users/<tú>/.android-keystores/cheluisfit.jks
alias=cheluisfit
storePassword=<la contraseña>
keyPassword=<la misma contraseña>
```
El keystore y sus contraseñas **nunca** llegan al repo ni a `android/`: `tools/build-apk.mjs`
los lee de ese `.properties` y se los pasa a Gradle como variables de entorno
(`CHELUISFIT_KEYSTORE_PATH`/`_PASSWORD`, `CHELUISFIT_KEY_ALIAS`, `CHELUISFIT_KEY_PASSWORD`), que
`plugins/withReleaseSigning.js` (config plugin de `expo/config-plugins`, se ejecuta en cada
`expo prebuild`) lee con `System.getenv(...)` dentro de `android/app/build.gradle`. Sin esas
variables, `assembleRelease` falla con un error claro; `assembleDebug` y el resto de tareas no
se ven afectados.

**Una sola arquitectura**: `plugins/withReleaseArchitecture.js` restringe el APK de *release* a
`arm64-v8a` (todo móvil Android real desde ~2017; nadie en el grupo usa iPhone). Por defecto
Expo empaqueta las 4 ABI —incluidas dos que solo sirven para emuladores x86— en un único APK,
que pesaba **142 MB** en vez de los ~35-40 MB reales. La restricción solo se activa cuando
`build-apk.mjs` marca `CHELUISFIT_RELEASE_BUILD=1` antes del prebuild: un `expo prebuild`/
`expo run:android` normal de desarrollo mantiene las 4 ABI (por si algún día hace falta un
emulador x86_64; el AVD `compra` actual ya es arm64-v8a nativo en este Mac).

**Distribución**: `node tools/deploy.mjs <versión>` (raíz del repo) copia el APK y
`version.json` al volumen del servidor y, al terminar, imprime la URL de descarga correcta —
**siempre `https://cheluisfit.redgarverde.com/app.apk?v=<versión>`, nunca `/app.apk` a secas**:
Cloudflare cachea `.apk` en su borde ~4h ignorando el `Cache-Control` del origen (comprobado
2026-09-22: un móvil que "instaló la última versión" desde el enlace sin `?v=` recibió un APK
viejo sin que quedara ni rastro en los logs del servidor, porque la petición nunca llegó a
pasar de Cloudflare); el parámetro de versión evita servir una copia vieja porque cambia la
clave de caché. Cada quien debe permitir «instalar apps de origen desconocido». `/version.json`
da la versión/tamaño/sha256 para avisar de actualizaciones. Ver `../../AGENTS.md` → «Servidor».

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
