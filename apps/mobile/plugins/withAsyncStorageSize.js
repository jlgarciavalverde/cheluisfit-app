const { withGradleProperties } = require("expo/config-plugins");

// AsyncStorage en Android limita la base de datos entera a 6 MB por defecto
// (`AsyncStorage_db_size_in_MB`, ver `@react-native-async-storage/async-storage/android/
// config.gradle`). Con el historial de comidas (~1 MB/año) y de carreras con recorrido
// (~1,4 MB/año) ese techo llegaba en 2-3 años, y al pasarlo las escrituras fallan. 50 MB da margen
// de sobra; el límite de ~2 MB **por entrada** (CursorWindow) es aparte y lo vigila
// `data/persistSafety.ts`. Se aplica siempre (también en desarrollo), igual en todos los builds.
const SIZE_MB = "50";

function withAsyncStorageSize(config) {
  return withGradleProperties(config, (config) => {
    const props = config.modResults;
    const item = props.find((p) => p.type === "property" && p.key === "AsyncStorage_db_size_in_MB");
    if (item && item.type === "property") item.value = SIZE_MB;
    else props.push({ type: "property", key: "AsyncStorage_db_size_in_MB", value: SIZE_MB });
    return config;
  });
}

module.exports = withAsyncStorageSize;
