const { withGradleProperties } = require("expo/config-plugins");

// Solo arm64-v8a: es la arquitectura de prácticamente todo móvil Android real desde ~2017 (el
// grupo de usuarios de la app, sin iPhone). Por defecto Expo empaqueta las 4 ABI (arm + x86 de
// 32 y 64 bits, estas dos solo para emuladores) en un único APK «gordo»: eso multiplicaba por
// ~4 el tamaño de descarga (141 MB) sin ningún beneficio para quien la instala en su móvil.
//
// Solo se aplica cuando `tools/build-apk.mjs` marca `CHELUISFIT_RELEASE_BUILD=1` antes del
// `expo prebuild`: un `expo run:android`/prebuild normal de desarrollo mantiene las 4 ABI (hace
// falta x86_64 para el emulador si algún día se usa uno que no sea arm64, como el `compra`
// actual en Apple Silicon).
const ARCH = "arm64-v8a";

/** Restringe el APK de release a una sola arquitectura para que la descarga directa pese lo que debe. */
function withReleaseArchitecture(config) {
  if (process.env.CHELUISFIT_RELEASE_BUILD !== "1") return config;
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    const item = props.find((p) => p.type === "property" && p.key === "reactNativeArchitectures");
    if (item && item.type === "property") {
      item.value = ARCH;
    } else {
      props.push({ type: "property", key: "reactNativeArchitectures", value: ARCH });
    }
    return config;
  });
}

module.exports = withReleaseArchitecture;
