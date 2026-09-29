// Dominio de fuerza (gimnasio): ejercicios, rutinas, entrenos, series, sobrecarga
// progresiva, récords, descanso, superseries y calculadoras. Puro (sin React Native).
import { fmtKg, fmtNum } from "./format";
import { makeId, moveItem } from "./running";

export { moveItem };

// ------------------------------------------------------------------ Catálogo

/** Músculos con la misma taxonomía que free-exercise-db. */
export type Muscle =
  | "chest"
  | "lats"
  | "middleBack"
  | "lowerBack"
  | "traps"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "forearms"
  | "abs"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "adductors"
  | "abductors"
  | "neck";

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: "Pecho",
  lats: "Dorsales",
  middleBack: "Espalda media",
  lowerBack: "Lumbar",
  traps: "Trapecio",
  shoulders: "Hombros",
  biceps: "Bíceps",
  triceps: "Tríceps",
  forearms: "Antebrazos",
  abs: "Abdominales",
  quads: "Cuádriceps",
  hamstrings: "Isquios",
  glutes: "Glúteos",
  calves: "Gemelos",
  adductors: "Aductores",
  abductors: "Abductores",
  neck: "Cuello",
};

/** Grupos que se ven en los filtros (los mismos de tus rutinas). */
export type MuscleGroup = "back" | "chest" | "shoulders" | "biceps" | "triceps" | "legs" | "core" | "other";

export const GROUP_LABEL: Record<MuscleGroup, string> = {
  back: "Espalda",
  chest: "Pecho",
  shoulders: "Hombros",
  biceps: "Bíceps",
  triceps: "Tríceps",
  legs: "Pierna",
  core: "Core",
  other: "Otros",
};

export const GROUP_ORDER: MuscleGroup[] = ["chest", "back", "shoulders", "biceps", "triceps", "legs", "core", "other"];

const GROUP_OF: Record<Muscle, MuscleGroup> = {
  chest: "chest",
  lats: "back",
  middleBack: "back",
  lowerBack: "back",
  traps: "back",
  shoulders: "shoulders",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "other",
  abs: "core",
  quads: "legs",
  hamstrings: "legs",
  glutes: "legs",
  calves: "legs",
  adductors: "legs",
  abductors: "legs",
  neck: "other",
};

export function groupOf(m: Muscle): MuscleGroup {
  return GROUP_OF[m];
}

export type Equipment = "barbell" | "dumbbell" | "machine" | "cable" | "bodyweight" | "kettlebell" | "bands" | "other";

export const EQUIPMENT_LABEL: Record<Equipment, string> = {
  barbell: "Barra",
  dumbbell: "Mancuernas",
  machine: "Máquina",
  cable: "Polea",
  bodyweight: "Peso corporal",
  kettlebell: "Kettlebell",
  bands: "Gomas",
  other: "Otro",
};

/** Cómo se registra: peso+reps, peso corporal (con lastre opcional) o duración. */
/** Equipamientos que se ofrecen como filtro (pestaña Ejercicios y selector de ejercicios). */
export const EQUIPMENT_FILTERS: Equipment[] = ["barbell", "dumbbell", "machine", "cable", "bodyweight"];

export type ExerciseKind = "weight_reps" | "bodyweight" | "duration";

export interface Exercise {
  id: string;
  name: string;
  /** Otros nombres para buscar (inglés, abreviaturas…). */
  aliases: string[];
  primary: Muscle[];
  secondary: Muscle[];
  equipment: Equipment;
  kind: ExerciseKind;
  /** Fotos (posición inicial y final): se alternan como un GIF. */
  frames?: string[];
  /** GIF animado (URL completa), cuando no hay fotos propias del ejercicio (ExerciseDB). */
  gif?: string;
  /**
   * Del catálogo, pero sin foto ni GIF en ninguna fuente: no sale en listas ni búsquedas; sigue
   * existiendo por id para rutinas y entrenos que ya lo usaran.
   */
  hidden?: boolean;
  /** Vídeo propio (tiene prioridad sobre las fotos). */
  video?: string;
  source: "catalog" | "own" | "custom";
  compound?: boolean;
  defaultRestS?: number;
  increment?: number;
}

export function defaultRestFor(ex: Pick<Exercise, "compound" | "defaultRestS">): number {
  return ex.defaultRestS ?? (ex.compound ? 150 : 75);
}

export function defaultIncrement(ex: Pick<Exercise, "equipment" | "increment" | "kind">): number {
  if (ex.increment) return ex.increment;
  if (ex.kind === "bodyweight") return 2.5;
  switch (ex.equipment) {
    case "dumbbell":
    case "kettlebell":
      return 2;
    default:
      return 2.5;
  }
}

// ------------------------------------------------------------------ Series

export type SetType = "warmup" | "normal" | "failure" | "drop";

export const SET_TYPE_LABEL: Record<SetType, string> = {
  warmup: "Calentamiento",
  normal: "Normal",
  failure: "Al fallo",
  drop: "Drop set",
};

export interface SetLog {
  id: string;
  type: SetType;
  kg: number | null;
  reps: number | null;
  /** Esfuerzo guardado como RPE (5–10); el RIR es 10 − RPE. */
  rpe: number | null;
  done: boolean;
  /** Descanso real (s) antes de esta serie. */
  restS?: number;
  completedAt?: string;
}

export function newSet(type: SetType = "normal", kg: number | null = null, reps: number | null = null): SetLog {
  return { id: makeId("set"), type, kg, reps, rpe: null, done: false };
}

export const isWorking = (s: SetLog) => s.type === "normal" || s.type === "failure";

export function rpeToRir(rpe: number): number {
  return Math.max(0, Math.round((10 - rpe) * 2) / 2);
}
export function rirToRpe(rir: number): number {
  return Math.min(10, Math.max(5, 10 - rir));
}
export const RPE_OPTIONS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
export const RIR_OPTIONS = [4, 3.5, 3, 2.5, 2, 1.5, 1, 0.5, 0];

export type EffortMode = "rir" | "rpe";

export function formatEffort(rpe: number | null, mode: EffortMode): string {
  if (rpe === null) return "–";
  return fmtNum(mode === "rpe" ? rpe : rpeToRir(rpe));
}

/** Una fila de drop pertenece a la serie no-drop anterior; nunca puede ir la primera ni tras un calentamiento. */
export function normalizeSets(sets: readonly SetLog[]): SetLog[] {
  const out: SetLog[] = [];
  for (const s of sets) {
    const prev = out[out.length - 1];
    const valid = prev && prev.type !== "warmup";
    out.push(s.type === "drop" && !valid ? { ...s, type: "normal" } : s);
  }
  return out;
}

export interface SetLabel {
  /** Lo que se ve en la columna «Serie»: 1, 2, 3… C (calentamiento) o D (drop). */
  label: string;
  /** Insignia de tipo: C = calentamiento, F = fallo, D = drop; las normales no llevan. */
  badge?: "C" | "F" | "D";
  /** Posición dentro de la cadena de drops (1, 2…); 0 si no es drop. */
  dropIndex: number;
}

/** Numeración: solo cuentan las series de trabajo (normal y fallo); C y D llevan su letra. */
export function setLabels(sets: readonly SetLog[]): SetLabel[] {
  let n = 0;
  let drop = 0;
  return sets.map((s) => {
    if (s.type === "warmup") {
      drop = 0;
      return { label: "C", badge: "C", dropIndex: 0 };
    }
    if (s.type === "drop") {
      drop += 1;
      return { label: "D", badge: "D", dropIndex: drop };
    }
    drop = 0;
    n += 1;
    return { label: String(n), badge: s.type === "failure" ? "F" : undefined, dropIndex: 0 };
  });
}

/** Índices [inicio, fin] de la cadena (serie + sus drops) a la que pertenece la fila `index`. */
export function chainRange(sets: readonly SetLog[], index: number): [number, number] {
  let start = index;
  while (start > 0 && sets[start].type === "drop") start -= 1;
  let end = start;
  while (end + 1 < sets.length && sets[end + 1].type === "drop") end += 1;
  return [start, end];
}

export function roundToStep(value: number, step: number): number {
  if (step <= 0) return value;
  return Math.round(value / step) * step;
}

/**
 * Añade un drop al final de la cadena de la serie `index`. El peso sale de la fila
 * anterior menos `pct` (20 % por defecto), redondeado al salto de la máquina; las repeticiones se
 * heredan (en un drop se baja el peso y se sigue con el mismo objetivo de reps; la persona las
 * ajusta si se queda corta antes de llegar).
 */
export function addDrop(sets: readonly SetLog[], index: number, step = 2.5, pct = 0.2): SetLog[] {
  const [, end] = chainRange(sets, index);
  const above = sets[end];
  const kg = above.kg !== null ? Math.max(step, roundToStep(above.kg * (1 - pct), step)) : null;
  const drop = newSet("drop", kg, above.reps);
  return [...sets.slice(0, end + 1), drop, ...sets.slice(end + 1)];
}

/** Quita una serie; si es una serie con drops, se van con ella. */
export function removeSet(sets: readonly SetLog[], index: number): SetLog[] {
  const s = sets[index];
  if (!s) return [...sets];
  if (s.type === "drop") return normalizeSets(sets.filter((_, i) => i !== index));
  const [, end] = chainRange(sets, index);
  return normalizeSets(sets.filter((_, i) => i < index || i > end));
}

export function changeSetType(sets: readonly SetLog[], index: number, type: SetType): SetLog[] {
  return normalizeSets(sets.map((s, i) => (i === index ? { ...s, type } : s)));
}

// ------------------------------------------------------------------ Rutinas y entrenos

export interface PlannedSet {
  type: "warmup" | "normal" | "failure";
  repMin: number;
  repMax: number;
}

export type ProgressionRule = "double" | "linear" | "off";

export const RULE_LABEL: Record<ProgressionRule, string> = {
  double: "Doble progresión",
  linear: "Lineal",
  off: "Sin sugerencias",
};

export interface RoutineExercise {
  id: string;
  exerciseId: string;
  sets: PlannedSet[];
  restS: number;
  rule: ProgressionRule;
  increment: number;
  supersetId?: string;
  note?: string;
}

export interface Routine {
  id: string;
  name: string;
  folder?: string;
  notes?: string;
  exercises: RoutineExercise[];
  /**
   * Rutina de un solo uso, hecha al vuelo con lo que se hizo en un entreno («Repetir»): nunca se
   * guarda ni sirve de referencia para proponer «Actualizar rutina» (ver `routineFromWorkout`).
   */
  adHoc?: true;
}

export interface WorkoutPlan {
  sets: PlannedSet[];
  restS: number;
  rule: ProgressionRule;
  increment: number;
}

export interface WorkoutExercise {
  id: string;
  exerciseId: string;
  /** Copias: renombrar o editar el ejercicio no cambia el historial. */
  name: string;
  primary: Muscle[];
  secondary: Muscle[];
  equipment: Equipment;
  kind: ExerciseKind;
  supersetId?: string;
  note?: string;
  sets: SetLog[];
  plan: WorkoutPlan;
  replacedFrom?: string;
}

export interface RoutineUpdate {
  changes: RoutineChanges;
  /** La rutina tal como quedaría si se aceptan los cambios. */
  proposed: Routine;
}

export interface Workout {
  id: string;
  name: string;
  /** YYYY-MM-DD del inicio. */
  date: string;
  startedAt: string;
  endedAt?: string;
  routineId?: string;
  /** Copia de la rutina tal como estaba al empezar. */
  routineSnapshot?: Routine;
  exercises: WorkoutExercise[];
  notes?: string;
  /** Cambios respecto a la rutina de origen (calculados al terminar, antes de descartar lo no hecho). */
  routineUpdate?: RoutineUpdate;
}

export function plannedSets(warmups: number, working: number, repMin: number, repMax: number): PlannedSet[] {
  return [
    ...Array.from({ length: warmups }, () => ({ type: "warmup" as const, repMin: 8, repMax: 12 })),
    ...Array.from({ length: working }, () => ({ type: "normal" as const, repMin, repMax })),
  ];
}

/** Tope de repeticiones (o segundos) por serie en el editor de rutinas. */
export const REP_LIMIT = 200;

/**
 * Valor escrito en «mín.» o «máx.» al salir del campo. Mientras se escribe no se toca nada: antes
 * cada tecla se aplicaba al momento y escribir «15» en el máximo pasaba por «1», que bajaba el
 * mínimo a 1 (quedaba 1–15, o 1–115 si el campo no se dejaba vaciar). Vacío o no válido: se queda
 * como estaba. El otro extremo solo se mueve si queda cruzado.
 */
export function commitRepRange(prev: { repMin: number; repMax: number }, field: "min" | "max", text: string): { repMin: number; repMax: number } {
  const v = Number(text.replace(",", ".").trim());
  if (text.trim() === "" || !Number.isFinite(v) || v <= 0) return prev;
  const n = Math.min(REP_LIMIT, Math.max(1, Math.round(v)));
  return field === "min" ? { repMin: n, repMax: Math.max(n, prev.repMax) } : { repMax: n, repMin: Math.min(n, prev.repMin) };
}

export function routineExerciseFor(ex: Exercise, working = 3, repMin = 8, repMax = 12, warmups = 0): RoutineExercise {
  return {
    id: makeId("re"),
    exerciseId: ex.id,
    sets: plannedSets(warmups, working, repMin, repMax),
    restS: defaultRestFor(ex),
    rule: "double",
    increment: defaultIncrement(ex),
  };
}

export function workoutExerciseFrom(ex: Exercise, re?: RoutineExercise): WorkoutExercise {
  const base = re ?? routineExerciseFor(ex);
  return {
    id: makeId("we"),
    exerciseId: ex.id,
    name: ex.name,
    primary: ex.primary,
    secondary: ex.secondary,
    equipment: ex.equipment,
    kind: ex.kind,
    supersetId: re?.supersetId,
    note: re?.note,
    sets: base.sets.map((p) => newSet(p.type)),
    plan: { sets: base.sets, restS: base.restS, rule: base.rule, increment: base.increment },
  };
}

/** Empieza un entrenamiento a partir de una rutina (o vacío). */
const WEEKDAY = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

export function startWorkout(
  routine: Routine | null,
  library: readonly Exercise[],
  now: Date,
  dateKey: string,
): Workout {
  const byId = new Map(library.map((e) => [e.id, e]));
  const exercises: WorkoutExercise[] = [];
  for (const re of routine?.exercises ?? []) {
    const ex = byId.get(re.exerciseId);
    if (ex) exercises.push(workoutExerciseFrom(ex, re));
  }
  return {
    id: makeId("wk"),
    // Sin rutina, con el día: antes todos se llamaban «Entrenamiento» y no se distinguían en el historial.
    name: routine?.name ?? `Entreno del ${WEEKDAY[now.getDay()]}`,
    date: dateKey,
    startedAt: now.toISOString(),
    routineId: routine?.id,
    // Sin foto de una rutina al vuelo: al terminar no hay nada que proponer actualizar.
    routineSnapshot: routine && !routine.adHoc ? structuredClone(routine) : undefined,
    exercises,
  };
}

/** Sustituye un ejercicio por otro conservando lo ya hecho: si tiene series hechas, se queda y se añade el nuevo detrás. */
export function replaceExercise(w: Workout, index: number, next: Exercise): Workout {
  const cur = w.exercises[index];
  if (!cur) return w;
  // El sustituto hereda el plan del que sustituye (series, rango, descanso, regla): antes volvía al
  // 3×8–12 con 75 s por defecto, y «Actualizar rutina» guardaba ese plan por defecto.
  const inherited: RoutineExercise = { ...routineExerciseFor(next), sets: cur.plan.sets, restS: cur.plan.restS, rule: cur.plan.rule };
  const replacement = { ...workoutExerciseFrom(next, inherited), replacedFrom: cur.exerciseId, supersetId: cur.supersetId };
  const hasDone = cur.sets.some((s) => s.done);
  if (!hasDone) {
    return { ...w, exercises: w.exercises.map((e, i) => (i === index ? replacement : e)) };
  }
  // Se conserva lo hecho; el pendiente pasa al ejercicio nuevo justo detrás.
  const kept: WorkoutExercise = { ...cur, sets: cur.sets.filter((s) => s.done), supersetId: undefined };
  const list = [...w.exercises];
  list.splice(index, 1, kept, { ...replacement, supersetId: undefined });
  return { ...w, exercises: list };
}

export function addExercise(w: Workout, ex: Exercise, afterIndex?: number, sets?: PlannedSet[]): Workout {
  const we = workoutExerciseFrom(ex);
  if (sets) {
    we.plan = { ...we.plan, sets };
    we.sets = sets.map((p) => newSet(p.type));
  }
  const list = [...w.exercises];
  list.splice(afterIndex === undefined ? list.length : afterIndex + 1, 0, we);
  return { ...w, exercises: list };
}

export function removeExercise(w: Workout, index: number): Workout {
  const list = w.exercises.filter((_, i) => i !== index);
  return { ...w, exercises: cleanSupersets(list) };
}

export interface FinishReport {
  workout: Workout;
  removedSets: number;
  removedExercises: number;
}

/** Si la última serie fue hace más de esto, el entreno se dejó abierto: no se cuenta el hueco. */
export const FORGOTTEN_GAP_MS = 45 * 60 * 1000;

/**
 * Fin del entreno: ahora, salvo que la última serie marcada fuera hace más de 45 min (se olvidó
 * pulsar «Terminar», o se retomó al día siguiente): entonces, la última serie + 2 min. Antes salían
 * entrenos de 14 horas en el historial, en el resumen y en lo que se le cuenta a la IA.
 */
export function plausibleEnd(w: Workout, now: Date): Date {
  const last = w.exercises
    .flatMap((e) => e.sets)
    .map((s) => (s.done && s.completedAt ? Date.parse(s.completedAt) : NaN))
    .filter((t) => Number.isFinite(t))
    .reduce((a, b) => Math.max(a, b), -Infinity);
  if (!Number.isFinite(last) || now.getTime() - last <= FORGOTTEN_GAP_MS) return now;
  return new Date(last + 2 * 60 * 1000);
}

/** Al terminar se quitan las series sin marcar y los ejercicios que se quedan vacíos. */
export function cleanupForFinish(w: Workout, now: Date): FinishReport {
  const routineUpdate = routineUpdateFor(w);
  let removedSets = 0;
  let removedExercises = 0;
  const exercises: WorkoutExercise[] = [];
  for (const e of w.exercises) {
    const kept = normalizeSets(e.sets.filter((s) => s.done));
    removedSets += e.sets.length - kept.length;
    if (kept.length === 0) {
      removedExercises += 1;
      continue;
    }
    exercises.push({ ...e, sets: kept });
  }
  return {
    workout: { ...w, exercises: cleanSupersets(exercises), endedAt: plausibleEnd(w, now).toISOString(), routineUpdate },
    removedSets,
    removedExercises,
  };
}

// ------------------------------------------------------------------ Superseries

/** Índices de los ejercicios de una superserie, en orden. */
export function supersetMembers(exercises: readonly { supersetId?: string }[], supersetId: string): number[] {
  return exercises.flatMap((e, i) => (e.supersetId === supersetId ? [i] : []));
}

/** «A1», «A2», «B1»… (la letra sigue el orden de aparición de cada superserie). */
export function supersetLabel(exercises: readonly { supersetId?: string }[], index: number): string | null {
  const id = exercises[index]?.supersetId;
  if (!id) return null;
  const ids: string[] = [];
  for (const e of exercises) if (e.supersetId && !ids.includes(e.supersetId)) ids.push(e.supersetId);
  const letter = String.fromCharCode(65 + ids.indexOf(id));
  return `${letter}${supersetMembers(exercises, id).indexOf(index) + 1}`;
}

/** Enlaza `b` con `a`: pasan a ser vecinos y comparten superserie. */
export function linkSuperset<T extends { id: string; supersetId?: string }>(exercises: readonly T[], a: number, b: number): T[] {
  if (a === b || !exercises[a] || !exercises[b]) return [...exercises];
  const id = exercises[a].supersetId ?? exercises[b].supersetId ?? makeId("ss");
  const list = exercises.map((e, i) => (i === a || i === b ? { ...e, supersetId: id } : e));
  const moving = list[b];
  const rest = list.filter((_, i) => i !== b);
  // Justo después del último miembro que ya estaba en el grupo de `a`.
  const lastOfGroup = Math.max(...rest.map((e, i) => (e.supersetId === id ? i : -1)));
  rest.splice(lastOfGroup + 1, 0, moving);
  return rest;
}

export function unlinkSuperset<T extends { supersetId?: string }>(exercises: readonly T[], index: number): T[] {
  return cleanSupersets(exercises.map((e, i) => (i === index ? { ...e, supersetId: undefined } : e)));
}

/** Una superserie con un solo miembro deja de serlo. */
export function cleanSupersets<T extends { supersetId?: string }>(exercises: readonly T[]): T[] {
  const count = new Map<string, number>();
  for (const e of exercises) if (e.supersetId) count.set(e.supersetId, (count.get(e.supersetId) ?? 0) + 1);
  return exercises.map((e) => (e.supersetId && (count.get(e.supersetId) ?? 0) < 2 ? { ...e, supersetId: undefined } : e));
}

// ------------------------------------------------------------------ Descanso

export interface RestTimer {
  startedAt: number;
  endsAt: number;
  totalS: number;
  /** Serie que lo ha disparado. */
  setId?: string;
}

export function startRest(nowMs: number, seconds: number, setId?: string): RestTimer {
  return { startedAt: nowMs, endsAt: nowMs + seconds * 1000, totalS: seconds, setId };
}

export function remainingS(t: RestTimer, nowMs: number): number {
  return Math.max(0, Math.ceil((t.endsAt - nowMs) / 1000));
}

export function isRestOver(t: RestTimer, nowMs: number): boolean {
  return nowMs >= t.endsAt;
}

/** Suma o resta segundos; nunca deja el total por debajo de 0. */
export function adjustRest(t: RestTimer, deltaS: number): RestTimer {
  const totalS = Math.max(0, t.totalS + deltaS);
  return { ...t, totalS, endsAt: t.startedAt + totalS * 1000 };
}

/** Segundos de descanso realmente tomados hasta `nowMs`. */
export function restTaken(t: RestTimer, nowMs: number): number {
  return Math.max(0, Math.round((nowMs - t.startedAt) / 1000));
}

export function restSecondsFor(plan: Pick<WorkoutPlan, "restS">, type: SetType): number {
  return type === "warmup" ? Math.min(45, plan.restS) : plan.restS;
}

export interface RestDecision {
  start: boolean;
  seconds: number;
  /** Ejercicio al que pasar a continuación (superseries). */
  advanceTo?: number;
}

/**
 * Qué pasa al marcar como hecha la serie `setIndex` del ejercicio `exIndex`:
 * - Si la siguiente fila es un drop → sin descanso (los drops son seguidos).
 * - En una superserie, salvo en el último ejercicio de la ronda → sin descanso y se pasa al siguiente.
 * - En cualquier otro caso → descanso del ejercicio.
 */
export function restDecision(exercises: readonly WorkoutExercise[], exIndex: number, setIndex: number): RestDecision {
  const ex = exercises[exIndex];
  const set = ex?.sets[setIndex];
  if (!ex || !set) return { start: false, seconds: 0 };
  const next = ex.sets[setIndex + 1];
  if (next && next.type === "drop") return { start: false, seconds: 0 };
  if (ex.supersetId) {
    const members = supersetMembers(exercises, ex.supersetId);
    const pos = members.indexOf(exIndex);
    // Solo cuentan los miembros a los que les queda alguna serie (sin contar la que se acaba de
    // marcar): con superseries desiguales (A1 con más series que A2) se saltaba a uno ya terminado
    // y nunca empezaba el descanso.
    const pending = (i: number) => exercises[i]!.sets.some((s, j) => !s.done && !(i === exIndex && j === setIndex));
    const nextInRound = members.slice(pos + 1).find(pending);
    if (pos >= 0 && nextInRound !== undefined) return { start: false, seconds: 0, advanceTo: nextInRound };
    const firstPending = members.find(pending);
    return { start: true, seconds: restSecondsFor(ex.plan, set.type), advanceTo: firstPending };
  }
  return { start: true, seconds: restSecondsFor(ex.plan, set.type) };
}

// ------------------------------------------------------------------ Estimaciones y récords

/** Por encima de estas repeticiones Epley sobreestima: esas series no cuentan para el 1RM ni sus récords. */
export const E1RM_MAX_REPS = 12;

/** 1RM estimado (Epley). Solo es fiable hasta ~12 repeticiones. */
export function e1rm(kg: number, reps: number): number {
  if (kg <= 0 || reps <= 0) return 0;
  return reps === 1 ? kg : Math.round(kg * (1 + reps / 30) * 10) / 10;
}

export interface SessionSets {
  date: string;
  sets: SetLog[];
}

export function setVolume(s: SetLog): number {
  return s.done && s.type !== "warmup" && s.kg !== null && s.reps !== null ? s.kg * s.reps : 0;
}

export function exerciseVolume(e: Pick<WorkoutExercise, "sets">): number {
  return e.sets.reduce((x, s) => x + setVolume(s), 0);
}

export interface WorkoutTotals {
  volume: number;
  workingSets: number;
  reps: number;
  exercises: number;
  durationS: number;
}

export function workoutTotals(w: Workout): WorkoutTotals {
  let volume = 0;
  let workingSets = 0;
  let reps = 0;
  for (const e of w.exercises) {
    for (const s of e.sets) {
      if (!s.done || s.type === "warmup") continue;
      // Un drop es continuación de la serie anterior, no una serie más; y en un ejercicio por
      // tiempo `reps` son segundos, no repeticiones.
      if (s.type !== "drop") workingSets += 1;
      if (e.kind !== "duration") reps += s.reps ?? 0;
      volume += setVolume(s);
    }
  }
  const end = w.endedAt ? new Date(w.endedAt).getTime() : Date.now();
  return {
    volume: Math.round(volume),
    workingSets,
    reps,
    exercises: w.exercises.filter((e) => e.sets.some((s) => s.done)).length,
    durationS: Math.max(0, Math.round((end - new Date(w.startedAt).getTime()) / 1000)),
  };
}

export interface Records {
  maxKg: number;
  bestE1rm: number;
  bestSetVolume: number;
  /** Mejor nº de repeticiones a cada peso. */
  repsAtKg: Record<string, number>;
}

const doneWork = (sets: readonly SetLog[]) => sets.filter((s) => s.done && s.type !== "warmup" && s.reps !== null && s.reps > 0);

/** Récords históricos de un ejercicio; `null` si no hay ninguna serie previa. */
export function recordsFrom(sessions: readonly SessionSets[]): Records | null {
  const all = sessions.flatMap((s) => doneWork(s.sets));
  if (all.length === 0) return null;
  const rec: Records = { maxKg: 0, bestE1rm: 0, bestSetVolume: 0, repsAtKg: {} };
  for (const s of all) {
    const kg = s.kg ?? 0;
    const reps = s.reps as number;
    rec.maxKg = Math.max(rec.maxKg, kg);
    if (reps <= E1RM_MAX_REPS) rec.bestE1rm = Math.max(rec.bestE1rm, e1rm(kg, reps));
    rec.bestSetVolume = Math.max(rec.bestSetVolume, kg * reps);
    const k = String(kg);
    rec.repsAtKg[k] = Math.max(rec.repsAtKg[k] ?? 0, reps);
  }
  return rec;
}

export type PRType = "weight" | "e1rm" | "volume" | "reps";

export interface PR {
  type: PRType;
  setId: string;
  kg: number;
  reps: number;
  /** Valor nuevo y el que había. */
  value: number;
  previous: number;
}

export const PR_LABEL: Record<PRType, string> = {
  weight: "Peso máximo",
  e1rm: "1RM estimado",
  volume: "Mejor serie",
  reps: "Más repeticiones",
};

/** Récords batidos por las series de hoy (uno por tipo, con la mejor serie). Sin historial previo no hay récords. */
export function findPRs(current: readonly SetLog[], rec: Records | null): PR[] {
  if (!rec) return [];
  const best: Partial<Record<PRType, PR>> = {};
  const consider = (type: PRType, s: SetLog, value: number, previous: number) => {
    if (value <= previous + 1e-9) return;
    const cur = best[type];
    if (!cur || value > cur.value) best[type] = { type, setId: s.id, kg: s.kg ?? 0, reps: s.reps as number, value, previous };
  };
  for (const s of doneWork(current)) {
    const kg = s.kg ?? 0;
    const reps = s.reps as number;
    if (kg > 0) {
      consider("weight", s, kg, rec.maxKg);
      if (reps <= E1RM_MAX_REPS) consider("e1rm", s, e1rm(kg, reps), rec.bestE1rm);
      consider("volume", s, kg * reps, rec.bestSetVolume);
    }
    // Sin condición sobre `best.weight`: es del entreno entero, no de esta serie — con ella,
    // una serie que ya batió el peso máximo escondía el récord de repeticiones de CUALQUIER
    // otra serie posterior a otro peso distinto (encontrado con dos series reales: 105×1 nuevo
    // récord de peso, y 60×15 récord de repeticiones a 60 kg — solo se veía el primero).
    const prevReps = rec.repsAtKg[String(kg)];
    if (prevReps !== undefined) consider("reps", s, reps, prevReps);
  }
  return Object.values(best) as PR[];
}

// ------------------------------------------------------------------ Sobrecarga progresiva

export interface ProgressionConfig {
  rule: ProgressionRule;
  repMin: number;
  repMax: number;
  increment: number;
  plannedSets: number;
  kind: ExerciseKind;
}

export interface Suggestion {
  action: "start" | "increase" | "hold" | "deload" | "none";
  /** Valores propuestos por serie de trabajo, en orden. */
  perSet: { kg: number | null; reps: number | null }[];
  /** Explicación para enseñar al usuario. */
  reason: string;
}

const progressionSets = (sets: readonly SetLog[]) =>
  sets.filter((s) => s.done && isWorking(s) && s.reps !== null && s.reps > 0);

function modeKg(sets: readonly SetLog[]): number {
  const count = new Map<number, number>();
  for (const s of sets) count.set(s.kg ?? 0, (count.get(s.kg ?? 0) ?? 0) + 1);
  let best = 0;
  let bestN = -1;
  for (const [kg, n] of count) if (n > bestN || (n === bestN && kg > best)) [best, bestN] = [kg, n];
  return best;
}

const repsText = (sets: readonly SetLog[]) => sets.map((s) => s.reps).join("·");
const kgText = (kg: number) => `${fmtKg(kg)} kg`;

/** «12·12·11 con 60 kg», «50·45·40 s», «8·7·6 reps» según el tipo de ejercicio. */
function didText(sets: readonly SetLog[], ref: number, kind: ExerciseKind): string {
  if (kind === "duration") return `${repsText(sets)} s`;
  if (kind === "bodyweight" && ref === 0) return `${repsText(sets)} reps`;
  return `${repsText(sets)} con ${kgText(ref)}`;
}

function fill(n: number, kg: number | null, reps: number | null) {
  return Array.from({ length: Math.max(1, n) }, () => ({ kg, reps }));
}

/**
 * Sugerencia para la próxima vez que se hace el ejercicio. `history` va de la sesión
 * más reciente a la más antigua. Nunca es obligatoria y siempre explica su motivo.
 */
export function suggestNext(history: readonly SessionSets[], cfg: ProgressionConfig): Suggestion {
  const n = Math.max(1, cfg.plannedSets);
  const sessions = history.map((h) => progressionSets(h.sets)).filter((s) => s.length > 0);
  if (sessions.length === 0) {
    return {
      action: "start",
      perSet: fill(n, null, cfg.repMin),
      // El título («Primera vez») ya lo pone la pantalla: antes salía repetido dentro del texto.
      reason: `Elige un peso con el que llegues a ${cfg.repMin} ${cfg.repMin === 1 ? "repetición" : "repeticiones"} dejando 2 en reserva.`,
    };
  }
  const last = sessions[0];
  const ref = modeKg(last);

  if (cfg.rule === "off") {
    return {
      action: "none",
      perSet: Array.from({ length: n }, (_, i) => {
        const s = last[Math.min(i, last.length - 1)];
        return { kg: s.kg, reps: s.reps };
      }),
      reason: `La última vez: ${didText(last, ref, cfg.kind)}.`,
    };
  }

  const enough = last.length >= cfg.plannedSets;
  const allMax = enough && last.every((s) => (s.reps as number) >= cfg.repMax);
  const belowMin = (sets: readonly SetLog[]) => sets.some((s) => (s.reps as number) < cfg.repMin);

  const increase = (why: string): Suggestion => {
    if (cfg.kind === "duration") {
      // Sobre lo que de verdad se aguantó la última vez (antes, rango + 5 s para siempre).
      const best = Math.max(cfg.repMax, ...last.map((s) => (s.reps as number) ?? 0));
      const target = best + 5;
      return { action: "increase", perSet: fill(n, 0, target), reason: `${why} Pasa a ${target} segundos.` };
    }
    const next = ref + cfg.increment;
    const load = cfg.kind === "bodyweight" && ref === 0 ? `${fmtKg(cfg.increment)} kg de lastre` : kgText(next);
    return {
      action: "increase",
      perSet: fill(n, next, cfg.rule === "linear" ? cfg.repMax : cfg.repMin),
      reason: `${why} Sube a ${load} y busca ${cfg.rule === "linear" ? cfg.repMax : cfg.repMin} repeticiones.`,
    };
  };

  if (allMax) {
    return increase(`Hiciste ${didText(last, ref, cfg.kind)}, el máximo del rango.`);
  }

  // Autorregulación: todas las series con esfuerzo registrado y muy fácil (RPE ≤ 7) → hay margen.
  if (
    cfg.rule === "double" &&
    last.every((s) => s.rpe !== null && s.rpe <= 7) &&
    last.every((s) => (s.reps as number) >= cfg.repMin) &&
    enough
  ) {
    return increase(`Todas las series con RPE ≤ 7 (${didText(last, ref, cfg.kind)}): te sobra margen.`);
  }

  // Descarga: dos sesiones seguidas con alguna serie por debajo del mínimo al mismo peso.
  const prev = sessions[1];
  if (prev && belowMin(last) && belowMin(prev) && modeKg(prev) === ref && ref > 0) {
    const lower = Math.max(0, roundToStep(ref * 0.9, Math.min(cfg.increment, 2.5)));
    return {
      action: "deload",
      perSet: fill(n, lower, cfg.repMin),
      reason: `Llevas 2 sesiones sin llegar a ${cfg.repMin} repeticiones con ${kgText(ref)}: baja a ${kgText(lower)} y vuelve a subir.`,
    };
  }

  // Mantener: mismo peso y una repetición más por serie (tope: máximo del rango).
  const perSet = Array.from({ length: n }, (_, i) => {
    const s = last[Math.min(i, last.length - 1)];
    const reps = cfg.rule === "linear" ? cfg.repMax : Math.min(cfg.repMax, Math.max(cfg.repMin, (s.reps as number) + 1));
    return { kg: ref, reps };
  });
  return {
    action: "hold",
    perSet,
    reason:
      cfg.kind === "duration"
        ? `Hiciste ${didText(last, ref, cfg.kind)}: intenta aguantar unos segundos más por serie hasta ${cfg.repMax} s.`
        : cfg.kind === "bodyweight" && ref === 0
          ? `Hiciste ${didText(last, ref, cfg.kind)}: intenta una repetición más por serie hasta ${cfg.repMax}.`
          : `Hiciste ${didText(last, ref, cfg.kind)}: mismo peso, intenta una repetición más por serie hasta ${cfg.repMax}.`,
  };
}

/** Lo hecho la última vez, alineado por posición y tipo, para la columna «Anterior». */
export function previousFor(current: readonly SetLog[], last: readonly SetLog[] | undefined): (SetLog | null)[] {
  if (!last) return current.map(() => null);
  const pool: Record<string, SetLog[]> = { warmup: [], work: [], drop: [] };
  for (const s of last) if (s.done) pool[s.type === "warmup" ? "warmup" : s.type === "drop" ? "drop" : "work"].push(s);
  const used = { warmup: 0, work: 0, drop: 0 };
  return current.map((s) => {
    const key = s.type === "warmup" ? "warmup" : s.type === "drop" ? "drop" : "work";
    return pool[key][used[key]++] ?? null;
  });
}

// ------------------------------------------------------------------ Sustituciones

export function suggestSubstitutes(
  target: Pick<Exercise, "id" | "primary" | "secondary" | "equipment" | "kind">,
  all: readonly Exercise[],
  excludeIds: readonly string[] = [],
): Exercise[] {
  const scored = all
    .filter((e) => e.id !== target.id && !excludeIds.includes(e.id) && !e.hidden)
    .map((e) => {
      const primary = e.primary.filter((m) => target.primary.includes(m)).length;
      const secondary = e.secondary.filter((m) => target.secondary.includes(m) || target.primary.includes(m)).length;
      const score = primary * 10 + (e.equipment === target.equipment ? 4 : 0) + (e.kind === target.kind ? 2 : 0) + secondary;
      return { e, primary, score };
    })
    .filter((x) => x.primary > 0)
    .sort((a, b) => b.score - a.score || a.e.name.localeCompare(b.e.name, "es"));
  return scored.map((x) => x.e);
}

// ------------------------------------------------------------------ Calculadoras

export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];

/** Calentamiento: 50 % × 8, 70 % × 5, 85 % × 3 (redondeado al salto), sin repetir ni pasar del peso de trabajo. */
export function warmupSets(workKg: number, barKg = 20, step = 2.5): { kg: number; reps: number }[] {
  if (workKg <= 0 || workKg <= barKg) return [];
  const out: { kg: number; reps: number }[] = [];
  for (const [pct, reps] of [
    [0.5, 8],
    [0.7, 5],
    [0.85, 3],
  ] as const) {
    const kg = Math.max(barKg, roundToStep(workKg * pct, step));
    if (kg < workKg && !out.some((o) => o.kg === kg)) out.push({ kg, reps });
  }
  return out;
}

export interface PlateLoad {
  perSide: { kg: number; count: number }[];
  /** Peso que no se puede cargar con los discos disponibles. */
  remainder: number;
}

/** Discos por lado para un peso total con barra. */
export function platesPerSide(totalKg: number, barKg = 20, plates: readonly number[] = DEFAULT_PLATES): PlateLoad {
  let side = Math.max(0, (totalKg - barKg) / 2);
  const perSide: { kg: number; count: number }[] = [];
  for (const p of [...plates].sort((a, b) => b - a)) {
    const count = Math.floor(side / p + 1e-9);
    if (count > 0) {
      perSide.push({ kg: p, count });
      side -= count * p;
    }
  }
  return { perSide, remainder: Math.round(side * 2 * 100) / 100 };
}

// ------------------------------------------------------------------ Estadísticas y rutinas

/** Series por músculo (principal = 1, secundario = 0,5) de los entrenos de las fechas dadas. */
export function weeklySetsByMuscle(workouts: readonly Workout[], dates: readonly string[]): Partial<Record<Muscle, number>> {
  const out: Partial<Record<Muscle, number>> = {};
  for (const w of workouts) {
    if (!dates.includes(w.date)) continue;
    for (const e of w.exercises) {
      const n = e.sets.filter((s) => s.done && s.type !== "warmup" && s.type !== "drop").length;
      if (n === 0) continue;
      for (const m of e.primary) out[m] = (out[m] ?? 0) + n;
      for (const m of e.secondary) out[m] = (out[m] ?? 0) + n * 0.5;
    }
  }
  return out;
}

/** Rutina que hace más tiempo que no se entrena (o nunca): la de «hoy toca». */
export function nextSuggestedRoutine(routines: readonly Routine[], workouts: readonly Workout[]): Routine | null {
  if (routines.length === 0) return null;
  const last = new Map<string, string>();
  for (const w of workouts) {
    if (w.routineId && (!last.has(w.routineId) || w.date > (last.get(w.routineId) as string))) last.set(w.routineId, w.date);
  }
  return [...routines].sort((a, b) => (last.get(a.id) ?? "").localeCompare(last.get(b.id) ?? ""))[0];
}

export interface RoutineChanges {
  added: number;
  removed: number;
  replaced: number;
  reordered: boolean;
  any: boolean;
}

/** Diferencias entre el entreno y la rutina de la que salió (para ofrecer «actualizar la rutina»). */
export function changesVsRoutine(w: Workout): RoutineChanges | null {
  const snap = w.routineSnapshot;
  if (!snap) return null;
  const before = snap.exercises.map((e) => e.exerciseId);
  const after = w.exercises.map((e) => e.exerciseId);
  const replacedFrom = new Set(w.exercises.map((e) => e.replacedFrom).filter(Boolean) as string[]);
  const replaced = before.filter((id) => replacedFrom.has(id)).length;
  const added = after.filter((id) => !before.includes(id) && !w.exercises.find((e) => e.exerciseId === id)?.replacedFrom).length;
  const removed = before.filter((id) => !after.includes(id) && !replacedFrom.has(id)).length;
  const common = before.filter((id) => after.includes(id));
  const reordered = JSON.stringify(common) !== JSON.stringify(after.filter((id) => before.includes(id)));
  return { added, removed, replaced, reordered, any: added + removed + replaced > 0 || reordered };
}

/** Pasa a la rutina los cambios del entreno (ejercicios y su orden), conservando el plan de cada uno. */
export function applyWorkoutToRoutine(routine: Routine, w: Workout): Routine {
  const byExercise = new Map(routine.exercises.map((e) => [e.exerciseId, e]));
  // Lo que se sustituyó a mitad de ejercicio deja de estar en la rutina.
  const replacedAway = new Set(w.exercises.map((e) => e.replacedFrom).filter(Boolean) as string[]);
  const exercises: RoutineExercise[] = w.exercises.filter((we) => !replacedAway.has(we.exerciseId)).map((we) => {
    const existing = byExercise.get(we.exerciseId);
    if (existing) return { ...existing, supersetId: we.supersetId };
    return {
      id: makeId("re"),
      exerciseId: we.exerciseId,
      sets: we.plan.sets,
      restS: we.plan.restS,
      rule: we.plan.rule,
      increment: we.plan.increment,
      supersetId: we.supersetId,
    };
  });
  return { ...routine, exercises };
}

export function cloneRoutine(r: Routine): Routine {
  return {
    ...structuredClone(r),
    id: makeId("rt"),
    name: `${r.name} (copia)`,
    exercises: r.exercises.map((e) => ({ ...structuredClone(e), id: makeId("re") })),
  };
}

// ------------------------------------------------------------------ Historial por ejercicio

/**
 * Sesiones de un ejercicio, de la más reciente a la más antigua. Si un ejercicio aparece
 * dos veces en el mismo entreno se juntan sus series. `excludeWorkoutId` deja fuera el entreno en curso.
 */
export function historyFor(workouts: readonly Workout[], exerciseId: string, excludeWorkoutId?: string): SessionSets[] {
  return [...workouts]
    .filter((w) => w.id !== excludeWorkoutId)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .flatMap((w) => {
      const sets = w.exercises.filter((e) => e.exerciseId === exerciseId).flatMap((e) => e.sets);
      return sets.length > 0 ? [{ date: w.date, sets }] : [];
    });
}

/**
 * Una rutina al vuelo con los ejercicios y series de un entreno ya hecho (para «Repetir»).
 * Lleva el id de la rutina de origen (si la había) para que repetir cuente en «Hoy toca», pero va
 * marcada `adHoc`: antes, al terminar, se ofrecía «Actualizar rutina» comparando con esta copia, y
 * aceptarlo sustituía la rutina de verdad por solo lo hecho aquel día (series de menos, ejercicios
 * saltados perdidos).
 */
export function routineFromWorkout(w: Workout): Routine {
  return {
    id: w.routineId ?? makeId("rt"),
    adHoc: true,
    name: w.name,
    exercises: w.exercises.map((e) => ({
      id: makeId("re"),
      exerciseId: e.exerciseId,
      // Rango de las series de trabajo (antes el de la primera fila, que si era calentamiento daba 8–12).
      sets: e.sets.filter((s) => s.type !== "drop").map((s) => {
        const c = planCounts(e.plan.sets);
        return { type: s.type === "warmup" ? "warmup" : s.type === "failure" ? "failure" : "normal", repMin: c.repMin, repMax: c.repMax } as PlannedSet;
      }),
      restS: e.plan.restS,
      rule: e.plan.rule,
      increment: e.plan.increment,
      supersetId: e.supersetId,
      note: e.note,
    })),
  };
}

/** Mejor 1RM estimado de una lista de series (solo series de trabajo hechas). */
export function bestE1rm(sets: readonly SetLog[]): number {
  return Math.max(0, ...doneWork(sets).filter((s) => (s.reps as number) <= E1RM_MAX_REPS).map((s) => e1rm(s.kg ?? 0, s.reps as number)));
}

// ------------------------------------------------------------------ Plan de una rutina

export interface PlanCounts {
  warmups: number;
  working: number;
  repMin: number;
  repMax: number;
}

/** Resume las series planificadas de un ejercicio (para el editor). */
export function planCounts(sets: readonly PlannedSet[]): PlanCounts {
  const work = sets.filter((s) => s.type !== "warmup");
  const ref = work[work.length - 1] ?? sets[sets.length - 1];
  return {
    warmups: sets.filter((s) => s.type === "warmup").length,
    working: work.length,
    repMin: ref?.repMin ?? 8,
    repMax: ref?.repMax ?? 12,
  };
}

/** «4 × 6–10», «3 × 12», «1 cal. + 3 × 8–12». */
export function planSummary(sets: readonly PlannedSet[], kind: ExerciseKind = "weight_reps"): string {
  const { warmups, working, repMin, repMax } = planCounts(sets);
  const unit = kind === "duration" ? " s" : "";
  const range = repMin === repMax ? `${repMin}${unit}` : `${repMin}–${repMax}${unit}`;
  return `${warmups > 0 ? `${warmups} cal. + ` : ""}${working} × ${range}`;
}

export function restText(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}:00` : `${m}:${String(s).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ Valores sugeridos por fila

export interface Ghost {
  kg: number | null;
  reps: number | null;
}

/**
 * Valores en gris para cada fila (los que acepta el ✓ con un toque): los calentamientos salen
 * de la calculadora, las series de trabajo de la sobrecarga progresiva y los drops de la última vez.
 */
export function ghostsFor(
  sets: readonly SetLog[],
  suggestion: Suggestion,
  previous: readonly (SetLog | null)[],
  opts: { barKg?: number; step?: number; usesBar?: boolean } = {},
): (Ghost | null)[] {
  const refKg = suggestion.perSet[0]?.kg ?? null;
  const warm = refKg && refKg > 0 ? warmupSets(refKg, opts.usesBar === false ? 0 : (opts.barKg ?? 20), opts.step ?? 2.5) : [];
  let w = 0;
  let k = 0;
  return sets.map((s, i) => {
    const prev = previous[i];
    if (s.type === "warmup") {
      const g = warm[w++];
      if (g) return { kg: g.kg, reps: g.reps };
      return prev ? { kg: prev.kg, reps: prev.reps } : null;
    }
    if (s.type === "drop") return prev ? { kg: prev.kg, reps: prev.reps } : s.kg !== null ? { kg: s.kg, reps: null } : null;
    const p = suggestion.perSet[Math.min(k, suggestion.perSet.length - 1)];
    k += 1;
    return p ? { kg: p.kg, reps: p.reps } : null;
  });
}

/** ¿Se puede marcar esta fila como hecha? Faltan datos si no hay reps (ni sugeridas) ni, en ejercicios con peso, kilos. */
export function canComplete(set: SetLog, ghost: Ghost | null, kind: ExerciseKind): boolean {
  const reps = set.reps ?? ghost?.reps ?? null;
  if (reps === null || reps <= 0) return false;
  if (kind === "weight_reps") {
    const kg = set.kg ?? ghost?.kg ?? null;
    return kg !== null && kg >= 0;
  }
  return true;
}

export interface WorkoutPRs {
  exerciseId: string;
  name: string;
  prs: PR[];
}

/** Récords que batió un entreno frente a los entrenos anteriores a él (por fecha de inicio). */
export function workoutPRs(w: Workout, all: readonly Workout[]): WorkoutPRs[] {
  const before = all.filter((x) => x.id !== w.id && x.startedAt < w.startedAt);
  const out: WorkoutPRs[] = [];
  for (const e of w.exercises) {
    const rec = recordsFrom(historyFor(before, e.exerciseId));
    const sets = w.exercises.filter((x) => x.exerciseId === e.exerciseId).flatMap((x) => x.sets);
    const prs = findPRs(sets, rec);
    if (prs.length > 0 && !out.some((o) => o.exerciseId === e.exerciseId)) out.push({ exerciseId: e.exerciseId, name: e.name, prs });
  }
  return out;
}

/**
 * Cambios que merece la pena ofrecer para la rutina de origen. Saltarse un ejercicio (sin marcar
 * ninguna serie) NO es quitarlo: solo cuentan lo sustituido, lo añadido y hecho, lo quitado a propósito y el orden.
 */
export function routineUpdateFor(w: Workout): RoutineUpdate | undefined {
  const snap = w.routineSnapshot;
  if (!snap) return undefined;
  const planned = new Set(snap.exercises.map((e) => e.exerciseId));
  const structural: Workout = {
    ...w,
    exercises: w.exercises.filter((e) => planned.has(e.exerciseId) || !!e.replacedFrom || e.sets.some((s) => s.done)),
  };
  const changes = changesVsRoutine(structural);
  if (!changes?.any) return undefined;
  return { changes, proposed: applyWorkoutToRoutine(snap, structural) };
}
