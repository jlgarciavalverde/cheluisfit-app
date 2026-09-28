// Lectura/escritura de los blobs de AsyncStorage y sincronización con el servidor (sin depender de
// `authStore`, a propósito: lo usan tanto `sync.ts` como `authStore.login()`/`register()` — si
// importara de vuelta a `authStore`, se cerraría un ciclo de módulos).
//
// **Control de versión por clave** (desde la 0.11): `cf_sync_meta_v1` recuerda, por cada blob, la
// versión del servidor (`base` = su `updatedAt`) y una huella del JSON local tal y como quedó la
// última vez que ambos coincidían. Con eso cada sincronización sabe si cambió lo local, lo remoto o
// los dos. Si cambiaron los dos **gana el servidor** (el uso real es casi siempre un solo móvil) y
// lo local que se iba a pisar se guarda aparte (`cf_conflict_backup_<clave>`), recuperable desde Más.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ApiError } from "./api";
import { clearHydrationFailure, hydrationFailed } from "./persistSafety";
import { useActiveWorkout } from "./activeWorkoutStore";
import { useRunning } from "./runningStore";
import { useStrength } from "./strengthStore";
import { useNutrition } from "./store";

export const SYNC_KEYS = ["cf_nutrition_v1", "cf_running_v1", "cf_strength_v1", "cf_active_workout_v1"] as const;
export type SyncKey = (typeof SYNC_KEYS)[number];

const META_KEY = "cf_sync_meta_v1";
const BACKUP_PREFIX = "cf_conflict_backup_";

interface KeyMeta {
  /** `updatedAt` del servidor la última vez que local y servidor coincidieron (`0` = no había nada). */
  base: number;
  /** Huella del JSON local en ese mismo momento (`""` = obliga a subir en la próxima). */
  hash: string;
}
export interface SyncMeta {
  /**
   * La descarga al entrar falló: hasta que una descarga termine bien, **nunca** se sube nada
   * (lo local puede ser de otra cuenta, de ejemplo o viejo, y pisaría el historial real).
   */
  needsPull?: boolean;
  /** Cuenta a la que pertenecen los datos locales (ver `adoptNewAccount`). */
  ownerId?: string;
  keys: Partial<Record<SyncKey, KeyMeta>>;
}

export interface ConflictBackup {
  key: SyncKey;
  savedAt: number;
  raw: string;
}

/** FNV-1a de 32 bits: basta para saber si un JSON cambió, no es criptográfico. */
export function hashString(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${s.length}:${(h >>> 0).toString(36)}`;
}

export async function loadMeta(): Promise<SyncMeta> {
  try {
    const raw = await AsyncStorage.getItem(META_KEY);
    const parsed = raw ? (JSON.parse(raw) as SyncMeta) : null;
    return parsed && typeof parsed === "object" && parsed.keys ? parsed : { keys: {} };
  } catch {
    return { keys: {} };
  }
}

export async function saveMeta(meta: SyncMeta): Promise<void> {
  await AsyncStorage.setItem(META_KEY, JSON.stringify(meta));
}

export async function setNeedsPull(value: boolean): Promise<void> {
  const meta = await loadMeta();
  await saveMeta({ ...meta, needsPull: value || undefined });
}

export async function readLocal(key: SyncKey): Promise<unknown | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Escribe el blob y devuelve la huella de lo escrito (para guardarla en `SyncMeta`). */
export async function writeLocal(key: SyncKey, data: unknown): Promise<string> {
  const raw = JSON.stringify(data);
  await AsyncStorage.setItem(key, raw);
  return hashString(raw);
}

const rehydrators: Record<SyncKey, () => Promise<void> | void> = {
  cf_nutrition_v1: () => useNutrition.persist.rehydrate(),
  cf_running_v1: () => useRunning.persist.rehydrate(),
  cf_strength_v1: () => useStrength.persist.rehydrate(),
  cf_active_workout_v1: () => useActiveWorkout.persist.rehydrate(),
};

/** Relee de AsyncStorage lo que se acaba de escribir hacia el estado en memoria — sin esto, una
 *  pantalla ya abierta seguiría mostrando lo viejo hasta el próximo arranque en frío. */
export async function rehydrateAllStores(): Promise<void> {
  await Promise.all(SYNC_KEYS.map((k) => rehydrators[k]()));
}

const startFresh = (key: SyncKey) => {
  if (key === "cf_nutrition_v1") useNutrition.getState().startFresh();
  else if (key === "cf_running_v1") useRunning.getState().startFresh();
  else if (key === "cf_strength_v1") useStrength.getState().startFresh();
};

/**
 * Baja lo que haya en el servidor para esta cuenta y lo pone en local, tal cual — se llama al
 * entrar (ver `authStore.ts`) y cuando quedó una descarga pendiente (`needsPull`). Por cada clave:
 * - Si el servidor tiene un blob, se escribe tal cual (dispositivo nuevo en una cuenta con historial).
 * - Si no tiene nada (cuenta recién creada), la tienda correspondiente se vacía de verdad
 *   (`startFresh()`) en vez de dejar los datos de ejemplo puestos como si fueran reales — esa
 *   acción ya se autopersiste sola vía el middleware `persist`, y queda como «cambio local» que
 *   se sube en la próxima sincronización (huella `""`).
 * - `cf_active_workout_v1` es la excepción: si hay un entreno en curso **de esta misma cuenta**
 *   sin guardar en este dispositivo, no se toca — nunca pisar un entreno a medio hacer con lo que
 *   venga del servidor. Si el entreno en curso es de otra cuenta, se pisa como cualquier otra clave.
 */
export async function pullAllBlobs(token: string, ownerId: string): Promise<void> {
  const { blobs } = await api.getBlobs(token);
  const remote = new Map(blobs.map((b) => [b.key, b]));
  const prev = await loadMeta();
  const meta: SyncMeta = { ownerId, keys: {} };

  for (const key of SYNC_KEYS) {
    const r = remote.get(key);
    const keepWorkout = key === "cf_active_workout_v1" && prev.ownerId === ownerId && useActiveWorkout.getState().workout !== null;
    if (keepWorkout) {
      meta.keys[key] = { base: r?.updatedAt ?? 0, hash: "" };
    } else if (r) {
      meta.keys[key] = { base: r.updatedAt, hash: await writeLocal(key, r.data) };
    } else if (key === "cf_active_workout_v1") {
      useActiveWorkout.getState().clearActive();
      meta.keys[key] = { base: 0, hash: "" };
    } else {
      startFresh(key);
      meta.keys[key] = { base: 0, hash: "" };
    }
  }
  await saveMeta(meta);
  await rehydrateAllStores();
}

/**
 * Registro en una cuenta nueva (login NO — ahí el servidor manda siempre, ver `authStore.ts`).
 * Si la cuenta ya tiene blobs (improbable en un registro, pero posible con cuotas reutilizadas),
 * comportarse como un login normal: bajar y rehidratar. Si está vacía — el caso real: la persona
 * llevaba tiempo usando la app sin cuenta y ahora se registra — se respeta lo local, con dos
 * excepciones deliberadas:
 * - las tiendas **nunca tocadas** (sin escritura en AsyncStorage: `persist` no vuelca el estado
 *   inicial hasta el primer `set()`, así que `null` = aún datos de ejemplo intactos) se vacían con
 *   `startFresh()`, para no subir rutinas/comidas de ejemplo como si fueran reales;
 * - si lo local **pertenece a otra cuenta** (alguien cerró sesión en este móvil y otra persona se
 *   registra), se vacía todo: sus datos siguen en la cuenta de la otra persona, no deben pasar a esta.
 * Lo demás se sube solo con el auto-sync normal (sin `base`: la cuenta es nueva).
 */
export async function adoptNewAccount(token: string, ownerId: string): Promise<void> {
  const prev = await loadMeta();
  const foreign = prev.ownerId !== undefined && prev.ownerId !== ownerId;
  for (const key of SYNC_KEYS) {
    if (!foreign && (await readLocal(key)) !== null) continue;
    if (key === "cf_active_workout_v1") useActiveWorkout.getState().clearActive();
    else startFresh(key);
  }
  await saveMeta({ ownerId, keys: {} });
  const { blobs } = await api.getBlobs(token);
  if (blobs.length > 0) await pullAllBlobs(token, ownerId);
}

export async function listConflictBackups(): Promise<ConflictBackup[]> {
  const out: ConflictBackup[] = [];
  for (const key of SYNC_KEYS) {
    try {
      const raw = await AsyncStorage.getItem(BACKUP_PREFIX + key);
      if (raw) out.push(JSON.parse(raw) as ConflictBackup);
    } catch {
      // copia corrupta: se ignora
    }
  }
  return out;
}

/** Vuelve a poner en local lo que se guardó al perder un conflicto; se sube en la próxima sincronización. */
export async function restoreConflictBackup(key: SyncKey): Promise<void> {
  const raw = await AsyncStorage.getItem(BACKUP_PREFIX + key);
  if (!raw) return;
  const backup = JSON.parse(raw) as ConflictBackup;
  await AsyncStorage.setItem(key, backup.raw);
  await rehydrators[key]();
  await AsyncStorage.removeItem(BACKUP_PREFIX + key);
}

export async function discardConflictBackup(key: SyncKey): Promise<void> {
  await AsyncStorage.removeItem(BACKUP_PREFIX + key);
}

export interface SyncResult {
  /** Claves donde ganó el servidor y lo local quedó guardado como copia. */
  conflicts: SyncKey[];
  /** `true` si esta vez se completó una descarga pendiente en vez de una sincronización normal. */
  pulled: boolean;
}

/**
 * Sincronización del uso normal, clave por clave:
 * - Sin cambios en ningún lado → nada.
 * - Cambió solo lo local → se sube con `base` (si entre medias otro dispositivo subió, 409 → conflicto).
 * - Cambió solo el servidor → se baja y se rehidrata esa tienda.
 * - Cambiaron los dos → gana el servidor, lo local se guarda como copia. Excepción: un entreno en
 *   curso en este móvil nunca se pisa (se sube encima).
 * - Sin datos de versión para esa clave (primera vez tras actualizar desde una versión sin esto,
 *   o recién registrado) → se sube sin comprobar, como hacían las versiones anteriores.
 */
export async function syncBlobs(token: string): Promise<SyncResult> {
  const meta = await loadMeta();
  if (meta.needsPull) {
    if (!meta.ownerId) throw new ApiError(0, "Falta la cuenta de los datos locales");
    await pullAllBlobs(token, meta.ownerId);
    return { conflicts: [], pulled: true };
  }

  const { blobs } = await api.getBlobVersions(token);
  const remoteV = new Map(blobs.map((b) => [b.key, b.updatedAt]));
  const conflicts: SyncKey[] = [];

  for (const key of SYNC_KEYS) {
    const raw = await AsyncStorage.getItem(key);
    const localHash = raw ? hashString(raw) : null;
    const m = meta.keys[key];
    const serverAt = remoteV.get(key) ?? 0;

    const upload = async (base: number | null) => {
      const res = await api.putBlob(token, key, JSON.parse(raw as string), base);
      // Un servidor anterior a la 0.11 responde 204 sin versión: se sigue sin control de versión
      // para esta clave (como antes) hasta que el servidor mande `updatedAt`.
      if (typeof res?.updatedAt === "number") meta.keys[key] = { base: res.updatedAt, hash: localHash as string };
      else delete meta.keys[key];
    };
    const download = async () => {
      const { data, updatedAt } = await fetchOne(token, key);
      meta.keys[key] = { base: updatedAt, hash: await writeLocal(key, data) };
      await rehydrators[key]();
    };
    const resolveConflict = async () => {
      if (key === "cf_active_workout_v1" && useActiveWorkout.getState().workout !== null) {
        await upload(serverAt);
        return;
      }
      const backup: ConflictBackup = { key, savedAt: Date.now(), raw: raw as string };
      await AsyncStorage.setItem(BACKUP_PREFIX + key, JSON.stringify(backup));
      await download();
      conflicts.push(key);
    };

    // Tienda que no se pudo leer en este arranque (`persistSafety.ts`): lo que tiene en memoria son
    // datos vacíos o de ejemplo, nunca se sube. Si la cuenta tiene copia, se baja y queda arreglada.
    if (hydrationFailed(key)) {
      if (serverAt) {
        await download();
        clearHydrationFailure(key);
        await saveMeta(meta);
      }
      continue;
    }

    if (!m) {
      if (raw !== null) await upload(null);
      else if (serverAt) await download();
      continue;
    }
    const localChanged = raw !== null && localHash !== m.hash;
    const remoteChanged = serverAt !== m.base;
    try {
      if (localChanged && !remoteChanged) await upload(m.base);
      else if (!localChanged && remoteChanged && serverAt) await download();
      else if (localChanged && remoteChanged) await resolveConflict();
    } catch (e) {
      // Otro dispositivo subió justo entre la consulta de versiones y la subida.
      if (e instanceof ApiError && e.status === 409) await resolveConflict();
      else throw e;
    }
    await saveMeta(meta);
  }
  await saveMeta(meta);
  return { conflicts, pulled: false };
}

function fetchOne(token: string, key: SyncKey): Promise<{ data: unknown; updatedAt: number }> {
  return api.getBlob(token, key);
}
