// Exportar los datos de la persona a un JSON descargable — los datos ya existen (los mismos
// blobs que `blobSync.ts` sincroniza con el servidor), esto solo los empaqueta. Nunca pasa por
// el servidor: se lee directo de `AsyncStorage`, igual que hace `blobSync.ts` para sincronizar.
import { Platform } from "react-native";
import { readLocal, SYNC_KEYS } from "@/data/blobSync";
import { todayKey } from "@/domain/dates";

async function buildExportJson(): Promise<string> {
  const blobs: Record<string, unknown> = {};
  for (const key of SYNC_KEYS) {
    const data = await readLocal(key);
    if (data !== null) blobs[key] = data;
  }
  return JSON.stringify({ exportedAt: new Date().toISOString(), app: "CheluisFIT", blobs }, null, 2);
}

/** `true` si se pudo compartir/descargar de verdad; `false` si no hay nada que ofrecer en este entorno. */
export async function exportUserData(): Promise<boolean> {
  const json = await buildExportJson();
  const filename = `cheluisfit-${todayKey()}.json`;

  if (Platform.OS === "web") {
    // `expo-sharing` no puede compartir archivos locales por URI en la web (solo URLs remotas) —
    // la propia descarga del navegador es más simple y no necesita ningún módulo nativo.
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return true;
  }

  const { File, Paths } = await import("expo-file-system");
  const Sharing = await import("expo-sharing");
  if (!(await Sharing.isAvailableAsync())) return false;
  const file = new File(Paths.cache, filename);
  if (file.exists) file.delete();
  file.create();
  file.write(json);
  await Sharing.shareAsync(file.uri, { mimeType: "application/json", dialogTitle: "Exportar mis datos de CheluisFIT" });
  return true;
}
