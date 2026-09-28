const { withMainActivity } = require("expo/config-plugins");

// react-native-health-connect (4.x) expone `HealthConnectPermissionDelegate.setPermissionDelegate()`
// pero NUNCA la llama nadie: ni la propia librería, ni su app.plugin.js (comprobado en su código,
// v4.1.3). Sin registrar los `ActivityResultLauncher` en el `onCreate` de MainActivity, cualquier
// llamada que los use — el diálogo de permisos (`requestPermission`) y sobre todo el recorrido GPS
// (`requestExerciseRoute`, el botón «Ver recorrido» de `sesion/[id].tsx`) — revienta con
// `UninitializedPropertyAccessException` y CIERRA la app entera: es un crash nativo, el try/catch
// de `fetchExerciseRoute()` no puede capturarlo. Por eso los permisos de Garmin solo se pudieron
// conceder desde los ajustes del sistema (la app nunca pudo abrir su propio diálogo sin tumbarse).
function withHealthConnectDelegate(config) {
  return withMainActivity(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes("HealthConnectPermissionDelegate")) return config;
    config.modResults.contents = contents
      .replace(
        /import expo\.modules\.ReactActivityDelegateWrapper/,
        "import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate\n\nimport expo.modules.ReactActivityDelegateWrapper",
      )
      .replace(
        /super\.onCreate\([^)]*\)/,
        "$&\n    HealthConnectPermissionDelegate.setPermissionDelegate(this)",
      );
    return config;
  });
}

module.exports = withHealthConnectDelegate;
