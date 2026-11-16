// Exportar e importar los datos de la persona en JSON — los mismos blobs que `blobSync.ts`
// sincroniza con el servidor. Nunca pasa por el servidor en la exportación: se lee directo de
// AsyncStorage.
import { Platform } from "react-native";
import { loadMeta, readLocal, rehydrateAllStores, saveMeta, SYNC_KEYS, writeLocal, type SyncKey } from "@/data/blobSync";
import { syncNow } from "@/data/sync";
import { useAuth } from "@/data/authStore";
import { todayKey } from "@/domain/dates";
import { parseExportJson, type ParsedExport } from "./exportParse";

export { parseExportJson, type ParsedExport } from "./exportParse";

/** Sustituye en local las claves importadas y rehidrata las tiendas. */
export async function importUserData(data: ParsedExport): Promise<void> {
  const keys = Object.keys(data.blobs) as SyncKey[]; // mismas cadenas que ExportSyncKey
  const meta = await loadMeta();
  for (const key of keys) {
    const blob = data.blobs[key];
    if (blob === undefined) continue;
    const hash = await writeLocal(key, blob);
    if (meta.keys[key]) meta.keys[key] = { ...meta.keys[key]!, hash, base: meta.keys[key]!.base };
    else meta.keys[key] = { base: 0, hash };
  }
  await saveMeta(meta);
  await rehydrateAllStores();
  if (useAuth.getState().token) await syncNow();
}

/** Abre el selector de archivo y devuelve el texto del JSON, o `null` si se canceló. */
export async function pickImportFile(): Promise<string | null> {
  if (Platform.OS === "web") {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "application/json,.json";
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsText(file);
      };
      input.click();
    });
  }
  const DocumentPicker = await import("expo-document-picker");
  const pick = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true, multiple: false });
  if (pick.canceled || !pick.assets?.[0]?.uri) return null;
  const { File } = await import("expo-file-system");
  const file = new File(pick.assets[0].uri);
  return file.text();
}

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
