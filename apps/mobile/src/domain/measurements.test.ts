import { describe, expect, it } from "vitest";
import { isPlausibleMeasurement, latestMeasurement, normalizeMeasurements } from "./measurements";
import type { MeasurementEntry } from "./types";

const list: MeasurementEntry[] = [
  { date: "2026-09-01", kind: "waist", cm: 90 },
  { date: "2026-09-05", kind: "waist", cm: 89 },
  { date: "2026-09-01", kind: "chest", cm: 100 },
];

describe("normalizeMeasurements", () => {
  it("filtra por zona y ordena por fecha", () => {
    expect(normalizeMeasurements(list, "waist").map((m) => m.date)).toEqual(["2026-09-01", "2026-09-05"]);
  });

  it("una zona sin medidas da una lista vacía, no revienta", () => {
    expect(normalizeMeasurements(list, "hip")).toEqual([]);
  });

  it("dos medidas de la misma zona el mismo día: gana la última añadida", () => {
    const dup: MeasurementEntry[] = [
      { date: "2026-09-01", kind: "arm", cm: 30 },
      { date: "2026-09-01", kind: "arm", cm: 31 },
    ];
    expect(normalizeMeasurements(dup, "arm")).toEqual([{ date: "2026-09-01", kind: "arm", cm: 31 }]);
  });
});

describe("latestMeasurement", () => {
  it("la más reciente de la zona pedida", () => {
    expect(latestMeasurement(list, "waist")?.cm).toBe(89);
    expect(latestMeasurement(list, "chest")?.cm).toBe(100);
  });

  it("sin medidas de esa zona, undefined", () => {
    expect(latestMeasurement(list, "thigh")).toBeUndefined();
  });
});

describe("isPlausibleMeasurement", () => {
  it("acepta contornos razonables", () => {
    expect(isPlausibleMeasurement(90)).toBe(true);
  });
  it("rechaza erratas obvias", () => {
    expect(isPlausibleMeasurement(5)).toBe(false);
    expect(isPlausibleMeasurement(500)).toBe(false);
    expect(isPlausibleMeasurement(NaN)).toBe(false);
  });
});
