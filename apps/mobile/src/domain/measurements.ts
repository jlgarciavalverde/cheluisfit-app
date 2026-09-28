// Medidas corporales (cintura, pecho, brazo, muslo, cadera): mismo patrón que `weight.ts`, pero
// con una `kind` además de la fecha — varias medidas pueden compartir la misma fecha, una por
// zona, así que la clave de "una sola por día" es (`date`,`kind`), no `date` a secas.
import type { MeasurementEntry, MeasurementKind } from "./types";

export const MEASUREMENT_LABEL: Record<MeasurementKind, string> = {
  waist: "Cintura",
  chest: "Pecho",
  arm: "Brazo",
  thigh: "Muslo",
  hip: "Cadera",
};

export const MEASUREMENT_KINDS: MeasurementKind[] = ["waist", "chest", "arm", "thigh", "hip"];

/** Ordena por fecha y deja una sola medida por día para esa zona (la última que se añadió). */
export function normalizeMeasurements(list: readonly MeasurementEntry[], kind: MeasurementKind): MeasurementEntry[] {
  const byDate = new Map<string, MeasurementEntry>();
  for (const m of list) if (m.kind === kind) byDate.set(m.date, m);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function latestMeasurement(list: readonly MeasurementEntry[], kind: MeasurementKind): MeasurementEntry | undefined {
  const n = normalizeMeasurements(list, kind);
  return n[n.length - 1];
}

/** Un contorno corporal razonable en cm (evita erratas como 5 o 500). */
export function isPlausibleMeasurement(cm: number): boolean {
  return Number.isFinite(cm) && cm >= 10 && cm <= 200;
}
