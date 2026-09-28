import { describe, expect, it } from "vitest";
import { freeSnapshot, runSnapshot, snapshotSummary, strengthSnapshot, trimRoute } from "./socialSnapshot";
import type { Activity } from "./running";
import { newSet, type Workout } from "./strength";

const METERS_PER_DEGREE = 111_320;

/** Recta hacia el norte, `n` tramos de `stepM` metros cada uno (n+1 puntos). */
function straightRoute(n: number, stepM: number): { lat: number; lon: number }[] {
  const dLat = stepM / METERS_PER_DEGREE;
  return Array.from({ length: n + 1 }, (_, i) => ({ lat: 37 + dLat * i, lon: -1 }));
}

describe("trimRoute", () => {
  it("recorta los extremos y deja el tramo intermedio intacto", () => {
    const route = straightRoute(20, 100); // 21 puntos, 2000 m en total, 100 m entre cada uno
    const trimmed = trimRoute(route, 400);
    expect(trimmed).toBeDefined();
    expect(trimmed!.length).toBeLessThan(route.length);
    // El primer y el último punto del original (los que revelan casa) no deben quedar.
    expect(trimmed![0]).not.toEqual(route[0]);
    expect(trimmed![trimmed!.length - 1]).not.toEqual(route[route.length - 1]);
    // El punto de en medio (el más "seguro") sigue estando.
    expect(trimmed).toContainEqual(route[10]);
  });

  it("una ruta corta (sin tramo intermedio seguro) no comparte nada", () => {
    const route = straightRoute(5, 100); // 500 m en total, menos que 2×400
    expect(trimRoute(route, 400)).toBeUndefined();
  });

  it("sin ruta o con un único punto, nada que recortar", () => {
    expect(trimRoute(undefined)).toBeUndefined();
    expect(trimRoute([{ lat: 37, lon: -1 }])).toBeUndefined();
  });
});

const activity = (overrides: Partial<Activity> = {}): Activity => ({
  id: "a1",
  date: "2026-09-23",
  type: "run",
  source: "manual",
  title: "Rodaje suave",
  distanceM: 8000,
  durationS: 2400,
  ...overrides,
});

describe("runSnapshot", () => {
  it("incluye ritmo y deja la ruta fuera por defecto", () => {
    const snap = runSnapshot(activity({ route: straightRoute(20, 100) }));
    expect(snap).toMatchObject({ snapshotVersion: 1, kind: "run", distanceM: 8000 });
    expect(snap.pace).toBeCloseTo(300); // 2400 s / 8 km = 300 s/km
    expect(snap.route).toBeUndefined();
  });

  it("con includeRoute=true, la ruta va recortada, no tal cual", () => {
    const route = straightRoute(20, 100);
    const snap = runSnapshot(activity({ route }), true);
    expect(snap.route).toBeDefined();
    expect(snap.route!.length).toBeLessThan(route.length);
  });
});

const workout = (): Workout => ({
  id: "w1",
  name: "Empuje",
  date: "2026-09-23",
  startedAt: "2026-09-23T10:00:00.000Z",
  endedAt: "2026-09-23T11:00:00.000Z",
  exercises: [
    {
      id: "we1",
      exerciseId: "ex1",
      name: "Press banca",
      primary: ["chest"],
      secondary: ["triceps"],
      equipment: "barbell",
      kind: "weight_reps",
      sets: [{ ...newSet("normal", 60, 8), done: true }, { ...newSet("warmup", 40, 10), done: true }],
      plan: { sets: [], restS: 90, rule: "double", increment: 2.5 },
    },
  ],
});

describe("strengthSnapshot", () => {
  it("solo lleva las series hechas y de trabajo (sin calentamientos)", () => {
    const snap = strengthSnapshot(workout());
    expect(snap.exercises[0]!.sets).toEqual([{ reps: 8, kg: 60, rpe: undefined }]);
    expect(snap.totals.workingSets).toBe(1);
  });
});

describe("freeSnapshot y snapshotSummary", () => {
  it("una publicación libre no lleva datos de entreno", () => {
    expect(freeSnapshot()).toEqual({ snapshotVersion: 1, kind: "free" });
    expect(snapshotSummary(freeSnapshot())).toBe("");
  });

  it("resume carrera y entreno de fuerza en un texto corto", () => {
    expect(snapshotSummary(runSnapshot(activity()))).toBe("8 km en 40:00 · 5:00/km");
    expect(snapshotSummary(strengthSnapshot(workout()))).toBe("1 series · 480 kg de volumen");
  });
});

describe("tamaño del snapshot", () => {
  it("un entreno de fuerza normal queda muy por debajo del límite del servidor (8 KB)", () => {
    const json = JSON.stringify(strengthSnapshot(workout()));
    expect(json.length).toBeLessThan(8192);
  });
});
