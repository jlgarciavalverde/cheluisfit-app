const { withGradleProperties } = require("expo/config-plugins");

// Expo trae R8 (minificado) y el recorte de recursos apagados por defecto en `release` (para no
// sorprender a quien no los ha probado). Sin ellos, el DEX del release va sin minificar: en
// esta app eran ~57 MB de los ~61 MB totales del APK de una sola arquitectura. Las reglas de
// ProGuard que trae la plantilla de Expo/RN (`android/app/proguard-rules.pro`, generado en cada
// prebuild) ya protegen los módulos nativos; se ha comprobado instalando el APK resultante.
//
// Solo se activa con `CHELUISFIT_RELEASE_BUILD=1` (mismo criterio que `withReleaseArchitecture`),
// para no cambiar el comportamiento de un build de desarrollo normal.
const PROPS = {
  "android.enableMinifyInReleaseBuilds": "true",
  "android.enableShrinkResourcesInReleaseBuilds": "true",
};

/** Activa R8 y el recorte de recursos para el APK de release. */
function withReleaseOptimizations(config) {
  if (process.env.CHELUISFIT_RELEASE_BUILD !== "1") return config;
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    for (const [key, value] of Object.entries(PROPS)) {
      const item = props.find((p) => p.type === "property" && p.key === key);
      if (item && item.type === "property") item.value = value;
      else props.push({ type: "property", key, value });
    }
    return config;
  });
}

module.exports = withReleaseOptimizations;
