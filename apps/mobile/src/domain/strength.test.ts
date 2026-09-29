import { describe, expect, it } from "vitest";
import {
  addDrop,
  addExercise,
  adjustRest,
  applyWorkoutToRoutine,
  changeSetType,
  changesVsRoutine,
  chainRange,
  cleanupForFinish,
  cloneRoutine,
  defaultIncrement,
  defaultRestFor,
  e1rm,
  type Exercise,
  findPRs,
  historyFor,
  formatEffort,
  canComplete,
  ghostsFor,
  isRestOver,
  linkSuperset,
  newSet,
  nextSuggestedRoutine,
  normalizeSets,
  planCounts,
  planSummary,
  plannedSets,
  platesPerSide,
  restText,
  previousFor,
  recordsFrom,
  remainingS,
  removeExercise,
  removeSet,
  replaceExercise,
  restDecision,
  restSecondsFor,
  restTaken,
  rirToRpe,
  type Routine,
  routineExerciseFor,
  rpeToRir,
  type SessionSets,
  type SetLog,
  setLabels,
  startRest,
  startWorkout,
  suggestNext,
  suggestSubstitutes,
  workoutPRs,
  supersetLabel,
  supersetMembers,
  unlinkSuperset,
  warmupSets,
  weeklySetsByMuscle,
  type Workout,
  workoutExerciseFrom,
  workoutTotals,
} from "./strength";

const ex = (id: string, over: Partial<Exercise> = {}): Exercise => ({
  id,
  name: id,
  aliases: [],
  primary: ["chest"],
  secondary: ["triceps"],
  equipment: "barbell",
  kind: "weight_reps",
  source: "catalog",
  compound: true,
  ...over,
});

const done = (kg: number | null, reps: number | null, type: SetLog["type"] = "normal", rpe: number | null = null): SetLog => ({
  ...newSet(type, kg, reps),
  done: true,
  rpe,
});

const cfg = { rule: "double" as const, repMin: 8, repMax: 12, increment: 2.5, plannedSets: 3, kind: "weight_reps" as const };
const session = (date: string, ...sets: SetLog[]): SessionSets => ({ date, sets });

describe("series: tipos, etiquetas y drops", () => {
  it("numera solo las series de trabajo y da letra a C (calentamiento), F y D", () => {
    const sets = [newSet("warmup"), newSet("normal"), newSet("normal"), newSet("failure"), newSet("drop"), newSet("drop"), newSet("normal")];
    expect(setLabels(sets).map((l) => l.label)).toEqual(["C", "1", "2", "3", "D", "D", "4"]);
    expect(setLabels(sets).map((l) => l.badge)).toEqual(["C", undefined, undefined, "F", "D", "D", undefined]);
    expect(setLabels(sets).map((l) => l.dropIndex)).toEqual([0, 0, 0, 0, 1, 2, 0]);
  });

  it("un drop no puede ir el primero ni tras un calentamiento", () => {
    const sets = normalizeSets([newSet("drop"), newSet("warmup"), newSet("drop"), newSet("normal"), newSet("drop")]);
    expect(sets.map((s) => s.type)).toEqual(["normal", "warmup", "normal", "normal", "drop"]);
  });

  it("añade el drop al final de la cadena con −20 % redondeado al salto (60 → 47,5), heredando las reps", () => {
    const base = [{ ...newSet("normal", 60, 10), done: true }, newSet("normal", 60)];
    const withDrop = addDrop(base, 0);
    expect(withDrop.map((s) => s.type)).toEqual(["normal", "drop", "normal"]);
    expect(withDrop[1].kg).toBe(47.5);
    expect(withDrop[1].reps).toBe(10); // mismo objetivo de reps que la serie madre
    const chained = addDrop(withDrop, 0); // se encadena tras el primer drop: 47,5 × 0,8 = 38 → 37,5
    expect(chained.map((s) => s.type)).toEqual(["normal", "drop", "drop", "normal"]);
    expect(chained[2].kg).toBe(37.5);
  });

  it("caso del curl: 25 kg baja a 15 kg si se edita el drop", () => {
    const sets = addDrop([newSet("normal", 25, 10)], 0, 1);
    expect(sets[1].kg).toBe(20);
    expect({ ...sets[1], kg: 15 }.kg).toBe(15);
  });

  it("drop sin peso previo queda vacío; nunca baja del salto mínimo", () => {
    expect(addDrop([newSet("normal")], 0)[1].kg).toBeNull();
    expect(addDrop([newSet("normal", 2.5)], 0)[1].kg).toBe(2.5);
  });

  it("calcula el rango de la cadena desde cualquier fila", () => {
    const sets = [newSet("normal"), newSet("drop"), newSet("drop"), newSet("normal")];
    expect(chainRange(sets, 0)).toEqual([0, 2]);
    expect(chainRange(sets, 2)).toEqual([0, 2]);
    expect(chainRange(sets, 3)).toEqual([3, 3]);
  });

  it("quitar la serie se lleva sus drops; quitar un drop solo el drop", () => {
    const sets = [newSet("normal"), newSet("drop"), newSet("drop"), newSet("normal")];
    expect(removeSet(sets, 0)).toHaveLength(1);
    expect(removeSet(sets, 1).map((s) => s.type)).toEqual(["normal", "drop", "normal"]);
  });

  it("cambiar la serie madre a calentamiento convierte sus drops en normales", () => {
    const sets = changeSetType([newSet("normal"), newSet("drop")], 0, "warmup");
    expect(sets.map((s) => s.type)).toEqual(["warmup", "normal"]);
  });
});

describe("esfuerzo RIR | RPE", () => {
  it("son la misma escala", () => {
    expect(rpeToRir(9)).toBe(1);
    expect(rpeToRir(10)).toBe(0);
    expect(rpeToRir(7.5)).toBe(2.5);
    expect(rirToRpe(2)).toBe(8);
    expect(rirToRpe(0)).toBe(10);
    expect(rirToRpe(9)).toBe(5);
  });
  it("se muestra en la escala elegida", () => {
    expect(formatEffort(9, "rpe")).toBe("9");
    expect(formatEffort(9, "rir")).toBe("1");
    expect(formatEffort(8.5, "rir")).toBe("1,5");
    expect(formatEffort(null, "rir")).toBe("–");
  });
});

describe("sobrecarga progresiva: doble progresión", () => {
  it("primera vez: sin peso y con el mínimo del rango", () => {
    const s = suggestNext([], cfg);
    expect(s.action).toBe("start");
    expect(s.perSet).toHaveLength(3);
    expect(s.perSet[0]).toEqual({ kg: null, reps: 8 });
  });

  it("sube el peso cuando todas las series llegan al máximo", () => {
    const s = suggestNext([session("d1", done(60, 12), done(60, 12), done(60, 12))], cfg);
    expect(s.action).toBe("increase");
    expect(s.perSet.every((x) => x.kg === 62.5 && x.reps === 8)).toBe(true);
    expect(s.reason).toContain("62,5 kg");
    expect(s.reason).toContain("12·12·12");
  });

  it("mantiene el peso y pide una repetición más por serie (con tope)", () => {
    const s = suggestNext([session("d1", done(60, 12), done(60, 11), done(60, 9))], cfg);
    expect(s.action).toBe("hold");
    expect(s.perSet).toEqual([
      { kg: 60, reps: 12 },
      { kg: 60, reps: 12 },
      { kg: 60, reps: 10 },
    ]);
  });

  it("no cuenta calentamientos ni drops", () => {
    const s = suggestNext(
      [session("d1", done(30, 10, "warmup"), done(60, 12), done(60, 12), done(60, 12), done(45, 15, "drop"))],
      cfg,
    );
    expect(s.action).toBe("increase");
    expect(s.perSet[0].kg).toBe(62.5);
  });

  it("si hizo menos series de las planificadas no sube aunque lleguen al máximo", () => {
    const s = suggestNext([session("d1", done(60, 12), done(60, 12))], cfg);
    expect(s.action).toBe("hold");
  });

  it("descarga: dos sesiones seguidas por debajo del mínimo al mismo peso", () => {
    const s = suggestNext(
      [session("d2", done(60, 8), done(60, 7), done(60, 6)), session("d1", done(60, 8), done(60, 7), done(60, 7))],
      cfg,
    );
    expect(s.action).toBe("deload");
    expect(s.perSet[0]).toEqual({ kg: 55, reps: 8 }); // 60 × 0,9 = 54 → 55 (salto 2,5)
    expect(s.reason).toContain("2 sesiones");
  });

  it("una sola sesión mala no descarga", () => {
    const s = suggestNext([session("d2", done(60, 8), done(60, 7), done(60, 6)), session("d1", done(60, 12), done(60, 12), done(60, 12))], cfg);
    expect(s.action).toBe("hold");
  });

  it("guarda de esfuerzo: al fallo (RPE 10) sin llegar al máximo no sube", () => {
    const s = suggestNext([session("d1", done(60, 10, "normal", 10), done(60, 9, "normal", 10), done(60, 8, "normal", 10))], cfg);
    expect(s.action).toBe("hold");
  });

  it("autorregulación: todo con RPE ≤ 7 y sin llegar al máximo → sube", () => {
    const s = suggestNext([session("d1", done(60, 10, "normal", 7), done(60, 10, "normal", 6.5), done(60, 9, "normal", 7))], cfg);
    expect(s.action).toBe("increase");
    expect(s.reason).toContain("RPE ≤ 7");
  });

  it("peso corporal: progresa por repeticiones y luego propone lastre", () => {
    const bw = { ...cfg, kind: "bodyweight" as const, repMin: 6, repMax: 10 };
    const hold = suggestNext([session("d1", done(0, 8), done(0, 7), done(0, 6))], bw);
    expect(hold.action).toBe("hold");
    expect(hold.perSet[0]).toEqual({ kg: 0, reps: 9 });
    const up = suggestNext([session("d1", done(0, 10), done(0, 10), done(0, 10))], bw);
    expect(up.action).toBe("increase");
    expect(up.perSet[0].kg).toBe(2.5);
    expect(up.reason).toContain("lastre");
  });

  it("ejercicios de duración: hablan de segundos, sin kilos, y al llegar al máximo piden 5 s más", () => {
    const dur = { ...cfg, kind: "duration" as const, repMin: 45, repMax: 60 };
    const hold = suggestNext([session("d1", done(0, 50), done(0, 45), done(0, 40))], dur);
    expect(hold.reason).toContain("50·45·40 s");
    expect(hold.reason).not.toContain("kg");
    const up = suggestNext([session("d1", done(0, 60), done(0, 60), done(0, 60))], dur);
    expect(up.action).toBe("increase");
    expect(up.perSet[0]).toEqual({ kg: 0, reps: 65 });
    expect(up.reason).toContain("65 segundos");
  });

  it("peso corporal sin lastre no habla de «0 kg»", () => {
    const bw = { ...cfg, kind: "bodyweight" as const, repMin: 6, repMax: 10 };
    expect(suggestNext([session("d1", done(0, 8), done(0, 7), done(0, 6))], bw).reason).toContain("8·7·6 reps");
    expect(suggestNext([session("d1", done(0, 8), done(0, 7), done(0, 6))], { ...bw, rule: "off" }).reason).toContain("reps");
  });

  it("usa el peso más frecuente de las series de trabajo como referencia", () => {
    const s = suggestNext([session("d1", done(60, 12), done(60, 12), done(57.5, 12))], cfg);
    expect(s.action).toBe("increase");
    expect(s.perSet[0].kg).toBe(62.5);
  });
});

describe("sobrecarga progresiva: lineal y sin reglas", () => {
  const lin = { ...cfg, rule: "linear" as const, repMin: 5, repMax: 5, plannedSets: 5 };
  const five = (kg: number, ...reps: number[]) => session("d", ...reps.map((r) => done(kg, r)));

  it("sube cada sesión si completas todas las series", () => {
    const s = suggestNext([five(100, 5, 5, 5, 5, 5)], lin);
    expect(s.action).toBe("increase");
    expect(s.perSet[0]).toEqual({ kg: 102.5, reps: 5 });
  });

  it("mantiene si fallas una vez y descarga −10 % si fallas dos seguidas", () => {
    expect(suggestNext([five(100, 5, 5, 5, 4, 3)], lin).action).toBe("hold");
    const s = suggestNext([five(100, 5, 5, 5, 4, 3), five(100, 5, 5, 4, 4, 3)], { ...lin, repMin: 5 });
    expect(s.action).toBe("deload");
    expect(s.perSet[0].kg).toBe(90);
  });

  it("«sin sugerencias» copia lo de la última vez", () => {
    const s = suggestNext([session("d", done(80, 10), done(80, 9), done(80, 8))], { ...cfg, rule: "off" });
    expect(s.action).toBe("none");
    expect(s.perSet).toEqual([
      { kg: 80, reps: 10 },
      { kg: 80, reps: 9 },
      { kg: 80, reps: 8 },
    ]);
  });
});

describe("columna «Anterior»", () => {
  it("alinea por tipo y posición", () => {
    const last = [done(40, 10, "warmup"), done(60, 12), done(60, 11), done(45, 8, "drop")];
    const current = [newSet("warmup"), newSet("normal"), newSet("normal"), newSet("normal"), newSet("drop")];
    const prev = previousFor(current, last);
    expect(prev.map((p) => (p ? `${p.kg}×${p.reps}` : null))).toEqual(["40×10", "60×12", "60×11", null, "45×8"]);
    expect(previousFor(current, undefined).every((p) => p === null)).toBe(true);
  });
});

describe("1RM, récords y volumen", () => {
  it("estima el 1RM con Epley", () => {
    expect(e1rm(100, 1)).toBe(100);
    expect(e1rm(100, 10)).toBe(133.3);
    expect(e1rm(0, 10)).toBe(0);
  });

  it("detecta récords de peso, 1RM, serie y repeticiones", () => {
    const rec = recordsFrom([session("d1", done(60, 10), done(60, 8)), session("d0", done(50, 12))]);
    expect(rec).toMatchObject({ maxKg: 60, bestSetVolume: 600 });
    const today = [done(62.5, 8), done(60, 11)];
    const prs = findPRs(today, rec);
    const types = prs.map((p) => p.type).sort();
    expect(types).toContain("weight");
    expect(types).toContain("e1rm");
    expect(prs.find((p) => p.type === "weight")).toMatchObject({ kg: 62.5, previous: 60 });
  });

  it("no hay récords sin historial, ni con calentamientos, ni sin superar", () => {
    expect(findPRs([done(100, 5)], null)).toEqual([]);
    const rec = recordsFrom([session("d1", done(60, 10))]);
    expect(findPRs([done(100, 5, "warmup")], rec)).toEqual([]);
    expect(findPRs([done(60, 10), done(55, 10)], rec)).toEqual([]);
  });

  it("récord de repeticiones al mismo peso", () => {
    const rec = recordsFrom([session("d1", done(60, 8))]);
    expect(findPRs([done(60, 9)], rec).map((p) => p.type)).toContain("reps");
  });

  it("un récord de peso en una serie no esconde un récord de repeticiones de otra serie a otro peso", () => {
    // Antes: `!best.weight` era del entreno entero, no de la serie — la primera serie (105×1,
    // récord de peso) escondía el récord de repeticiones de la segunda (60×15, a un peso ya
    // levantado antes con menos repeticiones).
    const rec = recordsFrom([session("d1", done(100, 1), done(60, 12))]);
    const prs = findPRs([done(105, 1), done(60, 15)], rec);
    expect(prs.map((p) => p.type).sort()).toEqual(["e1rm", "reps", "volume", "weight"]);
    expect(prs.find((p) => p.type === "reps")).toMatchObject({ kg: 60, reps: 15, previous: 12 });
  });

  it("el peso corporal solo puede batir repeticiones", () => {
    const rec = recordsFrom([session("d1", done(0, 10))]);
    expect(findPRs([done(0, 12)], rec).map((p) => p.type)).toEqual(["reps"]);
  });

  it("volumen y totales del entreno", () => {
    const w = startWorkout(null, [], new Date("2026-09-21T10:00:00Z"), "2026-09-21");
    w.exercises = [
      { ...workoutExerciseFrom(ex("a")), sets: [done(40, 10, "warmup"), done(60, 10), done(60, 8), done(45, 12, "drop"), newSet("normal", 60, 8)] },
    ];
    w.endedAt = "2026-09-21T10:45:00Z";
    const t = workoutTotals(w);
    expect(t.volume).toBe(600 + 480 + 540); // sin calentamiento ni la serie sin marcar
    expect(t.workingSets).toBe(2); // el drop es continuación de la serie anterior, no una serie más
    expect(t.reps).toBe(30);
    expect(t.durationS).toBe(45 * 60);
  });
});

describe("descanso", () => {
  it("calcula el tiempo restante desde endsAt (sirve tras volver de segundo plano)", () => {
    const t = startRest(1_000_000, 90, "s1");
    expect(remainingS(t, 1_000_000)).toBe(90);
    expect(remainingS(t, 1_000_000 + 30_000)).toBe(60);
    expect(remainingS(t, 1_000_000 + 89_100)).toBe(1);
    expect(isRestOver(t, 1_000_000 + 90_000)).toBe(true);
    expect(remainingS(t, 1_000_000 + 500_000)).toBe(0);
  });

  it("±15 s mueve el final y nunca deja el total negativo", () => {
    const t = startRest(0, 90);
    expect(adjustRest(t, 15).endsAt).toBe(105_000);
    expect(adjustRest(t, -15).totalS).toBe(75);
    expect(adjustRest(t, -1000).totalS).toBe(0);
    expect(restTaken(t, 42_400)).toBe(42);
  });

  it("el calentamiento descansa como mucho 45 s", () => {
    expect(restSecondsFor({ restS: 180 }, "warmup")).toBe(45);
    expect(restSecondsFor({ restS: 30 }, "warmup")).toBe(30);
    expect(restSecondsFor({ restS: 180 }, "normal")).toBe(180);
    expect(defaultRestFor({ compound: true })).toBe(150);
    expect(defaultRestFor({ compound: false })).toBe(75);
    expect(defaultRestFor({ defaultRestS: 60, compound: true })).toBe(60);
  });
});

const mk = (id: string, sets: SetLog[], superset?: string) => ({ ...workoutExerciseFrom(ex(id)), sets, supersetId: superset });

describe("cuándo empieza el descanso", () => {
  it("una serie normal arranca el descanso del ejercicio", () => {
    const d = restDecision([mk("a", [newSet("normal"), newSet("normal")])], 0, 0);
    expect(d).toMatchObject({ start: true, seconds: 150 });
  });

  it("no arranca si la siguiente fila es un drop, sí al acabar la cadena", () => {
    const list = [mk("a", [newSet("normal"), newSet("drop"), newSet("drop"), newSet("normal")])];
    expect(restDecision(list, 0, 0).start).toBe(false);
    expect(restDecision(list, 0, 1).start).toBe(false);
    expect(restDecision(list, 0, 2).start).toBe(true);
  });

  it("superserie: sin descanso en A1 (y pasa a A2), descanso al terminar A2", () => {
    const list = [mk("a", [newSet("normal")], "ss1"), mk("b", [newSet("normal")], "ss1"), mk("c", [newSet("normal")])];
    expect(restDecision(list, 0, 0)).toEqual({ start: false, seconds: 0, advanceTo: 1 });
    expect(restDecision(list, 1, 0)).toMatchObject({ start: true, advanceTo: 0 });
    expect(restDecision(list, 2, 0)).toMatchObject({ start: true });
  });

  it("índices fuera de rango no rompen", () => {
    expect(restDecision([], 3, 3)).toEqual({ start: false, seconds: 0 });
  });
});

describe("superseries", () => {
  const base = () => [mk("a", []), mk("b", []), mk("c", []), mk("d", [])];

  it("enlaza dos ejercicios y los deja juntos", () => {
    const list = linkSuperset(base(), 0, 2);
    expect(list.map((e) => e.exerciseId)).toEqual(["a", "c", "b", "d"]);
    expect(list[0].supersetId).toBeTruthy();
    expect(list[0].supersetId).toBe(list[1].supersetId);
    expect(supersetLabel(list, 0)).toBe("A1");
    expect(supersetLabel(list, 1)).toBe("A2");
    expect(supersetLabel(list, 2)).toBeNull();
  });

  it("admite tres o más miembros", () => {
    let list = linkSuperset(base(), 0, 1);
    list = linkSuperset(list, 0, 3); // suma «d» a la superserie de «a»
    expect(list.map((e) => e.exerciseId)).toEqual(["a", "b", "d", "c"]);
    expect(supersetMembers(list, list[0].supersetId as string)).toEqual([0, 1, 2]);
    expect([0, 1, 2, 3].map((i) => supersetLabel(list, i))).toEqual(["A1", "A2", "A3", null]);
  });

  it("varias superseries reciben letras distintas por orden de aparición", () => {
    const both = linkSuperset(linkSuperset(base(), 2, 3), 0, 1);
    expect(new Set(both.map((e) => e.supersetId).filter(Boolean)).size).toBe(2);
    expect(both.map((_, i) => supersetLabel(both, i))).toEqual(["A1", "A2", "B1", "B2"]);
  });

  it("desenlazar deja el otro miembro suelto; quitar un ejercicio también", () => {
    const list = linkSuperset(base(), 0, 1);
    const un = unlinkSuperset(list, 0);
    expect(un.every((e) => !e.supersetId)).toBe(true);
    const w = { ...startWorkout(null, [], new Date(), "2026-09-21"), exercises: list };
    expect(removeExercise(w, 1).exercises.every((e) => !e.supersetId)).toBe(true);
  });
});

describe("entreno: sustituir, añadir y terminar", () => {
  const library = [ex("press-banca"), ex("press-mancuernas", { equipment: "dumbbell" }), ex("remo", { primary: ["lats"], secondary: ["biceps"] })];
  const routine: Routine = { id: "r1", name: "Pecho", exercises: [routineExerciseFor(library[0]), routineExerciseFor(library[2])] };

  it("empieza desde la rutina con una copia y sin series hechas", () => {
    const w = startWorkout(routine, library, new Date("2026-09-21T09:00:00Z"), "2026-09-21");
    expect(w.exercises.map((e) => e.exerciseId)).toEqual(["press-banca", "remo"]);
    expect(w.routineSnapshot).toEqual(routine);
    expect(w.routineSnapshot).not.toBe(routine);
    expect(w.exercises[0].sets.every((s) => !s.done)).toBe(true);
    expect(startWorkout(null, library, new Date(), "2026-09-21").exercises).toEqual([]);
  });

  it("sustituir un ejercicio sin series hechas lo cambia por completo", () => {
    const w = startWorkout(routine, library, new Date(), "2026-09-21");
    const r = replaceExercise(w, 0, library[1]);
    expect(r.exercises.map((e) => e.exerciseId)).toEqual(["press-mancuernas", "remo"]);
    expect(r.exercises[0].replacedFrom).toBe("press-banca");
  });

  it("si ya tiene series hechas, se conservan y el nuevo entra detrás", () => {
    const w = startWorkout(routine, library, new Date(), "2026-09-21");
    w.exercises[0].sets[0] = done(60, 10);
    const r = replaceExercise(w, 0, library[1]);
    expect(r.exercises.map((e) => e.exerciseId)).toEqual(["press-banca", "press-mancuernas", "remo"]);
    expect(r.exercises[0].sets).toHaveLength(1);
    expect(r.exercises[1].replacedFrom).toBe("press-banca");
  });

  it("añade un olvidado al final o tras un ejercicio", () => {
    const w = startWorkout(routine, library, new Date(), "2026-09-21");
    expect(addExercise(w, library[1]).exercises.map((e) => e.exerciseId)).toEqual(["press-banca", "remo", "press-mancuernas"]);
    expect(addExercise(w, library[1], 0).exercises.map((e) => e.exerciseId)).toEqual(["press-banca", "press-mancuernas", "remo"]);
  });

  it("al terminar quita series sin marcar y ejercicios vacíos", () => {
    const w = startWorkout(routine, library, new Date(), "2026-09-21");
    w.exercises[0].sets = [done(60, 10), newSet("normal"), newSet("drop")];
    const { workout, removedSets, removedExercises } = cleanupForFinish(w, new Date("2026-09-21T10:00:00Z"));
    expect(workout.exercises).toHaveLength(1);
    expect(workout.exercises[0].sets).toHaveLength(1);
    expect(removedExercises).toBe(1);
    expect(removedSets).toBe(2 + w.exercises[1].sets.length);
    expect(workout.endedAt).toBe("2026-09-21T10:00:00.000Z");
  });

  it("detecta cambios frente a la rutina y los aplica", () => {
    let w = startWorkout(routine, library, new Date(), "2026-09-21");
    expect(changesVsRoutine(w)?.any).toBe(false);
    w = replaceExercise(w, 0, library[1]);
    expect(changesVsRoutine(w)).toMatchObject({ replaced: 1, added: 0, removed: 0, any: true });
    w = addExercise(w, ex("fondos", { primary: ["triceps"], secondary: [] }));
    expect(changesVsRoutine(w)).toMatchObject({ replaced: 1, added: 1 });
    const updated = applyWorkoutToRoutine(routine, w);
    expect(updated.exercises.map((e) => e.exerciseId)).toEqual(["press-mancuernas", "remo", "fondos"]);
    expect(updated.exercises[1].id).toBe(routine.exercises[1].id); // conserva el plan del que ya estaba
    expect(changesVsRoutine({ ...w, routineSnapshot: undefined })).toBeNull();
  });

  it("saltarse un ejercicio no es quitarlo: no se ofrece borrarlo de la rutina", () => {
    const w = startWorkout(routine, library, new Date(), "2026-09-21");
    w.exercises[0].sets[0] = done(60, 10); // solo se hace el primero
    const { workout } = cleanupForFinish(w, new Date());
    expect(workout.exercises).toHaveLength(1); // lo no hecho no se guarda…
    expect(workout.routineUpdate).toBeUndefined(); // …pero tampoco se propone quitarlo de la rutina
  });

  it("propone los cambios reales: sustituido y añadido con series hechas", () => {
    let w = startWorkout(routine, library, new Date(), "2026-09-21");
    w = replaceExercise(w, 1, library[1]); // sustituye «remo» (sin hacer)
    w.exercises[1].sets[0] = done(30, 12);
    w = addExercise(w, ex("fondos", { primary: ["triceps"], secondary: [] }));
    w.exercises[w.exercises.length - 1].sets[0] = done(0, 12);
    w.exercises[0].sets[0] = done(60, 10);
    const { workout } = cleanupForFinish(w, new Date());
    expect(workout.routineUpdate?.changes).toMatchObject({ replaced: 1, added: 1, removed: 0 });
    expect(workout.routineUpdate?.proposed.exercises.map((e) => e.exerciseId)).toEqual(["press-banca", "press-mancuernas", "fondos"]);
  });

  it("un ejercicio añadido y abandonado sin hacer nada no entra en la propuesta", () => {
    let w = startWorkout(routine, library, new Date(), "2026-09-21");
    w = addExercise(w, ex("fondos", { primary: ["triceps"], secondary: [] }));
    w.exercises[0].sets[0] = done(60, 10);
    expect(cleanupForFinish(w, new Date()).workout.routineUpdate).toBeUndefined();
  });

  it("detecta el reordenado", () => {
    const w = startWorkout(routine, library, new Date(), "2026-09-21");
    const swapped = { ...w, exercises: [w.exercises[1], w.exercises[0]] };
    expect(changesVsRoutine(swapped)).toMatchObject({ reordered: true, any: true });
  });
});

describe("sustituciones por músculo", () => {
  const all = [
    ex("press-banca"),
    ex("press-inclinado", { primary: ["chest"], secondary: ["shoulders"] }),
    ex("aperturas", { equipment: "dumbbell", compound: false, secondary: [] }),
    ex("fondos", { primary: ["triceps"], secondary: ["chest"], equipment: "bodyweight" }),
    ex("remo", { primary: ["lats"], secondary: ["biceps"] }),
    ex("pec-deck", { equipment: "machine", compound: false, secondary: [] }),
  ];

  it("primero el mismo músculo y equipo, luego el mismo músculo; nunca otro músculo principal", () => {
    const list = suggestSubstitutes(all[0], all).map((e) => e.id);
    expect(list[0]).toBe("press-inclinado");
    expect(list).toContain("aperturas");
    expect(list).toContain("pec-deck");
    expect(list).not.toContain("remo");
    expect(list).not.toContain("fondos");
    expect(list).not.toContain("press-banca");
  });

  it("excluye los que ya están en el entreno", () => {
    expect(suggestSubstitutes(all[0], all, ["press-inclinado"]).map((e) => e.id)).not.toContain("press-inclinado");
  });
});

describe("calculadoras", () => {
  it("calentamiento: 50 % × 8, 70 % × 5, 85 % × 3, redondeado y sin pasar del peso de trabajo", () => {
    expect(warmupSets(100)).toEqual([
      { kg: 50, reps: 8 },
      { kg: 70, reps: 5 },
      { kg: 85, reps: 3 },
    ]);
    expect(warmupSets(60)).toEqual([
      { kg: 30, reps: 8 },
      { kg: 42.5, reps: 5 },
      { kg: 50, reps: 3 },
    ]);
    expect(warmupSets(20)).toEqual([]);
    expect(warmupSets(25).every((s) => s.kg >= 20 && s.kg < 25)).toBe(true);
    expect(warmupSets(50, 0, 1).length).toBe(3);
  });

  it("discos por lado", () => {
    expect(platesPerSide(100)).toEqual({ perSide: [{ kg: 25, count: 1 }, { kg: 15, count: 1 }], remainder: 0 });
    expect(platesPerSide(20)).toEqual({ perSide: [], remainder: 0 });
    expect(platesPerSide(62.5).perSide).toEqual([
      { kg: 20, count: 1 },
      { kg: 1.25, count: 1 },
    ]);
    expect(platesPerSide(141).remainder).toBeGreaterThan(0); // 141 no se puede cargar con saltos de 1,25 por lado (2,5 en total)
    expect(platesPerSide(120, 20, [20]).perSide).toEqual([{ kg: 20, count: 2 }]);
  });
});

describe("estadísticas y rutinas", () => {
  it("series por músculo y semana (principal 1, secundario 0,5, sin calentamientos)", () => {
    const w = (date: string) => ({
      ...startWorkout(null, [], new Date(), date),
      exercises: [{ ...workoutExerciseFrom(ex("a")), sets: [done(60, 10, "warmup"), done(60, 10), done(60, 9)] }],
    });
    const out = weeklySetsByMuscle([w("2026-09-21"), w("2026-09-22"), w("2026-09-01")], ["2026-09-21", "2026-09-22"]);
    expect(out.chest).toBe(4);
    expect(out.triceps).toBe(2);
    expect(out.lats).toBeUndefined();
  });

  it("«hoy toca»: la rutina que hace más tiempo que no haces (o nunca)", () => {
    const r = (id: string): Routine => ({ id, name: id, exercises: [] });
    const w = (routineId: string, date: string) => ({ ...startWorkout(null, [], new Date(), date), routineId });
    expect(nextSuggestedRoutine([r("a"), r("b"), r("c")], [w("a", "2026-09-20"), w("b", "2026-09-10"), w("a", "2026-09-01")])?.id).toBe("c");
    expect(nextSuggestedRoutine([r("a"), r("b")], [w("a", "2026-09-20"), w("b", "2026-09-10")])?.id).toBe("b");
    expect(nextSuggestedRoutine([], [])).toBeNull();
  });

  it("duplicar una rutina crea ids nuevos", () => {
    const r: Routine = { id: "r1", name: "Pecho", exercises: [routineExerciseFor(ex("a"))] };
    const c = cloneRoutine(r);
    expect(c.id).not.toBe(r.id);
    expect(c.name).toBe("Pecho (copia)");
    expect(c.exercises[0].id).not.toBe(r.exercises[0].id);
    expect(c.exercises[0].exerciseId).toBe("a");
  });

  it("incrementos por defecto según equipo", () => {
    expect(defaultIncrement({ equipment: "barbell", kind: "weight_reps" })).toBe(2.5);
    expect(defaultIncrement({ equipment: "dumbbell", kind: "weight_reps" })).toBe(2);
    expect(defaultIncrement({ equipment: "bodyweight", kind: "bodyweight" })).toBe(2.5);
    expect(defaultIncrement({ equipment: "barbell", kind: "weight_reps", increment: 5 })).toBe(5);
  });
});

describe("historial por ejercicio", () => {
  const w = (id: string, startedAt: string, exId: string, sets: SetLog[]): Workout => ({
    ...startWorkout(null, [], new Date(startedAt), startedAt.slice(0, 10)),
    id,
    exercises: [{ ...workoutExerciseFrom(ex(exId)), sets }],
  });

  it("ordena de más reciente a más antiguo y filtra por ejercicio", () => {
    const list = [w("a", "2026-09-01T10:00:00Z", "x", [done(50, 10)]), w("b", "2026-09-15T10:00:00Z", "x", [done(55, 10)]), w("c", "2026-09-10T10:00:00Z", "y", [done(9, 9)])];
    const h = historyFor(list, "x");
    expect(h.map((s) => s.date)).toEqual(["2026-09-15", "2026-09-01"]);
    expect(h[0].sets[0].kg).toBe(55);
  });

  it("puede excluir el entreno en curso", () => {
    const list = [w("a", "2026-09-01T10:00:00Z", "x", [done(50, 10)]), w("b", "2026-09-15T10:00:00Z", "x", [done(55, 10)])];
    expect(historyFor(list, "x", "b").map((s) => s.date)).toEqual(["2026-09-01"]);
  });
});

describe("plan de una rutina", () => {
  it("resume y cuenta las series planificadas", () => {
    const sets = plannedSets(1, 4, 6, 10);
    expect(planCounts(sets)).toEqual({ warmups: 1, working: 4, repMin: 6, repMax: 10 });
    expect(planSummary(sets)).toBe("1 cal. + 4 × 6–10");
    expect(planSummary(plannedSets(0, 3, 12, 12))).toBe("3 × 12");
    expect(planSummary(plannedSets(0, 3, 45, 60), "duration")).toBe("3 × 45–60 s");
    expect(planCounts([])).toEqual({ warmups: 0, working: 0, repMin: 8, repMax: 12 });
  });

  it("formatea el descanso", () => {
    expect(restText(90)).toBe("1:30");
    expect(restText(180)).toBe("3:00");
    expect(restText(45)).toBe("0:45");
  });

  it("las superseries también valen para ejercicios de una rutina", () => {
    const list = [
      { id: "1", exerciseId: "a" },
      { id: "2", exerciseId: "b" },
      { id: "3", exerciseId: "c" },
    ] as { id: string; exerciseId: string; supersetId?: string }[];
    const linked = linkSuperset(list, 0, 2);
    expect(linked.map((e) => e.exerciseId)).toEqual(["a", "c", "b"]);
    expect(linked[0].supersetId).toBe(linked[1].supersetId);
    expect(unlinkSuperset(linked, 0).every((e) => !e.supersetId)).toBe(true);
  });
});

describe("valores sugeridos por fila", () => {
  const last = [session("d1", done(30, 10, "warmup"), done(60, 12), done(60, 12), done(60, 12), done(45, 15, "drop"))];
  const sug = suggestNext(last, cfg); // sube a 62,5 × 8

  it("calentamiento de la calculadora, trabajo de la sobrecarga, drop de la última vez", () => {
    const current = [newSet("warmup"), newSet("warmup"), newSet("normal"), newSet("normal"), newSet("normal"), newSet("drop")];
    const prev = previousFor(current, last[0].sets);
    const g = ghostsFor(current, sug, prev);
    expect(g[0]).toEqual({ kg: 32.5, reps: 8 }); // 62,5 × 0,5 = 31,25 → 32,5
    expect(g[1]).toEqual({ kg: 45, reps: 5 }); // 62,5 × 0,7 = 43,75 → 45
    expect(g[2]).toEqual({ kg: 62.5, reps: 8 });
    expect(g[4]).toEqual({ kg: 62.5, reps: 8 });
    expect(g[5]).toEqual({ kg: 45, reps: 15 });
  });

  it("sin historial no hay sugerencias de peso", () => {
    const g = ghostsFor([newSet("normal")], suggestNext([], cfg), [null]);
    expect(g[0]).toEqual({ kg: null, reps: 8 });
  });

  it("los ejercicios sin barra no llevan la serie de barra vacía", () => {
    const g = ghostsFor([newSet("warmup")], sug, [null], { usesBar: false });
    expect(g[0]).toEqual({ kg: 32.5, reps: 8 });
  });

  it("se puede marcar con datos escritos o sugeridos; si no, no", () => {
    expect(canComplete(newSet("normal", 60, 10), null, "weight_reps")).toBe(true);
    expect(canComplete(newSet("normal"), { kg: 60, reps: 8 }, "weight_reps")).toBe(true);
    expect(canComplete(newSet("normal", 60), null, "weight_reps")).toBe(false); // faltan reps
    expect(canComplete(newSet("normal", null, 8), null, "weight_reps")).toBe(false); // faltan kilos
    expect(canComplete(newSet("normal", null, 8), null, "bodyweight")).toBe(true); // peso corporal sin lastre
    expect(canComplete(newSet("normal", null, 0), null, "bodyweight")).toBe(false);
  });
});

describe("récords de un entreno", () => {
  const w = (id: string, startedAt: string, sets: SetLog[]): Workout => ({
    ...startWorkout(null, [], new Date(startedAt), startedAt.slice(0, 10)),
    id,
    startedAt,
    exercises: [{ ...workoutExerciseFrom(ex("banca")), sets }],
  });

  it("compara con los entrenos anteriores, no con los posteriores ni consigo mismo", () => {
    const old = w("a", "2026-09-01T10:00:00.000Z", [done(60, 10)]);
    const today = w("b", "2026-09-10T10:00:00.000Z", [done(65, 8)]);
    const later = w("c", "2026-09-20T10:00:00.000Z", [done(100, 5)]);
    const res = workoutPRs(today, [old, today, later]);
    expect(res).toHaveLength(1);
    expect(res[0].name).toBe("banca");
    expect(res[0].prs.map((p) => p.type)).toContain("weight");
  });

  it("el primer entreno de un ejercicio no tiene récords", () => {
    const only = w("a", "2026-09-01T10:00:00.000Z", [done(60, 10)]);
    expect(workoutPRs(only, [only])).toEqual([]);
  });
});


import { cleanupForFinish as finishW, commitRepRange, E1RM_MAX_REPS, recordsFrom as recs, replaceExercise as replaceEx, restDecision as restD, routineFromWorkout as fromWorkout, suggestNext as next, type SetLog as Log } from "./strength";

describe("fuerza — correcciones de la 0.13", () => {
  const doneAt = (kg: number, reps: number, iso: string): Log => ({ ...newSet("normal", kg, reps), kg, reps, done: true, completedAt: iso });

  it("un entreno olvidado abierto no dura 14 horas: termina 2 min tras la última serie", () => {
    const w = startWorkout(null, [], new Date("2026-09-21T10:00:00Z"), "2026-09-21");
    w.exercises = [{ ...workoutExerciseFrom(ex("a")), sets: [doneAt(60, 10, "2026-09-21T10:50:00Z")] }];
    const r = finishW(w, new Date("2026-09-22T00:30:00Z"));
    expect(r.workout.endedAt).toBe("2026-09-21T10:52:00.000Z");
    const recent = finishW(w, new Date("2026-09-21T11:00:00Z"));
    expect(recent.workout.endedAt).toBe("2026-09-21T11:00:00.000Z");
  });

  it("superserie desigual: al acabar la ronda descansa y vuelve al miembro que aún tiene series", () => {
    const a = { ...workoutExerciseFrom(ex("a")), supersetId: "ss", sets: [newSet("normal"), newSet("normal"), newSet("normal")] };
    const b = { ...workoutExerciseFrom(ex("b")), supersetId: "ss", sets: [newSet("normal")] };
    b.sets[0] = { ...b.sets[0]!, done: true };
    a.sets[0] = { ...a.sets[0]!, done: true };
    // Se marca la 2.ª serie de A: B ya no tiene series → no salta a B, descansa y sigue en A.
    const d = restD([a, b], 0, 1);
    expect(d.start).toBe(true);
    expect(d.advanceTo).toBe(0);
  });

  it("sustituir conserva el plan del ejercicio sustituido", () => {
    const w = startWorkout(null, [], new Date(), "2026-09-21");
    const cur = workoutExerciseFrom(ex("a"));
    cur.plan = { ...cur.plan, sets: [{ type: "normal", repMin: 5, repMax: 5 }, { type: "normal", repMin: 5, repMax: 5 }], restS: 180, rule: "linear" };
    w.exercises = [cur];
    const r = replaceEx(w, 0, ex("b"));
    expect(r.exercises[0]!.plan).toMatchObject({ restS: 180, rule: "linear" });
    expect(r.exercises[0]!.plan.sets).toHaveLength(2);
  });

  it("repetir usa el rango de las series de trabajo y conserva la rutina de origen", () => {
    const w = startWorkout(null, [], new Date(), "2026-09-21");
    const e = workoutExerciseFrom(ex("a"));
    e.plan = { ...e.plan, sets: [{ type: "warmup", repMin: 8, repMax: 12 }, { type: "normal", repMin: 4, repMax: 6 }] };
    e.sets = [doneAt(40, 8, "2026-09-21T10:00:00Z"), doneAt(100, 5, "2026-09-21T10:05:00Z")];
    e.sets[0] = { ...e.sets[0]!, type: "warmup" };
    w.exercises = [e];
    w.routineId = "rt-orig";
    const r = fromWorkout(w);
    expect(r.id).toBe("rt-orig");
    expect(r.exercises[0]!.sets.map((x) => [x.repMin, x.repMax])).toEqual([[4, 6], [4, 6]]);
  });

  it("repetir nunca propone «Actualizar rutina» (pisaba la rutina de verdad con lo hecho aquel día)", () => {
    const w = startWorkout(null, [], new Date(), "2026-09-21");
    w.exercises = [{ ...workoutExerciseFrom(ex("a")), sets: [doneAt(100, 5, "2026-09-21T10:05:00Z")] }];
    w.routineId = "rt-orig";
    const again = startWorkout(fromWorkout(w), [ex("a"), ex("b")], new Date(), "2026-09-28");
    expect(again.routineId).toBe("rt-orig"); // sigue contando para «Hoy toca»
    expect(again.routineSnapshot).toBeUndefined();
    // Se añade otro ejercicio y se hace: con una rutina normal sería un cambio que ofrecer.
    again.exercises.push({ ...workoutExerciseFrom(ex("b")), sets: [doneAt(20, 10, "2026-09-28T10:00:00Z")] });
    again.exercises[0]!.sets = [doneAt(100, 5, "2026-09-28T10:05:00Z")];
    expect(finishW(again, new Date("2026-09-28T10:30:00Z")).workout.routineUpdate).toBeUndefined();
  });

  it("mín./máx. de repeticiones: se aplica al salir y solo mueve el otro extremo si se cruza", () => {
    const r = { repMin: 8, repMax: 12 };
    expect(commitRepRange(r, "max", "15")).toEqual({ repMin: 8, repMax: 15 }); // antes quedaba 1–15
    expect(commitRepRange(r, "max", "5")).toEqual({ repMin: 5, repMax: 5 });
    expect(commitRepRange(r, "min", "14")).toEqual({ repMin: 14, repMax: 14 });
    expect(commitRepRange(r, "min", "")).toBe(r); // vaciar y salir: se queda como estaba
    expect(commitRepRange(r, "min", "0")).toBe(r);
    expect(commitRepRange(r, "max", "999")).toEqual({ repMin: 8, repMax: 200 });
  });

  it("empezar una rutina guardada sí guarda su foto para comparar al terminar", () => {
    const routine = { id: "rt-1", name: "Pierna", exercises: [routineExerciseFor(ex("a"))] };
    expect(startWorkout(routine, [ex("a")], new Date(), "2026-09-28").routineSnapshot?.id).toBe("rt-1");
  });

  it("el 1RM no cuenta series de más de 12 repeticiones", () => {
    const r = recs([{ date: "d", sets: [doneAt(40, 30, "x"), doneAt(80, 5, "x")] }])!;
    expect(E1RM_MAX_REPS).toBe(12);
    expect(r.bestE1rm).toBeCloseTo(80 * (1 + 5 / 30), 1);
  });

  it("un ejercicio por tiempo progresa sobre lo último aguantado", () => {
    const s = next([{ date: "d", sets: [doneAt(0, 75, "x"), doneAt(0, 70, "x")] }], { rule: "double", repMin: 30, repMax: 60, increment: 0, plannedSets: 2, kind: "duration" });
    expect(s.action).toBe("increase");
    expect(s.perSet[0]!.reps).toBe(80);
  });
});
