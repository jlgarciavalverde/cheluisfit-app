// Análisis de entrenos con IA: aquí se calculan **todos los números** (progresión, récords,
// comparación con sesiones anteriores, zonas de FC, carga semanal) y se escriben en un texto
// compacto. El servidor (`POST /api/ai/analyze`) solo le pide al modelo que los interprete, así
// la IA no se inventa cifras. Puro y con tests (`analysis.test.ts`).
import { addDays, weekDates } from "./dates";
import { fmtDuration, fmtKg, fmtKm, fmtPace } from "./format";
import { avgPace, hrZoneOf, planVsActual, runningPRs, RUNNING_PR_LABEL, STEP_LABEL, weeklyTotals, type Activity } from "./running";
import {
  bestE1rm,
  formatEffort,
  GROUP_ORDER,
  groupOf,
  historyFor,
  isWorking,
  MUSCLE_LABEL,
  planCounts,
  PR_LABEL,
  suggestNext,
  weeklySetsByMuscle,
  workoutPRs,
  workoutTotals,
  type EffortMode,
  type Muscle,
  type MuscleGroup,
  type SetLog,
  type Workout,
} from "./strength";
import type { Entry } from "./types";

/** Lo que devuelve el servidor (`AnalysisSchema` de `routes/ai.ts`). */
export interface AiAnalysis {
  headline: string;
  highlights: string[];
  warnings: string[];
  nextTime: string[];
  score: number;
}

/** Análisis guardado junto a la sesión (se sincroniza con ella): no se vuelve a pedir solo. */
export interface StoredAnalysis {
  at: string;
  result: AiAnalysis;
}

export type AnalysisKind = "workout" | "run" | "week" | "match";

const r1 = (n: number) => Math.round(n * 10) / 10;

function setText(s: SetLog, mode: EffortMode): string {
  const base = s.kg != null && s.kg > 0 ? `${fmtKg(s.kg)}×${s.reps ?? "?"}` : `${s.reps ?? "?"}`;
  return s.rpe != null ? `${base} (${mode === "rir" ? "RIR" : "RPE"} ${formatEffort(s.rpe, mode)})` : base;
}

const doneWork = (sets: readonly SetLog[]) => sets.filter((s) => s.done && isWorking(s));

/** Texto de un entreno de fuerza con su contexto: sesión anterior, progresión de cada ejercicio y récords. */
export function workoutAnalysisData(w: Workout, all: readonly Workout[], mode: EffortMode = "rir"): string {
  const before = all.filter((x) => x.id !== w.id && x.startedAt < w.startedAt);
  const t = workoutTotals(w);
  const lines: string[] = [
    `Entreno «${w.name}» del ${w.date}: ${fmtDuration(t.durationS)}, ${t.exercises} ejercicios, ${t.workingSets} series de trabajo, ${t.reps} repeticiones, ${fmtKg(t.volume)} kg de volumen.`,
  ];

  if (w.routineId) {
    const prev = [...before].filter((x) => x.routineId === w.routineId).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
    if (prev) {
      const p = workoutTotals(prev);
      const diff = p.volume > 0 ? Math.round(((t.volume - p.volume) / p.volume) * 100) : null;
      lines.push(
        `Última vez con la misma rutina (${prev.date}): ${p.workingSets} series, ${fmtKg(p.volume)} kg de volumen, ${fmtDuration(p.durationS)}` +
          (diff != null ? ` → volumen ${diff >= 0 ? "+" : ""}${diff} %.` : "."),
      );
    } else lines.push("Primera vez con esta rutina.");
  }

  lines.push("Ejercicios:");
  for (const e of w.exercises) {
    const done = doneWork(e.sets);
    if (done.length === 0) continue;
    const history = historyFor(before, e.exerciseId);
    const today1rm = bestE1rm(e.sets);
    const trend = history
      .slice(0, 4)
      .reverse()
      .map((h) => bestE1rm(h.sets))
      .filter((n) => n > 0);
    const rests = done.map((s) => s.restS).filter((n): n is number => typeof n === "number" && n > 0);
    const parts = [`- ${e.name}: hoy ${done.map((s) => setText(s, mode)).join(", ")}`];
    if (today1rm > 0) parts.push(`1RM estimado ${fmtKg(r1(today1rm))} kg`);
    if (history[0]) parts.push(`anterior (${history[0].date}): ${doneWork(history[0].sets).map((s) => setText(s, mode)).join(", ") || "sin series de trabajo"}`);
    else parts.push("primera vez");
    if (trend.length > 0 && today1rm > 0) parts.push(`evolución del 1RM: ${[...trend, today1rm].map((n) => fmtKg(r1(n))).join(" → ")}`);
    if (rests.length > 0) parts.push(`descanso medio ${fmtDuration(Math.round(rests.reduce((a, b) => a + b, 0) / rests.length))}`);
    const counts = planCounts(e.plan.sets);
    if (counts.working > 0) {
      const next = suggestNext([{ date: w.date, sets: e.sets }, ...history], {
        rule: e.plan.rule,
        repMin: counts.repMin,
        repMax: counts.repMax,
        increment: e.plan.increment,
        plannedSets: counts.working,
        kind: e.kind,
      });
      if (next.action !== "none") parts.push(`la app sugiere para la próxima: ${next.reason.replace(/\.$/, "")}`);
    }
    lines.push(parts.join("; ") + ".");
  }

  const prs = workoutPRs(w, all);
  lines.push(
    prs.length > 0
      ? `Récords batidos: ${prs.map((p) => `${p.name} (${p.prs.map((x) => `${PR_LABEL[x.type].toLowerCase()} ${fmtKg(r1(x.value))} antes ${fmtKg(r1(x.previous))}`).join(", ")})`).join("; ")}.`
      : "Sin récords nuevos.",
  );

  const week = weeklySetsByMuscle([...before, w], Array.from({ length: 7 }, (_, i) => addDays(w.date, -i)));
  const muscles = (Object.entries(week) as [Muscle, number][]).sort((a, b) => b[1] - a[1]);
  if (muscles.length > 0) lines.push(`Series por músculo en los 7 días hasta hoy (referencia 10–20): ${muscles.map(([m, n]) => `${MUSCLE_LABEL[m]} ${r1(n)}`).join(", ")}.`);
  if (w.notes) lines.push(`Notas de la persona: ${w.notes}`);
  return lines.join("\n");
}

/** Texto de una carrera o caminata con su contexto: ritmo por vueltas, FC, plan y semanas anteriores. */
export function runAnalysisData(a: Activity, all: readonly Activity[], maxHr: number): string {
  const lines: string[] = [];
  const kind = a.type === "run" ? "Carrera" : "Caminata";
  lines.push(`${kind} «${a.title}» del ${a.date}: ${fmtKm(a.distanceM)} km en ${fmtDuration(a.durationS)}, ritmo medio ${fmtPace(avgPace(a))}/km.`);
  const hr: string[] = [];
  if (a.avgHr) hr.push(`FC media ${a.avgHr} ppm (zona ${hrZoneOf(a.avgHr, maxHr)} de 5, FC máx. de referencia ${maxHr})`);
  if (a.maxHr) hr.push(`FC máxima ${a.maxHr} ppm`);
  if (a.ascentM) hr.push(`desnivel +${Math.round(a.ascentM)} m`);
  if (a.kcal) hr.push(`${Math.round(a.kcal)} kcal activas`);
  if (a.rpe) hr.push(`esfuerzo percibido ${a.rpe}/10`);
  if (hr.length) lines.push(`${hr.join(", ")}.`);

  if (a.laps && a.laps.length > 1) {
    const laps = a.laps.filter((l) => l.distanceM > 0);
    lines.push(
      `Vueltas: ${laps
        .map((l) => `${l.index}${l.kind ? ` (${STEP_LABEL[l.kind].toLowerCase()})` : ""} ${fmtKm(l.distanceM)} km a ${fmtPace(l.durationS / (l.distanceM / 1000))}${l.avgHr ? ` ${l.avgHr} ppm` : ""}`)
        .join("; ")}.`,
    );
    const paces = laps.filter((l) => l.distanceM >= 800).map((l) => l.durationS / (l.distanceM / 1000));
    if (paces.length > 2) {
      const mean = paces.reduce((x, y) => x + y, 0) / paces.length;
      const sd = Math.sqrt(paces.reduce((x, y) => x + (y - mean) ** 2, 0) / paces.length);
      lines.push(`Regularidad: variación del ritmo entre vueltas ±${Math.round(sd)} s/km.`);
    }
  }

  if (a.plan) {
    const pv = planVsActual(a.plan, a);
    lines.push(
      pv
        ? `Plan «${a.plan.name}»: ${pv.doneReps}/${pv.plannedReps} series de trabajo hechas${pv.avgWorkPace ? `, ritmo medio en las series ${fmtPace(pv.avgWorkPace)}/km` : ""}.`
        : `Plan «${a.plan.name}» (sin vueltas para compararlo).`,
    );
  }

  const others = all.filter((x) => x.id !== a.id && x.date <= a.date);
  const weeks = weeklyTotals([...others, a], a.date, 5);
  lines.push(`Km por semana (las 4 anteriores y la de esta sesión): ${weeks.map((w) => `${fmtKm(w.meters)} (${w.sessions})`).join(" · ")}.`);
  const sameType = others.filter((x) => x.type === a.type && x.date >= addDays(a.date, -42) && x.distanceM > 0);
  if (sameType.length > 0) {
    const dist = sameType.reduce((s, x) => s + x.distanceM, 0) / sameType.length;
    const pace = sameType.reduce((s, x) => s + avgPace(x), 0) / sameType.length;
    lines.push(`Media de las ${sameType.length} sesiones parecidas de las 6 semanas anteriores: ${fmtKm(dist)} km a ${fmtPace(pace)}/km.`);
  }
  if (a.type === "run") {
    const prs = runningPRs([...others, a]);
    const mine = (Object.entries(prs) as [keyof typeof prs, Activity | null][]).filter(([, x]) => x?.id === a.id).map(([k]) => RUNNING_PR_LABEL[k]);
    lines.push(mine.length ? `Récords de esta sesión: ${mine.join(", ")}.` : "Sin récords nuevos.");
  }
  if (a.notes) lines.push(`Notas de la persona: ${a.notes}`);
  return lines.join("\n");
}

/** Resumen de una semana (lunes a domingo de `anyDate`) de las tres áreas, comparada con la anterior. */
export function weekAnalysisData(
  anyDate: string,
  data: { workouts: readonly Workout[]; activities: readonly Activity[]; entries: readonly Entry[]; targetKcal: number; targetProtein: number },
): string {
  const dates = weekDates(anyDate);
  const prevDates = dates.map((d) => addDays(d, -7));
  const inWeek = (ds: readonly string[]) => (x: { date: string }) => ds.includes(x.date);
  const lines: string[] = [`Semana del ${dates[0]} al ${dates[6]}.`];

  const ws = data.workouts.filter(inWeek(dates));
  const prevWs = data.workouts.filter(inWeek(prevDates));
  const vol = (list: readonly Workout[]) => list.reduce((s, w) => s + workoutTotals(w).volume, 0);
  lines.push(`Fuerza: ${ws.length} entrenos (${fmtKg(vol(ws))} kg de volumen); semana anterior ${prevWs.length} (${fmtKg(vol(prevWs))} kg).`);
  const muscles = (Object.entries(weeklySetsByMuscle(data.workouts, dates)) as [Muscle, number][]).sort((a, b) => b[1] - a[1]);
  if (muscles.length) lines.push(`Series por músculo (referencia 10–20 por semana): ${muscles.map(([m, n]) => `${MUSCLE_LABEL[m]} ${r1(n)}`).join(", ")}.`);

  const acts = data.activities.filter(inWeek(dates));
  const runs = acts.filter((a) => a.type === "run");
  const prevRuns = data.activities.filter(inWeek(prevDates)).filter((a) => a.type === "run");
  const km = (list: readonly Activity[]) => list.reduce((s, a) => s + a.distanceM, 0);
  lines.push(`Running: ${runs.length} carreras, ${fmtKm(km(runs))} km; semana anterior ${prevRuns.length} carreras, ${fmtKm(km(prevRuns))} km.`);
  const walks = acts.filter((a) => a.type === "walk");
  if (walks.length) lines.push(`Caminatas: ${walks.length}, ${fmtKm(km(walks))} km.`);

  const days = dates.map((d) => data.entries.filter((e) => e.date === d));
  const logged = days.filter((d) => d.length > 0);
  if (logged.length) {
    const kcal = logged.map((d) => d.reduce((s, e) => s + e.nutrients.kcal, 0));
    const prot = logged.map((d) => d.reduce((s, e) => s + e.nutrients.protein, 0));
    const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
    lines.push(
      `Nutrición: ${logged.length} de 7 días registrados; media ${avg(kcal)} kcal (objetivo ${data.targetKcal}) y ${avg(prot)} g de proteína (objetivo ${data.targetProtein}).`,
    );
  } else lines.push("Nutrición: ningún día registrado.");

  const active = new Set([...ws.map((w) => w.date), ...acts.map((a) => a.date)]);
  lines.push(`Días con entreno o actividad: ${active.size} de 7.`);
  return lines.join("\n");
}

/** Fecha del lunes de la semana de `date` (clave para guardar el análisis semanal). */
export function weekKey(date: string): string {
  return weekDates(date)[0];
}

/** Series de la semana por grupo muscular (los secundarios cuentan medio, como en `weeklySetsByMuscle`). */
export function weeklyGroupSets(workouts: readonly Workout[], dates: readonly string[]): Record<MuscleGroup, number> {
  const out = Object.fromEntries(GROUP_ORDER.map((g) => [g, 0])) as Record<MuscleGroup, number>;
  for (const [m, n] of Object.entries(weeklySetsByMuscle(workouts, dates)) as [Muscle, number][]) out[groupOf(m)] += n;
  for (const g of GROUP_ORDER) out[g] = r1(out[g]);
  return out;
}

/**
 * Minutos por zona de FC (1–5) en la semana, aproximados con la FC media de cada sesión (Health
 * Connect no da la FC segundo a segundo en el resumen). Las sesiones sin FC no cuentan.
 */
export function zoneMinutes(activities: readonly Activity[], dates: readonly string[], maxHr: number): number[] {
  const out = [0, 0, 0, 0, 0];
  for (const a of activities) {
    if (!dates.includes(a.date) || !a.avgHr) continue;
    const z = hrZoneOf(a.avgHr, maxHr);
    if (z > 0) out[z - 1] += Math.round(a.durationS / 60);
  }
  return out;
}
