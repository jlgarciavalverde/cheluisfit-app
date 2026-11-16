/** Claves que admite un export (mismo listado que `blobSync.SYNC_KEYS`, sin importar la tienda). */
const SYNC_KEYS = ["cf_nutrition_v1", "cf_running_v1", "cf_strength_v1", "cf_active_workout_v1"] as const;
export type ExportSyncKey = (typeof SYNC_KEYS)[number];

export type ParsedExport = {
  exportedAt?: string;
  blobs: Partial<Record<ExportSyncKey, unknown>>;
};

export type ParseExportResult = { ok: true; data: ParsedExport } | { ok: false; message: string };

function isPersistEnvelope(v: unknown): v is { state: unknown; version: number } {
  return (
    typeof v === "object" &&
    v !== null &&
    "state" in v &&
    "version" in v &&
    typeof (v as { version: unknown }).version === "number"
  );
}

/** Valida un JSON exportado por esta app (o compatible). */
export function parseExportJson(raw: string): ParseExportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, message: "El archivo no es un JSON válido." };
  }
  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, message: "El formato del archivo no es correcto." };
  }
  const root = parsed as Record<string, unknown>;
  if (root.app !== "CheluisFIT") {
    return { ok: false, message: "No es una exportación de CheluisFIT." };
  }
  if (typeof root.blobs !== "object" || root.blobs === null || Array.isArray(root.blobs)) {
    return { ok: false, message: "Falta el bloque de datos (blobs)." };
  }
  const blobsIn = root.blobs as Record<string, unknown>;
  const keys = Object.keys(blobsIn);
  if (keys.length === 0) {
    return { ok: false, message: "El archivo no contiene ningún dato." };
  }
  const blobs: Partial<Record<ExportSyncKey, unknown>> = {};
  for (const key of keys) {
    if (!(SYNC_KEYS as readonly string[]).includes(key)) {
      return { ok: false, message: `Clave desconocida en el archivo: ${key}` };
    }
    const val = blobsIn[key];
    if (!isPersistEnvelope(val)) {
      return { ok: false, message: `Los datos de ${key} no tienen el formato esperado.` };
    }
    blobs[key as ExportSyncKey] = val;
  }
  return {
    ok: true,
    data: {
      exportedAt: typeof root.exportedAt === "string" ? root.exportedAt : undefined,
      blobs,
    },
  };
}
