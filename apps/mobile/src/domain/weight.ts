import { addDays } from "./dates";
import type { WeightEntry } from "./types";

/** Ordena por fecha y deja una sola medida por día (la última que se añadió). */
export function normalizeWeights(list: readonly WeightEntry[]): WeightEntry[] {
  const byDate = new Map<string, WeightEntry>();
  for (const w of list) byDate.set(w.date, w);
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function latestWeight(list: readonly WeightEntry[]): WeightEntry | undefined {
  const n = normalizeWeights(list);
  return n[n.length - 1];
}

/**
 * Variación en kg entre la medida más reciente y la más antigua de los últimos
 * `days` días. `null` si no hay al menos dos medidas en la ventana.
 */
export function weightChange(list: readonly WeightEntry[], today: string, days: number): number | null {
  const from = addDays(today, -days);
  const w = normalizeWeights(list).filter((x) => x.date >= from && x.date <= today);
  if (w.length < 2) return null;
  return Math.round((w[w.length - 1].kg - w[0].kg) * 10) / 10;
}

/** Un peso razonable para una persona adulta (evita erratas como 780 o 7,8). */
export function isPlausibleWeight(kg: number): boolean {
  return Number.isFinite(kg) && kg >= 30 && kg <= 250;
}
