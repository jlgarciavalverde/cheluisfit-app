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
  ExerciseSegmentType,
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
import type { Activity, Lap } from "@/domain/running";

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
  { accessType: "read", recordType: "ActiveCaloriesBurned" },
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

/**
 * Agregados de una sesión (distancia/calorías/FC/desnivel) — `ExerciseSessionRecord` no los trae
 * embebidos. **Solo del mismo origen que la sesión** (`dataOriginFilter`): si no, en esa franja se
 * sumaban también los pasos/distancia que el propio móvil u otra app registraban a la vez.
 */
async function sessionAggregates(startTime: string, endTime: string, origin?: string) {
  const range = between(startTime, endTime);
  const dataOriginFilter = origin ? [origin] : undefined;
  const [distance, total, active, hr, elevation] = await Promise.allSettled([
    callNative("aggregateRecord(Distance)", () => aggregateRecord({ recordType: "Distance", timeRangeFilter: range, dataOriginFilter })),
    callNative("aggregateRecord(TotalCaloriesBurned)", () => aggregateRecord({ recordType: "TotalCaloriesBurned", timeRangeFilter: range, dataOriginFilter })),
    callNative("aggregateRecord(ActiveCaloriesBurned)", () => aggregateRecord({ recordType: "ActiveCaloriesBurned", timeRangeFilter: range, dataOriginFilter })),
    callNative("aggregateRecord(HeartRate)", () => aggregateRecord({ recordType: "HeartRate", timeRangeFilter: range, dataOriginFilter })),
    callNative("aggregateRecord(ElevationGained)", () => aggregateRecord({ recordType: "ElevationGained", timeRangeFilter: range, dataOriginFilter })),
  ]);
  const activeKcal = active.status === "fulfilled" ? Math.round(active.value.ACTIVE_CALORIES_TOTAL.inKilocalories) : 0;
  return {
    distanceM: distance.status === "fulfilled" ? Math.round(distance.value.DISTANCE.inMeters) : 0,
    totalKcal: total.status === "fulfilled" ? Math.round(total.value.ENERGY_TOTAL.inKilocalories) : undefined,
    activeKcal: activeKcal > 0 ? activeKcal : undefined,
    avgHr: hr.status === "fulfilled" && hr.value.MEASUREMENTS_COUNT > 0 ? Math.round(hr.value.BPM_AVG) : undefined,
    maxHr: hr.status === "fulfilled" && hr.value.MEASUREMENTS_COUNT > 0 ? Math.round(hr.value.BPM_MAX) : undefined,
    ascentM: elevation.status === "fulfilled" ? Math.round(elevation.value.ELEVATION_GAINED_TOTAL.inMeters) : undefined,
  };
}

export type ImportedActivity = Omit<Activity, "id">;

const PAUSE_TYPES = new Set<number>([ExerciseSegmentType?.PAUSE, ExerciseSegmentType?.REST].filter((x): x is number => typeof x === "number"));
const ms = (iso: string) => new Date(iso).getTime();

/** Segundos en movimiento: la duración de la sesión menos sus pausas (como el ritmo del reloj). */
export function movingSeconds(r: { startTime: string; endTime: string; segments?: { startTime: string; endTime: string; segmentType: number }[] }): number {
  const total = (ms(r.endTime) - ms(r.startTime)) / 1000;
  const paused = (r.segments ?? []).filter((sg) => PAUSE_TYPES.has(sg.segmentType)).reduce((x, sg) => x + Math.max(0, (ms(sg.endTime) - ms(sg.startTime)) / 1000), 0);
  return Math.round(Math.max(0, total - paused));
}

/** Vueltas del reloj (para «plan vs. real» y el ritmo por vuelta); el tipo lo pone la plantilla al vincular. */
type LapLength = { inMeters?: number; value?: number; unit?: string };
const UNIT_M: Record<string, number> = { meters: 1, kilometers: 1000, miles: 1609.344, feet: 0.3048, inches: 0.0254 };
/** La librería declara `{value, unit}` pero lo leído del sistema viene como `{inMeters, …}`: vale cualquiera. */
const lapMeters = (l?: LapLength) => (l ? (l.inMeters ?? (l.value ?? 0) * (UNIT_M[l.unit ?? "meters"] ?? 1)) : 0);

export function lapsFrom(laps: { startTime: string; endTime: string; length?: LapLength | object }[] | undefined): Lap[] | undefined {
  const out = (laps ?? [])
    .map((l, i) => ({ index: i + 1, distanceM: Math.round(lapMeters(l.length as LapLength | undefined)), durationS: Math.round((ms(l.endTime) - ms(l.startTime)) / 1000) }))
    .filter((l) => l.durationS > 0);
  return out.length > 1 ? out : undefined;
}

/**
 * Lee las sesiones de ejercicio nuevas desde `sinceISO` (o desde siempre si es `null`, primera
 * sincronización) hasta ahora, y las mapea a `Activity`. Lanza si Health Connect no está
 * disponible o no se ha concedido permiso — el llamador decide cómo contarlo al usuario.
 * - Pagina (`pageToken`): con años de historial, la primera página no lo traía todo.
 * - Las sesiones ya importadas (`knownIds`, p. ej. las del solape de 7 días) no se vuelven a
 *   agregar: son 5 llamadas nativas por sesión.
 * - Kcal: las **activas** (las totales incluyen el metabolismo basal, que ya está en el objetivo
 *   del día y se contaba dos veces). Si el reloj no da activas, total − `bmrKcalPerDay` del rato.
 */
export async function importNewActivities(sinceISO: string | null, opts: { knownIds?: ReadonlySet<string>; bmrKcalPerDay?: number } = {}): Promise<ImportedActivity[]> {
  if (!(await ensureInitialized())) throw new HealthConnectError("Health Connect no está disponible en este dispositivo");
  const startTime = sinceISO ?? new Date(0).toISOString();
  const endTime = new Date().toISOString();
  const records: Awaited<ReturnType<typeof readRecords<"ExerciseSession">>>["records"] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 50; page++) {
    const res = await callNative("readRecords(ExerciseSession)", () =>
      readRecords("ExerciseSession", { timeRangeFilter: between(startTime, endTime), ascendingOrder: true, pageToken }),
    );
    records.push(...res.records);
    pageToken = res.pageToken || undefined;
    if (!pageToken) break;
  }

  const fresh = records.filter((r) => TYPE_MAP[r.exerciseType] && !(r.metadata?.id && opts.knownIds?.has(r.metadata.id)));
  const out: ImportedActivity[] = [];
  // De 8 en 8 en paralelo: rápido sin saturar el servicio de Health Connect.
  for (let i = 0; i < fresh.length; i += 8) {
    const batch = fresh.slice(i, i + 8);
    const aggs = await Promise.all(batch.map((r) => sessionAggregates(r.startTime, r.endTime, r.metadata?.dataOrigin)));
    batch.forEach((r, j) => {
      const type = TYPE_MAP[r.exerciseType]!;
      const durationS = movingSeconds(r);
      if (durationS <= 0) return;
      const agg = aggs[j]!;
      const wallMinutes = (ms(r.endTime) - ms(r.startTime)) / 60000;
      const kcal =
        agg.activeKcal ??
        (agg.totalKcal !== undefined && opts.bmrKcalPerDay ? Math.max(0, Math.round(agg.totalKcal - (opts.bmrKcalPerDay / 1440) * wallMinutes)) : agg.totalKcal);
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
        kcal,
        laps: lapsFrom(r.laps),
        // Health Connect siempre rellena `metadata.id` en los registros que devuelve `readRecords`
        // (verificado en el SDK de androidx.health.connect) — `mergeImportedActivities()` confía en
        // que sea así para deduplicar.
        externalId: r.metadata?.id,
      });
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
