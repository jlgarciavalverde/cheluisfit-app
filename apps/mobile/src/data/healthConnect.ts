// Acceso a Android Health Connect — de aquí salen las actividades que Garmin Connect (u otro
// reloj/app) haya escrito. Garmin no tiene una API pública directa: escribe en este almacén
// compartido de Android, y cualquier app con permiso lee de ahí (así funcionan también
// Cronometer, Strava, etc.). Solo lectura — este módulo nunca escribe nada en Health Connect.
//
// IMPORTANTE: para que aparezca algo, Garmin Connect necesita tener activado, a mano, el
// interruptor Ajustes → Health Connect → «Escribir» → «Sesiones de ejercicio». Sin eso, ninguna
// integración por buena que sea va a ver datos — no es un fallo de este código.
import { Linking, Platform } from "react-native";
import {
  aggregateRecord,
  ExerciseType,
  getGrantedPermissions,
  getSdkStatus,
  initialize,
  openHealthConnectSettings as nativeOpenSettings,
  readRecords,
  requestExerciseRoute,
  requestPermission,
  SdkAvailabilityStatus,
} from "react-native-health-connect";
import { toDateKey } from "@/domain/dates";
import type { Activity } from "@/domain/running";

/** Enlace a la ficha de Health Connect en Play Store, para cuando no está instalado. */
export const HEALTH_CONNECT_PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata";

/** Fallo real de Health Connect (nativo, red del dispositivo, permiso) — mismo espíritu que `OffError`/`UsdaError`. */
export class HealthConnectError extends Error {}

/**
 * Envuelve una llamada a la librería nativa para que, si lanza, el mensaje llegue con contexto
 * hasta la pantalla (`syncGarmin` en `(tabs)/running.tsx`) en vez de perderse en un "no se pudo
 * sincronizar" genérico — así un fallo real se puede describir con precisión sin tener que
 * reproducirlo a mano.
 */
async function callNative<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new HealthConnectError(`${label}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Qué tipos de sesión de Health Connect importamos, y a qué tipo de `Activity` mapean.
 * Fútbol (`ExerciseType.SOCCER`) y el resto de tipos no están aquí a propósito — no hay
 * pestaña de Fútbol todavía; cuando la haya, se añade su propia entrada.
 */
const TYPE_MAP: Partial<Record<number, Activity["type"]>> = {
  [ExerciseType.RUNNING]: "run",
  [ExerciseType.RUNNING_TREADMILL]: "run",
  [ExerciseType.WALKING]: "walk",
  [ExerciseType.HIKING]: "walk",
};

/**
 * `ExerciseSession` es imprescindible (sin él no hay nada que importar). El resto son
 * opcionales — enriquecen distancia/calorías/FC/desnivel, pero `sessionAggregates()` ya los
 * trata como "si no hay, se deja vacío" (`Promise.allSettled`). Antes se pedían los 5 y se
 * exigía tenerlos TODOS concedidos para considerar que había permiso — si Android concedía solo
 * el esencial (algo habitual: la persona no entiende para qué sirve "desnivel" y lo deniega),
 * el sync entero se bloqueaba con "sin permiso" aunque de sobra hubiera bastado con el esencial.
 */
const ESSENTIAL_PERMISSION = { accessType: "read", recordType: "ExerciseSession" } as const;
const OPTIONAL_PERMISSIONS = [
  { accessType: "read", recordType: "Distance" },
  { accessType: "read", recordType: "TotalCaloriesBurned" },
  { accessType: "read", recordType: "HeartRate" },
  { accessType: "read", recordType: "ElevationGained" },
] as const;
const READ_PERMISSIONS = [ESSENTIAL_PERMISSION, ...OPTIONAL_PERMISSIONS] as const;

let initialized = false;
async function ensureInitialized(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  if (!initialized) initialized = await callNative("initialize", () => initialize());
  return initialized;
}

export type HealthConnectAvailability = "available" | "not_installed" | "update_required";

/**
 * `getSdkStatus()` distingue tres casos, no dos: disponible, no instalado, e *instalado pero
 * necesita actualizarse* — antes se trataban los dos últimos igual ("instala Health Connect"),
 * un mensaje confuso si ya está instalado y solo hace falta actualizarlo.
 */
export async function checkHealthConnectStatus(): Promise<HealthConnectAvailability> {
  if (Platform.OS !== "android") return "not_installed";
  const status = await callNative("getSdkStatus", () => getSdkStatus());
  if (status === SdkAvailabilityStatus.SDK_AVAILABLE) return "available";
  if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) return "update_required";
  return "not_installed";
}

export function openHealthConnectInstall(): void {
  Linking.openURL(HEALTH_CONNECT_PLAY_STORE_URL);
}

/**
 * Abre la pantalla de permisos de Health Connect (su propia app). En Android 14+ esto a veces
 * NO es donde está el interruptor — algunos fabricantes lo mueven a Ajustes del sistema →
 * Seguridad y privacidad → Privacidad → Salud, o a los propios Ajustes de la app
 * (`openAppSettings()`). Se ofrecen las dos rutas porque varía según el móvil.
 */
export function openHealthConnectSettings(): void {
  nativeOpenSettings();
}

/** Ajustes de la propia app en el sistema — en algunos Android/fabricantes, ahí está el permiso de salud. */
export function openAppSettings(): void {
  Linking.openSettings();
}

function hasEssentialPermission(granted: readonly { recordType: string; accessType: string }[]): boolean {
  return granted.some((g) => g.recordType === ESSENTIAL_PERMISSION.recordType && g.accessType === "read");
}

export async function requestHealthConnectPermissions(): Promise<boolean> {
  if (!(await ensureInitialized())) return false;
  // Por si ya estaba concedido (a mano, en un intento anterior, o por el propio sistema sin
  // mostrar diálogo) — pedirlo otra vez cuando ya está concedido no siempre vuelve a preguntar.
  const already = await callNative("getGrantedPermissions", () => getGrantedPermissions());
  if (hasEssentialPermission(already)) return true;
  const granted = await callNative("requestPermission", () => requestPermission([...READ_PERMISSIONS]));
  return hasEssentialPermission(granted);
}

const between = (startTime: string, endTime: string) => ({ operator: "between" as const, startTime, endTime });

/** Agregados de una sesión (distancia/calorías/FC/desnivel) — `ExerciseSessionRecord` no los trae embebidos. */
async function sessionAggregates(startTime: string, endTime: string) {
  const range = between(startTime, endTime);
  const [distance, calories, hr, elevation] = await Promise.allSettled([
    callNative("aggregateRecord(Distance)", () => aggregateRecord({ recordType: "Distance", timeRangeFilter: range })),
    callNative("aggregateRecord(TotalCaloriesBurned)", () => aggregateRecord({ recordType: "TotalCaloriesBurned", timeRangeFilter: range })),
    callNative("aggregateRecord(HeartRate)", () => aggregateRecord({ recordType: "HeartRate", timeRangeFilter: range })),
    callNative("aggregateRecord(ElevationGained)", () => aggregateRecord({ recordType: "ElevationGained", timeRangeFilter: range })),
  ]);
  return {
    distanceM: distance.status === "fulfilled" ? Math.round(distance.value.DISTANCE.inMeters) : 0,
    kcal: calories.status === "fulfilled" ? Math.round(calories.value.ENERGY_TOTAL.inKilocalories) : undefined,
    avgHr: hr.status === "fulfilled" && hr.value.MEASUREMENTS_COUNT > 0 ? Math.round(hr.value.BPM_AVG) : undefined,
    maxHr: hr.status === "fulfilled" && hr.value.MEASUREMENTS_COUNT > 0 ? Math.round(hr.value.BPM_MAX) : undefined,
    ascentM: elevation.status === "fulfilled" ? Math.round(elevation.value.ELEVATION_GAINED_TOTAL.inMeters) : undefined,
  };
}

export type ImportedActivity = Omit<Activity, "id">;

/**
 * Lee las sesiones de ejercicio nuevas desde `sinceISO` (o desde siempre si es `null`, primera
 * sincronización) hasta ahora, y las mapea a `Activity`. Lanza si Health Connect no está
 * disponible o no se ha concedido permiso — el llamador decide cómo contarlo al usuario.
 */
export async function importNewActivities(sinceISO: string | null): Promise<ImportedActivity[]> {
  if (!(await ensureInitialized())) throw new HealthConnectError("Health Connect no está disponible en este dispositivo");
  const startTime = sinceISO ?? new Date(0).toISOString();
  const endTime = new Date().toISOString();
  const { records } = await callNative("readRecords(ExerciseSession)", () =>
    readRecords("ExerciseSession", { timeRangeFilter: between(startTime, endTime), ascendingOrder: true }),
  );

  const out: ImportedActivity[] = [];
  for (const r of records) {
    const type = TYPE_MAP[r.exerciseType];
    if (!type) continue; // fútbol y otros tipos no soportados todavía, se ignoran a propósito
    const durationS = Math.round((new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 1000);
    if (durationS <= 0) continue;
    const agg = await sessionAggregates(r.startTime, r.endTime);
    out.push({
      date: toDateKey(new Date(r.startTime)),
      type,
      source: "garmin",
      title: r.title?.trim() || (type === "run" ? "Carrera" : "Caminata"),
      distanceM: agg.distanceM,
      durationS,
      avgHr: agg.avgHr,
      maxHr: agg.maxHr,
      ascentM: agg.ascentM,
      kcal: agg.kcal,
      // Health Connect siempre rellena `metadata.id` en los registros que devuelve `readRecords`
      // (verificado en el SDK de androidx.health.connect) — `mergeImportedActivities()` confía en
      // que sea así para deduplicar; sin `externalId`, esa función trata la actividad como nueva
      // siempre, así que un cambio futuro de la librería que dejara esto vacío duplicaría en
      // cada sincronización, no solo la primera vez.
      externalId: r.metadata?.id,
    });
  }
  return out;
}

/**
 * Recorrido GPS de una sesión concreta — se pide aparte y no durante la sincronización: leer la
 * ruta de un entrenamiento exige su propio consentimiento de Android, uno por sesión (más
 * sensible que el resto de datos), así que pedirlas todas de golpe al sincronizar dispararía un
 * diálogo del sistema por cada actividad nueva. Se pide bajo demanda, al abrir esa sesión en
 * concreto (`sesion/[id].tsx`) — `null` significa "sin recorrido" (el reloj no lo grabó, o no se
 * concedió acceso), no un error: no hace falta reintentar ni avisar como fallo.
 */
export async function fetchExerciseRoute(recordId: string): Promise<{ lat: number; lon: number }[] | null> {
  if (!(await ensureInitialized())) return null;
  try {
    const points = await requestExerciseRoute(recordId);
    if (!points.length) return null;
    return points.map((p) => ({ lat: p.latitude, lon: p.longitude }));
  } catch {
    return null;
  }
}
