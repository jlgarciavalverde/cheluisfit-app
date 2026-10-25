import { describe, expect, it } from "vitest";
import { runAnalysisData, weekAnalysisData, weekKey, workoutAnalysisData } from "./analysis";
import type { Activity } from "./running";
import type { SetLog, Workout, WorkoutExercise } from "./strength";

const set = (kg: number, reps: number, extra: Partial<SetLog> = {}): SetLog => ({ id: `s${kg}-${reps}-${Math.random()}`, type: "normal", kg, reps, rpe: null, done: true, ...extra });

const squat = (sets: SetLog[]): WorkoutExercise => ({
  id: `we-${Math.random()}`,
  exerciseId: "sentadilla",
  name: "Sentadilla",
  primary: ["quads"],
  secondary: ["glutes"],
  equipment: "barbell",
  kind: "weight_reps",
  sets,
  plan: { sets: [{ type: "normal", repMin: 5, repMax: 5 }, { type: "normal", repMin: 5, repMax: 5 }, { type: "normal", repMin: 5, repMax: 5 }], restS: 180, rule: "linear", increment: 2.5 },
});

const workout = (id: string, date: string, ex: WorkoutExercise[], extra: Partial<Workout> = {}): Workout => ({
  id,
  name: "Pierna",
  date,
  startedAt: `${date}T18:00:00.000Z`,
  endedAt: `${date}T19:00:00.000Z`,
  routineId: "r-pierna",
  exercises: ex,
  ...extra,
});

describe("workoutAnalysisData", () => {
  const w1 = workout("w1", "2026-10-13", [squat([set(95, 5), set(95, 5), set(95, 5)])]);
  const w2 = workout("w2", "2026-10-17", [squat([set(97.5, 5), set(97.5, 5), set(97.5, 5)])]);
  const w3 = workout("w3", "2026-10-21", [squat([set(100, 5, { rpe: 8, restS: 170 }), set(100, 5, { restS: 190 }), set(100, 5), set(20, 10, { type: "warmup" })])], { notes: "Rodilla bien" });
  const text = workoutAnalysisData(w3, [w1, w2, w3], "rir");

  it("incluye totales, comparación con la sesión anterior de la rutina y notas", () => {
    expect(text).toContain("Entreno «Pierna» del 2026-10-21");
    expect(text).toContain("Última vez con la misma rutina (2026-10-17)");
    expect(text).toMatch(/volumen \+3 %/);
    expect(text).toContain("Notas de la persona: Rodilla bien");
  });

  it("detalla cada ejercicio: series de hoy (sin calentamiento), anterior, evolución del 1RM y descanso", () => {
    expect(text).toContain("hoy 100×5 (RIR 2), 100×5, 100×5;");
    expect(text).not.toContain("20×10");
    expect(text).toContain("anterior (2026-10-17): 97,5×5");
    expect(text).toMatch(/evolución del 1RM: [\d,]+ → [\d,]+ → [\d,]+/);
    expect(text).toContain("descanso medio 3:00");
  });

  it("señala los récords batidos y el volumen semanal por músculo", () => {
    expect(text).toContain("Récords batidos: Sentadilla");
    expect(text).toMatch(/Series por músculo en los 7 días hasta hoy.*Cuádriceps 6/);
  });

  it("sin historial: primera vez y sin récords", () => {
    const t = workoutAnalysisData(w1, [w1]);
    expect(t).toContain("Primera vez con esta rutina.");
    expect(t).toContain("primera vez");
    expect(t).toContain("Sin récords nuevos.");
  });
});

const run = (id: string, date: string, km: number, min: number, extra: Partial<Activity> = {}): Activity => ({
  id,
  date,
  type: "run",
  source: "garmin",
  title: "Rodaje",
  distanceM: km * 1000,
  durationS: min * 60,
  ...extra,
});

describe("runAnalysisData", () => {
  const prev = [run("a", "2026-10-10", 5, 30), run("b", "2026-10-14", 6, 36)];
  const today = run("c", "2026-10-21", 10, 55, {
    avgHr: 160,
    maxHr: 178,
    ascentM: 80,
    laps: [
      { index: 1, distanceM: 1000, durationS: 330 },
      { index: 2, distanceM: 1000, durationS: 325 },
      { index: 3, distanceM: 1000, durationS: 335, avgHr: 165 },
    ],
  });
  const text = runAnalysisData(today, [...prev, today], 190);

  it("incluye ritmo, FC con su zona, vueltas y regularidad", () => {
    expect(text).toContain("Carrera «Rodaje» del 2026-10-21: 10 km en 55:00, ritmo medio 5:30/km.");
    expect(text).toContain("FC media 160 ppm (zona 4 de 5");
    expect(text).toContain("desnivel +80 m");
    expect(text).toContain("Vueltas: 1 1 km a 5:30");
    expect(text).toMatch(/Regularidad: variación del ritmo entre vueltas ±\d+ s\/km/);
  });

  it("compara con las semanas y sesiones anteriores y detecta récords", () => {
    expect(text).toMatch(/Km por semana .*: .* · .* · .* · .* · /);
    expect(text).toContain("Media de las 2 sesiones parecidas");
    expect(text).toContain("Récords de esta sesión:");
    expect(text).toContain("Más larga");
  });
});

describe("weekAnalysisData", () => {
  it("junta fuerza, running y nutrición de la semana frente a la anterior", () => {
    const text = weekAnalysisData("2026-10-22", {
      workouts: [workout("w", "2026-10-21", [squat([set(100, 5)])]), workout("v", "2026-10-14", [squat([set(95, 5)])])],
      activities: [run("r", "2026-10-20", 8, 44), run("q", "2026-10-13", 5, 30)],
      entries: [{ id: "e", date: "2026-10-20", meal: "lunch", foodId: "f", name: "Arroz", grams: 200, nutrients: { kcal: 2100, protein: 140, carbs: 200, fat: 60, fiber: 0, sugars: 0, satFat: 0, salt: 0 } }],
      targetKcal: 2200,
      targetProtein: 150,
    });
    expect(text).toContain("Semana del 2026-10-19 al 2026-10-25.");
    expect(text).toContain("Fuerza: 1 entrenos (500 kg de volumen); semana anterior 1 (475 kg).");
    expect(text).toContain("Running: 1 carreras, 8 km; semana anterior 1 carreras, 5 km.");
    expect(text).toContain("Nutrición: 1 de 7 días registrados; media 2100 kcal (objetivo 2200)");
    expect(text).toContain("Días con entreno o actividad: 2 de 7.");
  });

  it("weekKey es el lunes", () => {
    expect(weekKey("2026-10-25")).toBe("2026-10-19");
    expect(weekKey("2026-10-19")).toBe("2026-10-19");
  });
});
