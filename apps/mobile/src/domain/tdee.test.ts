import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { calcTargets, scaleNutrients, tdee as formulaTdee } from "./nutrition";
import {
  checkTdeeAdjustment,
  effectiveAdjust,
  TDEE_MAX_TOTAL_KCAL,
  TDEE_MIN_LOGGED_DAYS,
  TDEE_MIN_WEIGHT_POINTS,
  TDEE_WINDOW_DAYS,
  weightTrendPerDay,
} from "./tdee";
import type { Entry, Nutrients, Profile, WeightEntry } from "./types";

const TODAY = "2026-09-23";
const profile: Profile = { name: "Test", sex: "male", age: 30, heightCm: 180, weightKg: 80, activity: 1.55, goal: "lose" };

const per100: Nutrients = { kcal: 100, protein: 10, carbs: 10, fat: 1, fiber: 1, sugars: 1, satFat: 0, salt: 0 };
const entry = (date: string, kcal: number): Entry => ({ id: `e-${date}`, date, meal: "lunch", foodId: "x", name: "x", grams: kcal, nutrients: scaleNutrients(per100, kcal) });
const weight = (date: string, kg: number): WeightEntry => ({ date, kg });

describe("weightTrendPerDay", () => {
  it("con menos del mínimo de medidas, null", () => {
    const weights = [weight(addDays(TODAY, -10), 80), weight(TODAY, 79)];
    expect(weightTrendPerDay(weights, TODAY)).toBeNull();
  });

  it("una bajada constante da una pendiente negativa cercana a la real", () => {
    // 80 → 79 en 13 días ≈ -0,0769 kg/día
    const weights = [weight(addDays(TODAY, -13), 80), weight(addDays(TODAY, -9), 79.69), weight(addDays(TODAY, -4), 79.31), weight(TODAY, 79)];
    const trend = weightTrendPerDay(weights, TODAY);
    expect(trend).not.toBeNull();
    expect(trend!).toBeCloseTo(-0.0769, 2);
  });

  it("peso estable da una pendiente cercana a 0", () => {
    const weights = [weight(addDays(TODAY, -12), 80), weight(addDays(TODAY, -8), 80.1), weight(addDays(TODAY, -4), 79.9), weight(TODAY, 80)];
    expect(weightTrendPerDay(weights, TODAY)!).toBeCloseTo(0, 1);
  });

  it("ignora medidas fuera de la ventana", () => {
    const weights = [weight(addDays(TODAY, -400), 100), weight(addDays(TODAY, -10), 80), weight(addDays(TODAY, -6), 79.8), weight(addDays(TODAY, -3), 79.6), weight(TODAY, 79.5)];
    // Con la medida de hace 400 días dentro, la pendiente saldría disparada — confirma que no entra.
    expect(weightTrendPerDay(weights, TODAY)!).toBeGreaterThan(-1);
  });
});

/** 14 días completos, todos registrados con las mismas kcal (deficit fijo respecto al mantenimiento). */
function loggedDays(kcal: number): Entry[] {
  return Array.from({ length: TDEE_WINDOW_DAYS }, (_, i) => entry(addDays(TODAY, -i), kcal));
}

describe("checkTdeeAdjustment", () => {
  const maintenance = formulaTdee(profile);

  it("sin suficientes días registrados, null", () => {
    const entries = loggedDays(maintenance - 500).slice(0, TDEE_MIN_LOGGED_DAYS - 1);
    const weights = [weight(addDays(TODAY, -12), 80), weight(addDays(TODAY, -8), 79.5), weight(addDays(TODAY, -4), 79), weight(TODAY, 78.5)];
    expect(checkTdeeAdjustment({ profile, weights, entries, today: TODAY, kcalAdjustment: 0 })).toBeNull();
  });

  it("sin suficientes pesajes, null", () => {
    const entries = loggedDays(maintenance - 500);
    const weights = [weight(addDays(TODAY, -10), 80), weight(TODAY, 79)];
    expect(checkTdeeAdjustment({ profile, weights, entries, today: TODAY, kcalAdjustment: 0 })).toBeNull();
  });

  it("perdiendo más deprisa de lo esperado: sube el objetivo (el mantenimiento real es más alto)", () => {
    const entries = loggedDays(maintenance - 500); // déficit esperado ≈ 500 kcal/día
    // Pérdida real bastante más rápida que la esperada (~0,065 kg/día): ritmo mayor.
    const weights = [weight(addDays(TODAY, -13), 80), weight(addDays(TODAY, -9), 79.5), weight(addDays(TODAY, -4), 79), weight(TODAY, 78.6)];
    const r = checkTdeeAdjustment({ profile, weights, entries, today: TODAY, kcalAdjustment: 0 });
    expect(r).not.toBeNull();
    expect(r!.deltaKcal).toBeGreaterThan(0);
    // El paso se amortigua al máximo (±75) y luego se redondea a la decena más cercana (→ 80).
    expect(r!.newAdjustment).toBe(80);
    expect(r!.reason).toContain("más energía");
  });

  it("perdiendo más despacio de lo esperado: baja el objetivo (el mantenimiento real es más bajo)", () => {
    const entries = loggedDays(maintenance - 500);
    // Pérdida real mucho más lenta que la esperada.
    const weights = [weight(addDays(TODAY, -13), 80), weight(addDays(TODAY, -9), 79.9), weight(addDays(TODAY, -4), 79.8), weight(TODAY, 79.7)];
    const r = checkTdeeAdjustment({ profile, weights, entries, today: TODAY, kcalAdjustment: 0 });
    expect(r).not.toBeNull();
    expect(r!.deltaKcal).toBeLessThan(0);
    // El paso se amortigua al máximo (±75) y luego se redondea a la decena más cercana (→ -70).
    expect(r!.newAdjustment).toBe(-70);
    expect(r!.reason).toContain("menos energía");
  });

  it("no propone nada si el cambio real ya coincide con lo esperado", () => {
    const entries = loggedDays(maintenance - 500);
    // Pérdida real muy cercana a la esperada (≈500 kcal/día ≈ 0,065 kg/día).
    const perDay = -500 / 7700;
    const weights = Array.from({ length: 4 }, (_, i) => weight(addDays(TODAY, -13 + i * 4), 80 + perDay * i * 4));
    const r = checkTdeeAdjustment({ profile, weights, entries, today: TODAY, kcalAdjustment: 0 });
    expect(r).toBeNull();
  });

  it("el ajuste acumulado nunca pasa de ±TDEE_MAX_TOTAL_KCAL", () => {
    const entries = loggedDays(maintenance - 500);
    const weights = [weight(addDays(TODAY, -13), 80), weight(addDays(TODAY, -9), 79.5), weight(addDays(TODAY, -4), 79), weight(TODAY, 78.6)];
    const r = checkTdeeAdjustment({ profile, weights, entries, today: TODAY, kcalAdjustment: TDEE_MAX_TOTAL_KCAL - 10 });
    expect(r!.newAdjustment).toBe(TDEE_MAX_TOTAL_KCAL);
  });
});

describe("effectiveAdjust", () => {
  it("sin ajuste aprendido, coincide con el % fijo del objetivo", () => {
    expect(effectiveAdjust(profile, 0)).toBeCloseTo(-0.15, 6); // GOAL_ADJUST.lose
  });

  it("aplicado a calcTargets, desplaza las kcal exactamente el ajuste aprendido (redondeo a la decena aparte)", () => {
    const base = calcTargets(profile);
    const adjusted = calcTargets(profile, effectiveAdjust(profile, 120));
    expect(adjusted.kcal - base.kcal).toBeCloseTo(120, -1); // redondeado a la decena más cercana
  });
});
