const { withAppBuildGradle } = require("expo/config-plugins");

// Bloque exacto que genera Expo SDK 57 en `android/app/build.gradle` (se regenera en cada
// `expo prebuild`, así que no se edita el fichero a mano: se busca y se amplía aquí).
const DEBUG_SIGNING = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

const DEBUG_SIGNING_WITH_RELEASE = `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            // Clave fuera del repo: la ruta y las contraseñas llegan por variables de entorno
            // (ver tools/build-apk.mjs). Sin ellas, esta configuración queda sin storeFile y
            // Gradle falla con un error claro solo al intentar firmar con ella (assembleRelease),
            // no al evaluar otras tareas (assembleDebug, etc.).
            def ksPath = System.getenv("CHELUISFIT_KEYSTORE_PATH")
            if (ksPath) {
                storeFile file(ksPath)
                storePassword System.getenv("CHELUISFIT_KEYSTORE_PASSWORD")
                keyAlias System.getenv("CHELUISFIT_KEY_ALIAS")
                keyPassword System.getenv("CHELUISFIT_KEY_PASSWORD")
            }
        }
    }`;

// `release { // Caution!... // see... signingConfig signingConfigs.debug` — solo dentro del
// buildType `release` (el mismo texto en `debug {}` no lleva ese comentario delante).
const RELEASE_SIGNING_LINE = /(release\s*\{\s*\n\s*\/\/ Caution![^\n]*\n\s*\/\/ see[^\n]*\n\s*)signingConfig signingConfigs\.debug/;

/**
 * Añade una configuración de firma `release` a `android/app/build.gradle` que lee el keystore
 * de variables de entorno, en vez de firmar los APK de producción con la clave de depuración
 * (lo que hace Expo por defecto). La clave nunca vive en el repo ni en `android/`, que se
 * regenera en cada `expo prebuild` — por eso esto es un config plugin y no una edición a mano.
 */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error("withReleaseSigning: se esperaba build.gradle en Groovy, no en Kotlin (KTS).");
    }
    let contents = config.modResults.contents;

    if (!contents.includes(DEBUG_SIGNING)) {
      throw new Error(
        "withReleaseSigning: no se encontró el bloque signingConfigs esperado en build.gradle " +
          "(puede que el SDK de Expo haya cambiado la plantilla). Revisa plugins/withReleaseSigning.js.",
      );
    }
    contents = contents.replace(DEBUG_SIGNING, DEBUG_SIGNING_WITH_RELEASE);

    if (!RELEASE_SIGNING_LINE.test(contents)) {
      throw new Error("withReleaseSigning: no se encontró el buildType `release` esperado en build.gradle.");
    }
    contents = contents.replace(RELEASE_SIGNING_LINE, "$1signingConfig signingConfigs.release");

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withReleaseSigning;
