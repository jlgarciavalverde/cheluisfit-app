import { describe, expect, it } from "vitest";
import { isPlausibleWeight, latestWeight, normalizeWeights, weightChange } from "./weight";

const w = (date: string, kg: number) => ({ date, kg });

describe("normalizeWeights", () => {
  it("ordena por fecha y deja una por día", () => {
    const list = [w("2026-09-03", 78), w("2026-09-01", 80), w("2026-09-01", 79.5)];
    const n = normalizeWeights(list);
    expect(n.map((x) => x.date)).toEqual(["2026-09-01", "2026-09-03"]);
    expect(n[0].kg).toBe(79.5);
  });
});

describe("latestWeight", () => {
  it("devuelve la más reciente", () => {
    expect(latestWeight([w("2026-09-01", 80), w("2026-09-05", 78)])?.kg).toBe(78);
  });

  it("undefined si la lista está vacía", () => {
    expect(latestWeight([])).toBeUndefined();
  });
});

describe("weightChange", () => {
  it("calcula la diferencia en los últimos N días", () => {
    const list = [w("2026-09-01", 80), w("2026-09-05", 79), w("2026-09-10", 78.5)];
    expect(weightChange(list, "2026-09-10", 14)).toBe(-1.5);
  });

  it("null si no hay al menos dos medidas en la ventana", () => {
    expect(weightChange([w("2026-09-01", 80)], "2026-09-10", 7)).toBeNull();
    expect(weightChange([], "2026-09-10", 7)).toBeNull();
  });

  it("ignora medidas fuera de la ventana", () => {
    const list = [w("2026-08-01", 85), w("2026-09-08", 79), w("2026-09-10", 78.5)];
    expect(weightChange(list, "2026-09-10", 7)).toBe(-0.5);
  });
});

describe("isPlausibleWeight", () => {
  it("acepta pesos razonables", () => {
    expect(isPlausibleWeight(78)).toBe(true);
    expect(isPlausibleWeight(30)).toBe(true);
    expect(isPlausibleWeight(250)).toBe(true);
  });

  it("rechaza valores fuera de rango o inválidos", () => {
    expect(isPlausibleWeight(7.8)).toBe(false);
    expect(isPlausibleWeight(780)).toBe(false);
    expect(isPlausibleWeight(NaN)).toBe(false);
    expect(isPlausibleWeight(Infinity)).toBe(false);
  });
});
