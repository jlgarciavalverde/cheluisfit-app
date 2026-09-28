// TDEE adaptativo: en vez de un % de ajuste fijo por objetivo (`GOAL_ADJUST` en `nutrition.ts`),
// compara el cambio de peso REAL con el que las kcal registradas predecían y corrige el objetivo
// poco a poco. Puro, sin acceso a la tienda — quien lo llama (`data/store.ts`) decide cuándo y
// qué hacer con la propuesta.
import { addDays } from "./dates";
import { calcTargets, GOAL_ADJUST, tdee, weekSummary } from "./nutrition";
import type { Entry, Profile, Targets, WeightEntry } from "./types";
import { normalizeWeights } from "./weight";

export const TDEE_WINDOW_DAYS = 14; // ventana de tendencia, más robusta al ruido diario que 7
export const TDEE_CHECK_EVERY_DAYS = 7; // cadencia de revisión
export const TDEE_MAX_STEP_KCAL = 75; // paso máximo por ciclo — nada de bandazos
export const TDEE_MAX_TOTAL_KCAL = 300; // tope acumulado del ajuste aprendido
export const TDEE_MIN_LOGGED_DAYS = 7; // mínimo de días con comida registrada en la ventana
export const TDEE_MIN_WEIGHT_POINTS = 4; // mínimo de pesajes repartidos en la ventana
/**
 * Un día cuenta como «registrado entero» si llega al menos a esta fracción del mantenimiento (y a
 * `TDEE_MIN_DAY_KCAL`). Los días a medias (se olvidó apuntar la cena) bajaban la media, el modelo
 * esperaba perder peso, no lo veía y bajaba el objetivo: el fallo típico de este tipo de algoritmo.
 */
// 40 %: deja fuera los días con solo el desayuno o la comida apuntados (~400-900 kcal), pero no
// una dieta agresiva de verdad (1.200 kcal con un mantenimiento de 2.700 son un 44 %).
export const TDEE_MIN_DAY_FRACTION = 0.4;
export const TDEE_MIN_DAY_KCAL = 800;

const KCAL_PER_KG = 7700;
const DAY_MS = 86_400_000;
const roundTo10 = (n: number) => Math.round(n / 10) * 10;
const clamp = (n: number, max: number) => Math.max(-max, Math.min(max, n));

/**
 * Pendiente kg/día por regresión lineal simple (mínimos cuadrados) sobre los pesos de la
 * ventana; `null` si hay menos de `TDEE_MIN_WEIGHT_POINTS` medidas — dos puntos sueltos no dicen
 * nada fiable sobre una tendencia real, a diferencia de `weightChange()` (resta simple).
 */
export function weightTrendPerDay(weights: readonly WeightEntry[], today: string, days: number = TDEE_WINDOW_DAYS): number | null {
  const from = addDays(today, -(days - 1)); // misma ventana que las kcal: `days` días contando hoy
  const points = normalizeWeights(weights).filter((w) => w.date >= from && w.date <= today);
  if (points.length < TDEE_MIN_WEIGHT_POINTS) return null;

  const x0 = Date.parse(points[0]!.date);
  const xs = points.map((p) => (Date.parse(p.date) - x0) / DAY_MS);
  const ys = points.map((p) => p.kg);
  const n = xs.length;
  const sumX = xs.reduce((a, x) => a + x, 0);
  const sumY = ys.reduce((a, y) => a + y, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * ys[i]!, 0);
  const sumXX = xs.reduce((a, x) => a + x * x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null; // todos los puntos en el mismo día tras normalizar — no debería pasar, pero sin dividir por 0
  return (n * sumXY - sumX * sumY) / denom;
}

export interface TdeeProposal {
  newAdjustment: number;
  deltaKcal: number;
  reason: string;
}

/**
 * Compara el cambio de peso esperado (según las kcal medias registradas frente al TDEE de
 * fórmula) con el cambio real (`weightTrendPerDay`), y devuelve el ajuste de kcal/día que
 * explicaría la diferencia — amortiguado y acotado. `null` si faltan datos, o si el valor no
 * cambia tras redondear (nada que proponer). La cadencia de revisión (`TDEE_CHECK_EVERY_DAYS`)
 * **no** se comprueba aquí — vive en quien llama (`data/store.ts`'s `checkTdee()`), para que
 * `lastCheckedAt` solo avance cuando de verdad se ha evaluado, no en cada llamada.
 */
export function checkTdeeAdjustment(input: {
  profile: Profile;
  weights: readonly WeightEntry[];
  entries: readonly Entry[];
  today: string;
  kcalAdjustment: number;
  /**
   * Media diaria de kcal de ejercicio de la ventana, solo si la persona las «come» (ajuste «sumar
   * calorías de ejercicio»): esas kcal se añaden a lo que gasta, o parecería que come de más.
   */
  exerciseKcalPerDay?: number;
}): TdeeProposal | null {
  const { profile, weights, entries, today, kcalAdjustment, exerciseKcalPerDay = 0 } = input;
  // Mantenimiento que ya se está usando: fórmula + lo aprendido hasta ahora. Con la fórmula sola,
  // cada semana volvía a proponer la misma corrección entera encima de la anterior hasta el tope.
  const maintenance = tdee(profile) + kcalAdjustment + exerciseKcalPerDay;
  const minDay = Math.max(TDEE_MIN_DAY_KCAL, maintenance * TDEE_MIN_DAY_FRACTION);
  const dates = Array.from({ length: TDEE_WINDOW_DAYS }, (_, i) => addDays(today, -(TDEE_WINDOW_DAYS - 1 - i)));
  const fullDays = weekSummary(entries, dates, 0).days.filter((d) => d.logged && d.totals.kcal >= minDay);
  if (fullDays.length < TDEE_MIN_LOGGED_DAYS) return null;
  const avgKcal = fullDays.reduce((x, d) => x + d.totals.kcal, 0) / fullDays.length;

  const trendPerDay = weightTrendPerDay(weights, today);
  if (trendPerDay === null) return null;

  // Si el peso real cambia MENOS de lo que las kcal registradas predecían (trendPerDay >
  // expectedKgPerDay), el mantenimiento real de la persona es MÁS BAJO que el que calculó la
  // fórmula (está comiendo, en términos reales, más cerca de su mantenimiento de lo que parecía)
  // — hay que BAJAR el objetivo para seguir al ritmo previsto, no subirlo. De ahí el signo
  // invertido: `expected - trend`, no `trend - expected`.
  const expectedKgPerDay = (avgKcal - maintenance) / KCAL_PER_KG;
  const step = clamp((expectedKgPerDay - trendPerDay) * KCAL_PER_KG, TDEE_MAX_STEP_KCAL);
  const newAdjustment = clamp(roundTo10(kcalAdjustment + step), TDEE_MAX_TOTAL_KCAL);
  if (newAdjustment === kcalAdjustment) return null;

  const deltaKcal = newAdjustment - kcalAdjustment;
  const reason =
    deltaKcal > 0
      ? `Según tu peso real de las últimas dos semanas, tu cuerpo necesita más energía de la que calculaba la fórmula — subo tu objetivo unas ${deltaKcal} kcal/día.`
      : `Según tu peso real de las últimas dos semanas, tu cuerpo necesita menos energía de la que calculaba la fórmula — bajo tu objetivo unas ${Math.abs(deltaKcal)} kcal/día.`;
  return { newAdjustment, deltaKcal, reason };
}

/** ¿Hay datos suficientes para evaluar (días completos y pesajes)? Quien llama solo da por hecha
 *  la revisión semanal si los había: si no, vuelve a mirar en cuanto los haya, sin esperar 7 días. */
export function hasEnoughTdeeData(input: { profile: Profile; weights: readonly WeightEntry[]; entries: readonly Entry[]; today: string; kcalAdjustment: number; exerciseKcalPerDay?: number }): boolean {
  const maintenance = tdee(input.profile) + input.kcalAdjustment + (input.exerciseKcalPerDay ?? 0);
  const minDay = Math.max(TDEE_MIN_DAY_KCAL, maintenance * TDEE_MIN_DAY_FRACTION);
  const dates = Array.from({ length: TDEE_WINDOW_DAYS }, (_, i) => addDays(input.today, -(TDEE_WINDOW_DAYS - 1 - i)));
  const full = weekSummary(input.entries, dates, 0).days.filter((d) => d.logged && d.totals.kcal >= minDay).length;
  return full >= TDEE_MIN_LOGGED_DAYS && weightTrendPerDay(input.weights, input.today) !== null;
}

/**
 * Objetivos vigentes: los puestos a mano, o los calculados del perfil con el ajuste aprendido si
 * el TDEE adaptativo está activado. **Única** fuente: la usan la tienda (Nutrición, Hoy, la IA) y la
 * pantalla Objetivo — antes había tres copias de esta cuenta y podían dar números distintos.
 */
export function targetsFor(profile: Profile, override: Targets | null, state: { enabled: boolean; kcalAdjustment: number }): Targets {
  return override ?? calcTargets(profile, state.enabled ? effectiveAdjust(profile, state.kcalAdjustment) : undefined);
}

/** `adjust` a pasarle a `calcTargets(profile, adjust)`: el % fijo del objetivo más la corrección
 *  aprendida, convertida a fracción del TDEE de fórmula. */
export function effectiveAdjust(profile: Profile, kcalAdjustment: number): number {
  const maintenance = tdee(profile);
  if (maintenance <= 0) return GOAL_ADJUST[profile.goal];
  return GOAL_ADJUST[profile.goal] + kcalAdjustment / maintenance;
}
