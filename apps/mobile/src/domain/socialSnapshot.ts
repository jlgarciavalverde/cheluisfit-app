// Snapshot que se copia dentro de un post al publicarlo (`docs/plan-social.md`) — el servidor
// nunca lee los blobs privados de fitness, solo guarda este resumen tal cual se construyó aquí.
// `snapshotVersion` va en cada snapshot para poder cambiar de forma sin migrar nada en el
// servidor (lo interpreta el móvil, que siempre sabe qué versión sabe leer).
import { fmtDuration, fmtKm, fmtPace } from "./format";
import { compactRoute, SNAPSHOT_ROUTE_POINTS } from "./route";
import { avgPace, type Activity } from "./running";
import { workoutTotals, type Workout, type WorkoutTotals } from "./strength";

const TRIM_METERS = 400;

function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Recorta los primeros y últimos `trimMeters` de la ruta (revelan casa/punto de salida) y deja
 * solo el tramo intermedio. Si la carrera es tan corta que no queda un tramo intermedio seguro
 * (menos del doble de `trimMeters`), no hay forma segura de compartir nada de la ruta: `undefined`.
 */
export function trimRoute(route: { lat: number; lon: number }[] | undefined, trimMeters: number = TRIM_METERS): { lat: number; lon: number }[] | undefined {
  if (!route || route.length < 2) return undefined;
  const cum = [0];
  for (let i = 1; i < route.length; i++) cum.push(cum[i - 1]! + haversineM(route[i - 1]!, route[i]!));
  const total = cum[cum.length - 1]!;
  if (total <= trimMeters * 2) return undefined;
  const startIdx = cum.findIndex((d) => d >= trimMeters);
  let endIdx = -1;
  for (let i = route.length - 1; i >= 0; i--) {
    if (total - cum[i]! >= trimMeters) {
      endIdx = i;
      break;
    }
  }
  if (startIdx < 0 || endIdx <= startIdx) return undefined;
  return route.slice(startIdx, endIdx + 1);
}

export interface RunSnapshot {
  snapshotVersion: 1;
  kind: "run";
  title: string;
  date: string;
  distanceM: number;
  durationS: number;
  avgHr?: number;
  maxHr?: number;
  ascentM?: number;
  kcal?: number;
  pace: number;
  laps?: { label: string; pace: number }[];
  route?: { lat: number; lon: number }[];
}

/** `includeRoute`: decisión explícita de quien publica, por defecto off (ver plan social). */
export function runSnapshot(activity: Activity, includeRoute = false): RunSnapshot {
  return {
    snapshotVersion: 1,
    kind: "run",
    title: activity.title,
    date: activity.date,
    distanceM: activity.distanceM,
    durationS: activity.durationS,
    avgHr: activity.avgHr,
    maxHr: activity.maxHr,
    ascentM: activity.ascentM,
    kcal: activity.kcal,
    pace: avgPace(activity),
    laps: activity.laps?.map((l, i) => ({ label: String(i + 1), pace: avgPace(l) })),
    route: includeRoute ? compactRoute(trimRoute(activity.route), SNAPSHOT_ROUTE_POINTS) : undefined,
  };
}

export interface StrengthSnapshot {
  snapshotVersion: 1;
  kind: "strength";
  title: string;
  date: string;
  exercises: { name: string; sets: { reps: number; kg: number | null; rpe?: number | null }[] }[];
  totals: WorkoutTotals;
}

/** Solo series hechas y que no sean de calentamiento — lo mismo que ya cuenta `workoutTotals`. */
export function strengthSnapshot(workout: Workout): StrengthSnapshot {
  return {
    snapshotVersion: 1,
    kind: "strength",
    title: workout.name,
    date: workout.date,
    exercises: workout.exercises.map((e) => ({
      name: e.name,
      sets: e.sets.filter((s) => s.done && s.type !== "warmup").map((s) => ({ reps: s.reps ?? 0, kg: s.kg, rpe: s.rpe ?? undefined })),
    })),
    totals: workoutTotals(workout),
  };
}

export interface FreeSnapshot {
  snapshotVersion: 1;
  kind: "free";
}

export function freeSnapshot(): FreeSnapshot {
  return { snapshotVersion: 1, kind: "free" };
}

export type Snapshot = RunSnapshot | StrengthSnapshot | FreeSnapshot;

/** Texto corto para tarjetas del feed y para el asistente de IA (fase 2, ver plan). */
export function snapshotSummary(s: Snapshot): string {
  if (s.kind === "run") return `${fmtKm(s.distanceM)} km en ${fmtDuration(s.durationS)}` + (s.pace > 0 ? ` · ${fmtPace(s.pace)}/km` : "");
  if (s.kind === "strength") return `${s.totals.workingSets} series · ${s.totals.volume} kg de volumen`;
  return "";
}
