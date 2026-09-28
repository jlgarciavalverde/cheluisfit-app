import { describe, expect, it } from "vitest";
import { weekDates } from "./dates";
import { isOnTarget, scaleNutrients, weekSummary } from "./nutrition";
import type { Entry, Nutrients } from "./types";
import { isPlausibleWeight, latestWeight, normalizeWeights, weightChange } from "./weight";

const per100: Nutrients = { kcal: 100, protein: 10, carbs: 10, fat: 1, fiber: 1, sugars: 1, satFat: 0, salt: 0 };
const e = (date: string, grams: number, id = `${date}-${grams}`): Entry => ({
  id,
  date,
  meal: "lunch",
  foodId: "x",
  name: "x",
  grams,
  nutrients: scaleNutrients(per100, grams),
});

describe("semana", () => {
  it("lunes a domingo", () => {
    expect(weekDates("2026-09-23")).toEqual([
      "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27",
    ]);
    expect(weekDates("2026-09-27")[0]).toBe("2026-09-21");
    expect(weekDates("2026-09-21")[6]).toBe("2026-09-27");
    expect(weekDates("2026-10-01")).toContain("2026-10-04");
  });

  it("resume solo los días registrados", () => {
    const dates = weekDates("2026-09-21");
    const s = weekSummary([e("2026-09-21", 2000), e("2026-09-22", 2200), e("2026-09-22", 100, "b")], dates, 2200);
    expect(s.loggedDays).toBe(2);
    expect(s.days.map((d) => d.logged)).toEqual([true, true, false, false, false, false, false]);
    expect(s.average.kcal).toBe(Math.round((2000 + 2300) / 2));
    // 2.000 (−9 %) y 2.300 (+4,5 %) están dentro del ±10 % de 2.200
    expect(s.onTargetDays).toBe(2);
  });

  it("semana sin registros", () => {
    const s = weekSummary([], weekDates("2026-09-21"), 2200);
    expect(s.loggedDays).toBe(0);
    expect(s.average.kcal).toBe(0);
    expect(s.onTargetDays).toBe(0);
  });

  it("margen del objetivo", () => {
    expect(isOnTarget(2420, 2200)).toBe(true);
    expect(isOnTarget(2421, 2200)).toBe(false);
    expect(isOnTarget(1980, 2200)).toBe(true);
    expect(isOnTarget(100, 0)).toBe(false);
  });
});

describe("peso", () => {
  const list = [
    { date: "2026-09-01", kg: 80 },
    { date: "2026-09-21", kg: 78.5 },
    { date: "2026-09-10", kg: 79.2 },
    { date: "2026-09-10", kg: 79.0 },
  ];

  it("ordena y deja una medida por día", () => {
    const n = normalizeWeights(list);
    expect(n.map((x) => x.date)).toEqual(["2026-09-01", "2026-09-10", "2026-09-21"]);
    expect(n[1].kg).toBe(79);
    expect(latestWeight(list)?.kg).toBe(78.5);
  });

  it("variación en una ventana de días", () => {
    expect(weightChange(list, "2026-09-21", 30)).toBe(-1.5);
    expect(weightChange(list, "2026-09-21", 5)).toBeNull(); // una sola medida en la ventana
    expect(weightChange([], "2026-09-21", 30)).toBeNull();
  });

  it("detecta erratas de peso", () => {
    expect(isPlausibleWeight(78)).toBe(true);
    expect(isPlausibleWeight(780)).toBe(false);
    expect(isPlausibleWeight(7.8)).toBe(false);
    expect(isPlausibleWeight(Number.NaN)).toBe(false);
  });
});

import { bmr as bmrOf, calcTargets as calcT, carbsFor as carbsOf } from "./nutrition";

describe("objetivos: suelo de seguridad y peso de referencia", () => {
  it("un déficit nunca baja del metabolismo basal ni de 1.200 kcal (mujer)", () => {
    const p = { name: "", sex: "female" as const, age: 60, heightCm: 155, weightKg: 50, activity: 1.2 as const, goal: "lose" as const };
    const t = calcT(p);
    expect(t.kcal).toBeGreaterThanOrEqual(Math.max(1200, Math.round(bmrOf(p))));
  });

  it("con IMC alto, proteína y grasa sobre el peso a IMC 25, y queda sitio para los hidratos", () => {
    const p = { name: "", sex: "male" as const, age: 40, heightCm: 175, weightKg: 130, activity: 1.375 as const, goal: "lose" as const };
    const t = calcT(p);
    const ref = 25 * 1.75 ** 2; // ≈ 76,6 kg
    expect(t.protein).toBe(Math.round(ref * 2));
    expect(t.carbs).toBeGreaterThan(100);
    expect(carbsOf(t.kcal, t.protein, t.fat)).toBe(t.carbs);
  });
});
