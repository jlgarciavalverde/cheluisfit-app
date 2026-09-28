import AsyncStorage from "@react-native-async-storage/async-storage";
import { useMemo } from "react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { todayKey } from "@/domain/dates";
import {
  cloneRoutine,
  DEFAULT_PLATES,
  type EffortMode,
  type Exercise,
  historyFor,
  type Routine,
  type SessionSets,
  type Workout,
} from "@/domain/strength";
import { CATALOG } from "./exerciseCatalog";
import { SEED_ROUTINES, seedWorkouts } from "./strengthSeed";

export interface StrengthState {
  routines: Routine[];
  /** Entrenos terminados. */
  workouts: Workout[];
  /** Ejercicios creados por el usuario (o con vídeo propio asignado). */
  custom: Exercise[];
  /** Vídeos propios por ejercicio del catálogo (id → URI). */
  videos: Record<string, string>;
  effortMode: EffortMode;
  barKg: number;
  plates: number[];

  saveRoutine: (r: Routine) => void;
  deleteRoutine: (id: string) => Routine | undefined;
  restoreRoutine: (r: Routine) => void;
  duplicateRoutine: (id: string) => Routine | undefined;
  addWorkout: (w: Workout) => void;
  updateWorkout: (w: Workout) => void;
  deleteWorkout: (id: string) => Workout | undefined;
  restoreWorkout: (w: Workout) => void;
  saveCustomExercise: (e: Exercise) => void;
  setVideo: (exerciseId: string, uri: string | null) => void;
  setEffortMode: (m: EffortMode) => void;
  setBar: (barKg: number, plates: number[]) => void;
  resetDemo: () => void;
  /** Vacía de verdad (sin rutinas/entrenos de ejemplo) — antes de sincronizar con una cuenta real. */
  startFresh: () => void;
}

const empty = () => ({
  routines: [] as Routine[],
  workouts: [] as Workout[],
  custom: [] as Exercise[],
  videos: {} as Record<string, string>,
  effortMode: "rir" as EffortMode,
  barKg: 20,
  plates: DEFAULT_PLATES,
});

const initial = () => ({
  routines: SEED_ROUTINES,
  workouts: seedWorkouts(todayKey()),
  custom: [] as Exercise[],
  videos: {} as Record<string, string>,
  effortMode: "rir" as EffortMode,
  barKg: 20,
  plates: DEFAULT_PLATES,
});

export const useStrength = create<StrengthState>()(
  persist(
    (set, get) => ({
      ...initial(),
      saveRoutine: (r) =>
        set((s) => ({
          routines: s.routines.some((x) => x.id === r.id) ? s.routines.map((x) => (x.id === r.id ? r : x)) : [...s.routines, r],
        })),
      deleteRoutine: (id) => {
        const found = get().routines.find((r) => r.id === id);
        if (found) set((s) => ({ routines: s.routines.filter((r) => r.id !== id) }));
        return found;
      },
      restoreRoutine: (r) => set((s) => ({ routines: [...s.routines, r] })),
      duplicateRoutine: (id) => {
        const src = get().routines.find((r) => r.id === id);
        if (!src) return undefined;
        const copy = cloneRoutine(src);
        set((s) => ({ routines: [...s.routines, copy] }));
        return copy;
      },
      addWorkout: (w) => set((s) => ({ workouts: [w, ...s.workouts.filter((x) => x.id !== w.id)] })),
      updateWorkout: (w) => set((s) => ({ workouts: s.workouts.map((x) => (x.id === w.id ? w : x)) })),
      deleteWorkout: (id) => {
        const found = get().workouts.find((w) => w.id === id);
        if (found) set((s) => ({ workouts: s.workouts.filter((w) => w.id !== id) }));
        return found;
      },
      restoreWorkout: (w) => set((s) => ({ workouts: [w, ...s.workouts] })),
      saveCustomExercise: (e) =>
        set((s) => ({ custom: s.custom.some((x) => x.id === e.id) ? s.custom.map((x) => (x.id === e.id ? e : x)) : [...s.custom, e] })),
      setVideo: (exerciseId, uri) =>
        set((s) => {
          const videos = { ...s.videos };
          if (uri) videos[exerciseId] = uri;
          else delete videos[exerciseId];
          return { videos };
        }),
      setEffortMode: (effortMode) => set({ effortMode }),
      setBar: (barKg, plates) => set({ barKg, plates }),
      resetDemo: () => set(initial()),
      startFresh: () => set(empty()),
    }),
    {
      name: "cf_strength_v1",
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      // Campos nuevos desde `empty()`, nunca desde `initial()` (metería rutinas de ejemplo).
      migrate: (persisted) => ({ ...empty(), ...(persisted as object) }) as StrengthState,
    },
  ),
);

/** Catálogo + ejercicios propios, con el vídeo propio asignado a cada uno. */
export function useLibrary(): Exercise[] {
  const custom = useStrength((s) => s.custom);
  const videos = useStrength((s) => s.videos);
  return useMemo(() => [...custom, ...CATALOG].map((e) => (videos[e.id] ? { ...e, video: videos[e.id] } : e)), [custom, videos]);
}

export function useExerciseHistory(exerciseId: string, excludeWorkoutId?: string): SessionSets[] {
  const workouts = useStrength((s) => s.workouts);
  return useMemo(() => historyFor(workouts, exerciseId, excludeWorkoutId), [workouts, exerciseId, excludeWorkoutId]);
}
