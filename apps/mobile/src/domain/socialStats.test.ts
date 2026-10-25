import { describe, expect, it } from "vitest";
import { buildProfileStats, shouldUploadStats, STATS_UPLOAD_EVERY_MS, statsFingerprint } from "./socialStats";
import type { Activity } from "./running";
import type { SetLog, Workout } from "./strength";

const run = (id: string, date: string, km: number, min: number): Activity => ({ id, date, type: "run", source: "manual", title: "r", distanceM: km * 1000, durationS: min * 60 });
const set = (kg: number, reps: number): SetLog => ({ id: `${kg}-${reps}`, type: "normal", kg, reps, rpe: null, done: true });
const workout = (id: string, date: string, ex: { id: string; name: string; sets: SetLog[]; kind?: "weight_reps" | "bodyweight" }[]): Workout => ({
  id,
  name: "W",
  date,
  startedAt: `${date}T10:00:00Z`,
  exercises: ex.map((e) => ({
    id: `we-${e.id}`,
    exerciseId: e.id,
    name: e.name,
    primary: ["chest"],
    secondary: [],
    equipment: "barbell",
    kind: e.kind ?? "weight_reps",
    sets: e.sets,
    plan: { sets: [], restS: 90, rule: "off", increment: 2.5 },
  })),
});

describe("buildProfileStats", () => {
  const today = "2026-10-22";
  const stats = buildProfileStats({
    today,
    activities: [run("a", "2026-10-21", 5, 25), run("b", "2026-10-20", 10.2, 54), run("c", "2026-09-28", 21.2, 120)],
    workouts: [
      workout("w1", "2026-10-22", [{ id: "banca", name: "Press banca", sets: [set(80, 5)] }, { id: "dom", name: "Dominadas", sets: [set(0, 10)], kind: "bodyweight" }]),
      workout("w2", "2026-10-02", [{ id: "sent", name: "Sentadilla", sets: [set(120, 3)] }, { id: "pm", name: "Peso muerto", sets: [set(140, 3)] }, { id: "rem", name: "Remo", sets: [set(60, 8)] }]),
    ],
  });
  const byKey = Object.fromEntries(stats.map((s) => [s.key, s]));

  it("km y carreras del mes en curso (no del anterior)", () => {
    expect(byKey.kmMonth).toMatchObject({ value: "15,2", unit: "km" });
    expect(byKey.runsMonth.value).toBe("2");
  });

  it("entrenos de la semana y del mes, y racha de días seguidos", () => {
    expect(byKey.workoutsWeek.value).toBe("1");
    expect(byKey.workoutsMonth.value).toBe("2");
    expect(byKey.streak).toMatchObject({ value: "3", unit: "días" });
  });

  it("récords de running con su fecha", () => {
    expect(byKey.pr5k).toMatchObject({ value: "25:00", detail: "21 oct" });
    expect(byKey.pr10k.label).toBe("Mejor 10K");
    expect(byKey.prHalf.label).toBe("Mejor media maratón");
    expect(byKey.longestRun).toMatchObject({ value: "21,2", detail: "28 sep" });
  });

  it("los 3 mejores 1RM, solo de ejercicios con peso", () => {
    const rms = stats.filter((s) => s.key.startsWith("best1rm"));
    expect(rms.map((s) => s.label)).toEqual(["1RM Peso muerto", "1RM Sentadilla", "1RM Press banca"]);
    expect(stats.some((s) => s.label.includes("Dominadas"))).toBe(false);
  });

  it("nunca incluye datos de salud y sin datos no inventa tarjetas", () => {
    expect(stats.every((s) => !/peso corporal|kcal|cintura/i.test(s.label))).toBe(true);
    expect(buildProfileStats({ today, activities: [], workouts: [] })).toEqual([]);
  });
});

describe("shouldUploadStats", () => {
  it("la primera vez sí; luego solo si cambió y han pasado 6 h", () => {
    const a = statsFingerprint([{ key: "kmMonth", label: "Km", value: "1" }]);
    const b = statsFingerprint([{ key: "kmMonth", label: "Km", value: "2" }]);
    expect(shouldUploadStats(null, a, 0)).toBe(true);
    expect(shouldUploadStats({ fingerprint: a, at: 0 }, a, STATS_UPLOAD_EVERY_MS * 10)).toBe(false);
    expect(shouldUploadStats({ fingerprint: a, at: 0 }, b, 1000)).toBe(false);
    expect(shouldUploadStats({ fingerprint: a, at: 0 }, b, STATS_UPLOAD_EVERY_MS)).toBe(true);
  });
});
