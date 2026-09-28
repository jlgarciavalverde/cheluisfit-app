import { create } from "zustand";
import { persist } from "zustand/middleware";
import { guardedJSONStorage, guardRehydrate } from "./persistSafety";
import { toDateKey } from "@/domain/dates";
import {
  addDrop,
  addExercise,
  adjustRest,
  changeSetType,
  cleanupForFinish,
  type Exercise,
  type FinishReport,
  linkSuperset,
  moveItem,
  newSet,
  type RestDecision,
  type RestTimer,
  removeExercise,
  removeSet,
  replaceExercise,
  restDecision,
  type Routine,
  type SetLog,
  type SetType,
  startRest,
  startWorkout,
  unlinkSuperset,
  type Workout,
  type WorkoutExercise,
} from "@/domain/strength";

export interface ActiveState {
  workout: Workout | null;
  /** Ejercicio que se está viendo. */
  current: number;
  rest: RestTimer | null;
  /** Momento (ms) de la última serie marcada: sirve para registrar el descanso real. */
  lastSetAt: number | null;

  start: (routine: Routine | null, library: readonly Exercise[]) => void;
  discard: () => void;
  /**
   * Prepara el cierre (quita lo no hecho) sin tocar el entreno activo todavía — a propósito:
   * `cf_active_workout_v1` y `cf_strength_v1` son dos `persist` de AsyncStorage independientes,
   * sin transacción compartida. El llamador debe guardar el resultado en `cf_strength_v1`
   * primero y solo entonces llamar a `clearActive()`; si se vaciara aquí, un cierre de la app
   * justo entre las dos escrituras perdería el entreno entero (ya no estaría "en curso" para
   * retomarlo, y tampoco habría llegado al historial).
   */
  finish: () => FinishReport | null;
  /** Solo llamar tras guardar de verdad lo que devolvió `finish()` en `cf_strength_v1`. */
  clearActive: () => void;
  setCurrent: (i: number) => void;
  patchSet: (exIdx: number, setId: string, patch: Partial<SetLog>) => void;
  /** Marca una serie como hecha. `fill` rellena los campos vacíos con los valores sugeridos. */
  completeSet: (exIdx: number, setId: string, fill?: Partial<Pick<SetLog, "kg" | "reps" | "rpe">>) => RestDecision | null;
  uncompleteSet: (exIdx: number, setId: string) => void;
  addSet: (exIdx: number, type?: SetType) => void;
  /** Inserta series de calentamiento al principio (tras los calentamientos que ya hubiera). */
  addWarmups: (exIdx: number, list: { kg: number; reps: number }[]) => void;
  addDropAfter: (exIdx: number, setId: string) => void;
  removeSetAt: (exIdx: number, setId: string) => void;
  changeType: (exIdx: number, setId: string, type: SetType) => void;
  replace: (exIdx: number, ex: Exercise) => void;
  add: (ex: Exercise, afterIdx?: number) => void;
  removeAt: (exIdx: number) => void;
  move: (exIdx: number, delta: -1 | 1) => void;
  link: (exIdx: number, otherIdx: number) => void;
  unlink: (exIdx: number) => void;
  setNote: (exIdx: number, note: string) => void;
  setWorkoutName: (name: string) => void;
  adjustRestBy: (deltaS: number) => void;
  skipRest: () => void;
  startRestManually: (seconds: number) => void;
}

const MAX_REST_GAP_S = 30 * 60;

function mapEx(w: Workout, exIdx: number, fn: (e: WorkoutExercise) => WorkoutExercise): Workout {
  return { ...w, exercises: w.exercises.map((e, i) => (i === exIdx ? fn(e) : e)) };
}

export const useActiveWorkout = create<ActiveState>()(
  persist(
    (set, get) => ({
      workout: null,
      current: 0,
      rest: null,
      lastSetAt: null,

      start: (routine, library) => {
        const now = new Date();
        set({ workout: startWorkout(routine, library, now, toDateKey(now)), current: 0, rest: null, lastSetAt: null });
      },
      discard: () => set({ workout: null, current: 0, rest: null, lastSetAt: null }),
      finish: () => {
        const w = get().workout;
        if (!w) return null;
        return cleanupForFinish(w, new Date());
      },
      clearActive: () => set({ workout: null, current: 0, rest: null, lastSetAt: null }),
      setCurrent: (current) => set({ current }),

      patchSet: (exIdx, setId, patch) =>
        set((s) =>
          s.workout ? { workout: mapEx(s.workout, exIdx, (e) => ({ ...e, sets: e.sets.map((x) => (x.id === setId ? { ...x, ...patch } : x)) })) } : s,
        ),

      completeSet: (exIdx, setId, fill) => {
        const s = get();
        const w = s.workout;
        const ex = w?.exercises[exIdx];
        const setIdx = ex ? ex.sets.findIndex((x) => x.id === setId) : -1;
        if (!w || !ex || setIdx < 0) return null;
        const now = Date.now();
        const gap = s.lastSetAt ? Math.round((now - s.lastSetAt) / 1000) : undefined;
        const cur = ex.sets[setIdx];
        const next: SetLog = {
          ...cur,
          kg: cur.kg ?? fill?.kg ?? (ex.kind === "weight_reps" ? null : 0),
          reps: cur.reps ?? fill?.reps ?? null,
          rpe: cur.rpe ?? fill?.rpe ?? null,
          done: true,
          completedAt: new Date(now).toISOString(),
          restS: cur.type !== "drop" && gap !== undefined && gap > 0 && gap <= MAX_REST_GAP_S ? gap : undefined,
        };
        const workout = mapEx(w, exIdx, (e) => ({ ...e, sets: e.sets.map((x, i) => (i === setIdx ? next : x)) }));
        const decision = restDecision(workout.exercises, exIdx, setIdx);
        set({
          workout,
          lastSetAt: now,
          rest: decision.start ? startRest(now, decision.seconds, setId) : null,
          current: decision.advanceTo !== undefined && !decision.start ? decision.advanceTo : s.current,
        });
        return decision;
      },

      uncompleteSet: (exIdx, setId) =>
        set((s) => {
          if (!s.workout) return s;
          return {
            workout: mapEx(s.workout, exIdx, (e) => ({
              ...e,
              sets: e.sets.map((x) => (x.id === setId ? { ...x, done: false, completedAt: undefined, restS: undefined } : x)),
            })),
            rest: s.rest?.setId === setId ? null : s.rest,
          };
        }),

      addSet: (exIdx, type = "normal") =>
        set((s) => {
          if (!s.workout) return s;
          return {
            workout: mapEx(s.workout, exIdx, (e) => {
              const lastWork = [...e.sets].reverse().find((x) => x.type !== "warmup" && x.type !== "drop");
              const made = newSet(type === "drop" ? "normal" : type, type === "warmup" ? null : (lastWork?.kg ?? null));
              if (type === "warmup") {
                // Los calentamientos van antes de las series de trabajo.
                let at = 0;
                e.sets.forEach((x, i) => {
                  if (x.type === "warmup") at = i + 1;
                });
                return { ...e, sets: [...e.sets.slice(0, at), made, ...e.sets.slice(at)] };
              }
              return { ...e, sets: [...e.sets, made] };
            }),
          };
        }),

      addWarmups: (exIdx, list) =>
        set((s) => {
          if (!s.workout || list.length === 0) return s;
          return {
            workout: mapEx(s.workout, exIdx, (e) => {
              let at = 0;
              e.sets.forEach((x, i) => {
                if (x.type === "warmup") at = i + 1;
              });
              const made = list.map((w) => newSet("warmup", w.kg, w.reps));
              return { ...e, sets: [...e.sets.slice(0, at), ...made, ...e.sets.slice(at)] };
            }),
          };
        }),

      addDropAfter: (exIdx, setId) =>
        set((s) => {
          if (!s.workout) return s;
          return {
            workout: mapEx(s.workout, exIdx, (e) => {
              const i = e.sets.findIndex((x) => x.id === setId);
              return i < 0 ? e : { ...e, sets: addDrop(e.sets, i, e.plan.increment) };
            }),
          };
        }),

      removeSetAt: (exIdx, setId) =>
        set((s) => {
          if (!s.workout) return s;
          return {
            workout: mapEx(s.workout, exIdx, (e) => {
              const i = e.sets.findIndex((x) => x.id === setId);
              return i < 0 ? e : { ...e, sets: removeSet(e.sets, i) };
            }),
            rest: s.rest?.setId === setId ? null : s.rest,
          };
        }),

      changeType: (exIdx, setId, type) =>
        set((s) => {
          if (!s.workout) return s;
          return {
            workout: mapEx(s.workout, exIdx, (e) => {
              const i = e.sets.findIndex((x) => x.id === setId);
              return i < 0 ? e : { ...e, sets: changeSetType(e.sets, i, type) };
            }),
          };
        }),

      replace: (exIdx, ex) =>
        set((s) => (s.workout ? { workout: replaceExercise(s.workout, exIdx, ex) } : s)),

      add: (ex, afterIdx) =>
        set((s) => {
          if (!s.workout) return s;
          const workout = addExercise(s.workout, ex, afterIdx);
          return { workout, current: afterIdx === undefined ? workout.exercises.length - 1 : afterIdx + 1 };
        }),

      removeAt: (exIdx) =>
        set((s) => {
          if (!s.workout) return s;
          const workout = removeExercise(s.workout, exIdx);
          return { workout, current: Math.min(s.current, Math.max(0, workout.exercises.length - 1)) };
        }),

      move: (exIdx, delta) =>
        set((s) => {
          if (!s.workout) return s;
          const exercises = moveItem(s.workout.exercises, exIdx, delta);
          const moved = exIdx + delta >= 0 && exIdx + delta < exercises.length;
          return { workout: { ...s.workout, exercises }, current: moved && s.current === exIdx ? exIdx + delta : s.current };
        }),

      link: (exIdx, otherIdx) =>
        set((s) => (s.workout ? { workout: { ...s.workout, exercises: linkSuperset(s.workout.exercises, exIdx, otherIdx) } } : s)),
      unlink: (exIdx) =>
        set((s) => (s.workout ? { workout: { ...s.workout, exercises: unlinkSuperset(s.workout.exercises, exIdx) } } : s)),

      setNote: (exIdx, note) =>
        set((s) => (s.workout ? { workout: mapEx(s.workout, exIdx, (e) => ({ ...e, note: note || undefined })) } : s)),
      setWorkoutName: (name) => set((s) => (s.workout ? { workout: { ...s.workout, name } } : s)),

      adjustRestBy: (deltaS) => set((s) => (s.rest ? { rest: adjustRest(s.rest, deltaS) } : s)),
      skipRest: () => set({ rest: null }),
      startRestManually: (seconds) => set({ rest: startRest(Date.now(), seconds) }),
    }),
    {
      name: "cf_active_workout_v1",
      storage: guardedJSONStorage(),
      onRehydrateStorage: guardRehydrate("cf_active_workout_v1"),
      version: 1,
      // Sin `migrate`, subir `version` haría que zustand descartara lo guardado: se perdería un
      // entreno a medias. Al cambiar la forma, añadir aquí el paso concreto de esa versión.
      migrate: (persisted) => ({ workout: null, current: 0, rest: null, lastSetAt: null, ...(persisted as object) }) as ActiveState,
    },
  ),
);
