// DATOS DE EJEMPLO de fuerza para la fase de diseño: tus 6 rutinas y algunos entrenos
// pasados con una progresión realista (pesos inventados).
import { addDays, todayKey } from "@/domain/dates";
import {
  type Exercise,
  type Routine,
  type RoutineExercise,
  type SetLog,
  startWorkout,
  type Workout,
  routineExerciseFor,
  newSet,
} from "@/domain/strength";
import { CATALOG, CATALOG_BY_ID } from "./exerciseCatalog";

function re(
  id: string,
  working: number,
  repMin: number,
  repMax: number,
  opts: { warmups?: number; restS?: number; superset?: string; note?: string } = {},
): RoutineExercise {
  const ex = CATALOG_BY_ID.get(id);
  if (!ex) throw new Error(`Ejercicio de ejemplo desconocido: ${id}`);
  const base = routineExerciseFor(ex, working, repMin, repMax, opts.warmups ?? 0);
  return { ...base, restS: opts.restS ?? base.restS, supersetId: opts.superset, note: opts.note };
}

export const SEED_ROUTINES: Routine[] = [
  {
    id: "rt-pecho",
    name: "Pecho",
    folder: "Mi semana",
    exercises: [
      re("Barbell_Bench_Press_-_Medium_Grip", 4, 6, 10, { warmups: 1, restS: 180 }),
      re("Incline_Dumbbell_Press", 3, 8, 12),
      re("Leverage_Chest_Press", 3, 10, 12),
      re("Cable_Crossover", 3, 12, 15),
    ],
  },
  {
    id: "rt-espalda",
    name: "Espalda",
    folder: "Mi semana",
    exercises: [
      re("Pullups", 4, 6, 10, { restS: 150 }),
      re("Bent_Over_Barbell_Row", 4, 8, 10, { warmups: 1, restS: 150 }),
      re("Wide-Grip_Lat_Pulldown", 3, 10, 12),
      re("Seated_Cable_Rows", 3, 10, 12),
      re("Face_Pull", 3, 12, 15),
    ],
  },
  {
    id: "rt-biceps",
    name: "Bíceps",
    folder: "Mi semana",
    exercises: [
      re("Close-Grip_EZ_Bar_Curl", 4, 8, 12),
      re("Hammer_Curls", 3, 10, 12, { superset: "ss-b" }),
      re("Preacher_Curl", 3, 10, 12, { superset: "ss-b" }),
      re("Standing_Biceps_Cable_Curl", 3, 12, 15),
    ],
  },
  {
    id: "rt-triceps",
    name: "Tríceps",
    folder: "Mi semana",
    exercises: [
      re("Close-Grip_Barbell_Bench_Press", 3, 8, 10, { restS: 150 }),
      re("Triceps_Pushdown_-_Rope_Attachment", 3, 10, 12),
      re("EZ-Bar_Skullcrusher", 3, 10, 12),
      re("Cable_Rope_Overhead_Triceps_Extension", 3, 12, 15),
      re("Bench_Dips", 2, 12, 15),
    ],
  },
  {
    id: "rt-pierna",
    name: "Pierna",
    folder: "Mi semana",
    exercises: [
      re("Barbell_Squat", 4, 6, 10, { warmups: 2, restS: 180 }),
      re("Leg_Press", 3, 10, 12, { restS: 150 }),
      re("Romanian_Deadlift", 3, 8, 10, { restS: 150 }),
      re("Leg_Extensions", 3, 12, 15),
      re("Lying_Leg_Curls", 3, 10, 12),
      re("Standing_Calf_Raises", 4, 12, 15, { restS: 60 }),
    ],
  },
  {
    id: "rt-core",
    name: "Core",
    folder: "Mi semana",
    exercises: [
      re("Cable_Crunch", 3, 12, 15),
      re("Hanging_Leg_Raise", 3, 10, 15),
      re("Ab_Roller", 3, 8, 12),
      re("Russian_Twist", 3, 20, 20),
      re("Plank", 3, 45, 60, { restS: 45 }),
    ],
  },
];

type Trip = [kg: number, reps: number, rpe?: number];
interface Spec {
  id: string;
  warm?: Trip;
  sets: Trip[];
  drops?: Trip[];
}

function done(type: SetLog["type"], t: Trip, at: string): SetLog {
  return { ...newSet(type, t[0], t[1]), rpe: t[2] ?? null, done: true, completedAt: at };
}

function hist(daysAgo: number, routineId: string, specs: Spec[], today: string, library: readonly Exercise[]): Workout {
  const routine = SEED_ROUTINES.find((r) => r.id === routineId) as Routine;
  const date = addDays(today, -daysAgo);
  const start = new Date(`${date}T18:00:00`);
  const w = startWorkout(routine, library, start, date);
  for (const sp of specs) {
    const e = w.exercises.find((x) => x.exerciseId === sp.id);
    if (!e) continue;
    const at = start.toISOString();
    e.sets = [
      ...(sp.warm ? [done("warmup", sp.warm, at)] : []),
      ...sp.sets.map((t) => done("normal", t, at)),
      ...(sp.drops ?? []).map((t) => done("drop", t, at)),
    ];
  }
  w.exercises = w.exercises.filter((e) => e.sets.some((s) => s.done));
  w.endedAt = new Date(start.getTime() + 62 * 60000).toISOString();
  return w;
}

export function seedWorkouts(today: string = todayKey(), library: readonly Exercise[] = CATALOG): Workout[] {
  const H = (d: number, r: string, s: Spec[]) => hist(d, r, s, today, library);
  return [
    // Pecho: progresión en 3 semanas (la máquina ya llegó al máximo del rango → sugiere subir)
    H(16, "rt-pecho", [
      { id: "Barbell_Bench_Press_-_Medium_Grip", warm: [40, 8], sets: [[70, 8, 8], [70, 8, 8], [70, 7, 9], [70, 6, 9.5]] },
      { id: "Incline_Dumbbell_Press", sets: [[26, 10], [26, 9], [26, 8]] },
      { id: "Leverage_Chest_Press", sets: [[45, 11], [45, 10], [45, 10]] },
      { id: "Cable_Crossover", sets: [[15, 15], [15, 13], [15, 12]] },
    ]),
    H(9, "rt-pecho", [
      { id: "Barbell_Bench_Press_-_Medium_Grip", warm: [40, 8], sets: [[72.5, 8, 8], [72.5, 8, 8.5], [72.5, 7, 9], [72.5, 7, 9.5]] },
      { id: "Incline_Dumbbell_Press", sets: [[26, 11], [26, 10], [26, 9]] },
      { id: "Leverage_Chest_Press", sets: [[50, 11], [50, 11], [50, 10]] },
      { id: "Cable_Crossover", sets: [[15, 15], [15, 14], [15, 13]] },
    ]),
    H(2, "rt-pecho", [
      { id: "Barbell_Bench_Press_-_Medium_Grip", warm: [45, 8], sets: [[72.5, 9, 8], [72.5, 9, 8], [72.5, 8, 9], [72.5, 8, 9.5]] },
      { id: "Incline_Dumbbell_Press", sets: [[26, 12], [26, 11], [26, 10]] },
      { id: "Leverage_Chest_Press", sets: [[50, 12, 7], [50, 12, 7], [50, 12, 7.5]] },
      { id: "Cable_Crossover", sets: [[15, 15], [15, 15], [15, 14]] },
    ]),
    // Espalda
    H(10, "rt-espalda", [
      { id: "Pullups", sets: [[0, 8], [0, 7], [0, 6], [0, 6]] },
      { id: "Bent_Over_Barbell_Row", warm: [40, 8], sets: [[60, 10], [60, 9], [60, 9], [60, 8]] },
      { id: "Wide-Grip_Lat_Pulldown", sets: [[55, 11], [55, 10], [55, 10]] },
      { id: "Seated_Cable_Rows", sets: [[50, 12], [50, 11], [50, 10]] },
      { id: "Face_Pull", sets: [[20, 15], [20, 14], [20, 12]] },
    ]),
    H(3, "rt-espalda", [
      { id: "Pullups", sets: [[0, 9], [0, 8], [0, 7], [0, 6]] },
      { id: "Bent_Over_Barbell_Row", warm: [40, 8], sets: [[62.5, 10], [62.5, 10], [62.5, 9], [62.5, 9]] },
      { id: "Wide-Grip_Lat_Pulldown", sets: [[57.5, 12], [57.5, 11], [57.5, 10]] },
      { id: "Seated_Cable_Rows", sets: [[52.5, 12], [52.5, 12], [52.5, 11]] },
      { id: "Face_Pull", sets: [[20, 15], [20, 15], [20, 14]] },
    ]),
    // Pierna
    H(12, "rt-pierna", [
      { id: "Barbell_Squat", warm: [40, 8], sets: [[80, 8], [80, 8], [80, 7], [80, 6]] },
      { id: "Leg_Press", sets: [[140, 12], [140, 11], [140, 10]] },
      { id: "Romanian_Deadlift", sets: [[70, 10], [70, 9], [70, 8]] },
      { id: "Leg_Extensions", sets: [[45, 15], [45, 14], [45, 12]] },
      { id: "Lying_Leg_Curls", sets: [[40, 11], [40, 10], [40, 10]] },
      { id: "Standing_Calf_Raises", sets: [[60, 15], [60, 14], [60, 14], [60, 12]] },
    ]),
    H(5, "rt-pierna", [
      { id: "Barbell_Squat", warm: [40, 8], sets: [[82.5, 8], [82.5, 8], [82.5, 7], [82.5, 7]] },
      { id: "Leg_Press", sets: [[145, 12], [145, 12], [145, 11]] },
      { id: "Romanian_Deadlift", sets: [[72.5, 10], [72.5, 9], [72.5, 9]] },
      { id: "Leg_Extensions", sets: [[47.5, 15], [47.5, 14], [47.5, 13]] },
      { id: "Lying_Leg_Curls", sets: [[42.5, 11], [42.5, 10], [42.5, 10]] },
      { id: "Standing_Calf_Raises", sets: [[62.5, 15], [62.5, 15], [62.5, 14], [62.5, 13]] },
    ]),
    // Bíceps (con drop en la última serie del curl con barra Z)
    H(1, "rt-biceps", [
      { id: "Close-Grip_EZ_Bar_Curl", sets: [[30, 10], [30, 9], [30, 9], [30, 8]], drops: [[22.5, 8]] },
      { id: "Hammer_Curls", sets: [[14, 12], [14, 11], [14, 10]] },
      { id: "Preacher_Curl", sets: [[25, 11], [25, 10], [25, 9]] },
      { id: "Standing_Biceps_Cable_Curl", sets: [[20, 14], [20, 13], [20, 12]] },
    ]),
    // Tríceps
    H(4, "rt-triceps", [
      { id: "Close-Grip_Barbell_Bench_Press", sets: [[55, 10], [55, 9], [55, 8]] },
      { id: "Triceps_Pushdown_-_Rope_Attachment", sets: [[30, 12], [30, 11], [30, 10]] },
      { id: "EZ-Bar_Skullcrusher", sets: [[25, 12], [25, 11], [25, 10]] },
      { id: "Cable_Rope_Overhead_Triceps_Extension", sets: [[22.5, 14], [22.5, 13], [22.5, 12]] },
      { id: "Bench_Dips", sets: [[0, 15], [0, 13]] },
    ]),
    // Core
    H(6, "rt-core", [
      { id: "Cable_Crunch", sets: [[40, 15], [40, 14], [40, 12]] },
      { id: "Hanging_Leg_Raise", sets: [[0, 12], [0, 11], [0, 10]] },
      { id: "Plank", sets: [[0, 50], [0, 45], [0, 40]] },
    ]),
  ];
}
