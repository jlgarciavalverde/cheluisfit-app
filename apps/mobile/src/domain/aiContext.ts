// Resúmenes compactos para el asistente de IA (ver `components/ai/AiAssistant.tsx`), uno por
// sección. Nunca se manda el histórico entero al servidor: por tamaño de prompt y porque los
// planes gratuitos de IA tienen límite de tokens por minuto (ver plan). Reutilizan los mismos
// cálculos que ya usan las pantallas, no recalculan nada por su cuenta.
import { addDays, todayKey } from "./dates";
import { fridgeContext, type Fridge } from "./fridge";
import { fmtDuration, fmtKm, fmtPace , fmtKg } from "./format";
import { GOAL_LABEL, isOnTarget, sumNutrients, weekSummary } from "./nutrition";
import { avgPace, defaultMaxHr, hrZoneOf, planVsActual, weeklyTotals, type Activity, type Planned, type Template } from "./running";
import { bestE1rm, isWorking, MUSCLE_LABEL, weeklySetsByMuscle, workoutPRs, workoutTotals, type Muscle, type Workout } from "./strength";
import { activeDayStreak } from "./streak";
import type { Entry, Food, Profile, Targets } from "./types";

export type AiSection = "nutrition" | "running" | "strength" | "general";

/**
 * A qué sección pertenece cada pantalla, para que el asistente sepa de qué se habla. `/` (Hoy)
 * cae en «general» a propósito: mezcla nutrición, running y fuerza, no es de una sola sección.
 */
export function sectionForPath(pathname: string): AiSection {
  if (/^\/(nutricion|objetivo|peso|medidas|nevera|alimento|anadir|escaner|crear-alimento)/.test(pathname)) return "nutrition";
  if (/^\/(running|sesion|plantilla)/.test(pathname)) return "running";
  if (/^\/(fuerza|ejercicio|crear-ejercicio|rutina|entreno)/.test(pathname)) return "strength";
  return "general";
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const uid = () => `ai-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/**
 * Convierte la propuesta de la IA (totales para la cantidad sugerida) en un `Food` sintético
 * (valores por 100 g, como exige `addEntry`). `reliability: "incomplete"` porque solo se conocen
 * kcal/macros — fibra, azúcares, grasa saturada y sal quedan a 0, igual que cualquier ficha
 * incompleta ya existente en la app.
 */
export function foodFromMealProposal(p: { name: string; grams: number; kcal: number; protein: number; carbs: number; fat: number }): Food {
  const f = 100 / p.grams;
  return {
    id: uid(),
    name: p.name,
    source: "user",
    reliability: "incomplete",
    per100: { kcal: Math.round(p.kcal * f), protein: round1(p.protein * f), carbs: round1(p.carbs * f), fat: round1(p.fat * f), fiber: 0, sugars: 0, satFat: 0, salt: 0 },
    servings: [],
  };
}

/** Últimos 7 días incluido hoy, del más antiguo al más reciente. */
function last7Days(today: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(today, -(6 - i)));
}

export function nutritionContext(
  profile: Profile,
  targets: Targets,
  entries: readonly Entry[],
  today: string = todayKey(),
  fridge?: Fridge,
  now: Date = new Date(),
): string {
  const dates = last7Days(today);
  const week = weekSummary(entries, dates, targets.kcal);
  const todayTotals = sumNutrients(entries.filter((e) => e.date === today).map((e) => e.nutrients));
  const lines = [
    `Objetivo: ${GOAL_LABEL[profile.goal]}, ${targets.kcal} kcal/día (proteína ${targets.protein} g, hidratos ${targets.carbs} g, grasa ${targets.fat} g).`,
    `Últimos 7 días: ${week.loggedDays} de 7 con registro, ${week.onTargetDays} dentro del objetivo de kcal. Media diaria: ${week.average.kcal} kcal.`,
    `Hoy llevas: ${todayTotals.kcal} kcal (proteína ${todayTotals.protein} g, hidratos ${todayTotals.carbs} g, grasa ${todayTotals.fat} g)` +
      (isOnTarget(todayTotals.kcal, targets.kcal) ? ", dentro del objetivo." : "."),
  ];
  const fridgeLine = fridge ? fridgeContext(fridge, now) : null;
  if (fridgeLine) lines.push(fridgeLine);
  return lines.join("\n");
}

export function runningContext(
  activities: readonly Activity[],
  templates: readonly Template[],
  today: string = todayKey(),
  extra: { planned?: readonly Planned[]; maxHr?: number } = {},
): string {
  const weeks = weeklyTotals(activities, today, 4);
  const recent = [...activities].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const lines = [
    `Últimas 4 semanas (solo carreras): ${weeks.map((w) => `${fmtKm(w.meters)} km en ${w.sessions} sesiones`).join(" · ")}.`,
    recent.length ? "Sesiones recientes:" : "Sin sesiones registradas todavía.",
    ...recent.map((a) => {
      const hr = a.avgHr ? `, FC media ${a.avgHr}${extra.maxHr ? ` (zona ${hrZoneOf(a.avgHr, extra.maxHr)})` : ""}` : "";
      const base =
        `${a.date} — ${a.title} (${a.type === "run" ? "carrera" : "caminata"}): ${fmtKm(a.distanceM)} km en ${fmtDuration(a.durationS)}` +
        (a.type === "run" ? `, ritmo ${fmtPace(avgPace(a))}/km` : "") +
        hr +
        (a.ascentM ? `, +${Math.round(a.ascentM)} m` : "") +
        (a.rpe ? `, esfuerzo ${a.rpe}/10` : "");
      const tpl = a.templateId ? templates.find((t) => t.id === a.templateId) : a.plan;
      const pv = tpl && a.plan ? planVsActual(a.plan, a) : null;
      return pv ? `${base}. Plan: ${pv.doneReps}/${pv.plannedReps} series de trabajo hechas.` : base;
    }),
  ];
  const next = (extra.planned ?? []).filter((p) => !p.activityId && p.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
  if (next.length) lines.push(`Próximas sesiones planificadas: ${next.map((p) => `${p.date} ${templates.find((t) => t.id === p.templateId)?.name ?? "entreno"}`).join(", ")}.`);
  return lines.join("\n");
}

export function strengthContext(workouts: readonly Workout[], today: string = todayKey()): string {
  const bymuscle = weeklySetsByMuscle(workouts, last7Days(today));
  const recent = [...workouts].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const muscleLine = (Object.entries(bymuscle) as [Muscle, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([m, n]) => `${MUSCLE_LABEL[m]}: ${n}`)
    .join(", ");
  const lines = [
    `Series de los últimos 7 días por grupo muscular: ${muscleLine || "ninguna"}.`,
    recent.length ? "Entrenos recientes:" : "Sin entrenos registrados todavía.",
    ...recent.map((w) => {
      const t = workoutTotals(w);
      const exs = w.exercises
        .map((e) => {
          const work = e.sets.filter((x) => x.done && isWorking(x));
          if (work.length === 0) return null;
          const top = [...work].sort((a, b) => (b.kg ?? 0) - (a.kg ?? 0) || (b.reps ?? 0) - (a.reps ?? 0))[0];
          const rpes = work.map((x) => x.rpe).filter((n): n is number => n != null);
          const e1 = bestE1rm(work);
          return (
            `${e.name} ${work.length}×, mejor serie ${top.kg ? `${fmtKg(top.kg)} kg × ` : ""}${top.reps ?? "?"}` +
            (e1 > 0 ? `, 1RM est. ${fmtKg(Math.round(e1 * 10) / 10)}` : "") +
            (rpes.length ? `, RIR medio ${Math.round((10 - rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10}` : "")
          );
        })
        .filter(Boolean);
      const prs = workoutPRs(w, workouts);
      return (
        `${w.date} — ${w.name}: ${t.workingSets} series, ${t.volume} kg de volumen, ${fmtDuration(t.durationS)}. ` +
        (exs.length ? `Ejercicios: ${exs.join("; ")}.` : "Sin series hechas.") +
        (prs.length ? ` Récords: ${prs.map((p) => p.name).join(", ")}.` : "")
      );
    }),
  ];
  return lines.join("\n");
}

// ------------------------------------------------------------------ Historial del chat

/** Límites del servidor (`schemas.ts` → `AiChatInput`): hasta 20 mensajes de 1–2000 caracteres. */
export const AI_MAX_MESSAGES = 20;
export const AI_MAX_CHARS = 2000;

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  /** Mensaje que pinta la propia app (p. ej. «No he podido responder»): nunca se manda al modelo. */
  local?: boolean;
  proposals?: readonly { type: string; name?: string; note?: string; field?: string; value?: number; grams?: number }[];
}

function describeProposal(p: NonNullable<ChatTurn["proposals"]>[number]): string {
  if (p.type === "add_meal_entry") return `propuse añadir «${p.name}» (${p.grams} g)`;
  if (p.type === "add_note") return `propuse la nota «${p.note}»`;
  if (p.type === "adjust_goal") return `propuse cambiar el objetivo de ${p.field} a ${p.value}`;
  return "hice una propuesta";
}

/**
 * Lo que se manda al servidor como historial. Gemini a veces responde **solo** con una propuesta
 * (texto vacío) y el servidor exige `content` no vacío: esas respuestas se resumen en texto
 * («[propuse añadir…]») en vez de mandarse vacías, para que el modelo siga sabiendo qué propuso.
 * Los mensajes locales de error se quitan, y se queda con los últimos `AI_MAX_MESSAGES`.
 */
export function chatHistory(turns: readonly ChatTurn[]): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const t of turns) {
    if (t.local) continue;
    let content = t.content.trim();
    if (!content && t.proposals?.length) content = `[${t.proposals.map(describeProposal).join("; ")}]`;
    if (!content) continue;
    out.push({ role: t.role, content: content.slice(0, AI_MAX_CHARS) });
  }
  return out.slice(-AI_MAX_MESSAGES);
}

// ------------------------------------------------------------------ Perfil, Hoy y presupuesto

/** Línea de perfil que va en todas las secciones: sin ella las cantidades recomendadas no tienen base. */
export function profileContext(p: Profile, weights: readonly { date: string; kg: number }[], today: string = todayKey()): string {
  const recent = [...weights].filter((w) => w.date >= addDays(today, -28)).sort((a, b) => a.date.localeCompare(b.date));
  const trend = recent.length >= 2 ? Math.round((recent[recent.length - 1].kg - recent[0].kg) * 10) / 10 : null;
  return (
    `Hoy es ${today}. Perfil: ${p.sex === "female" ? "mujer" : "hombre"}, ${p.age} años, ${p.heightCm} cm, ${p.weightKg} kg` +
    (trend != null ? ` (${trend >= 0 ? "+" : ""}${String(trend).replace(".", ",")} kg en 4 semanas)` : "") +
    `, objetivo: ${GOAL_LABEL[p.goal].toLowerCase()}, FC máx. ${p.maxHr ?? defaultMaxHr(p.age)}.`
  );
}

/** Contexto de «general» (Hoy, Más, social…): un poco de cada área en vez de nada. */
export function generalContext(input: {
  entries: readonly Entry[];
  targets: Targets;
  activities: readonly Activity[];
  workouts: readonly Workout[];
  planned: readonly Planned[];
  templates: readonly Template[];
  today?: string;
}): string {
  const today = input.today ?? todayKey();
  const eaten = sumNutrients(input.entries.filter((e) => e.date === today).map((e) => e.nutrients));
  const week = last7Days(today);
  const runs = input.activities.filter((a) => week.includes(a.date) && a.type === "run");
  const gym = input.workouts.filter((w) => week.includes(w.date));
  const streak = activeDayStreak([...input.entries.map((e) => e.date), ...input.activities.map((a) => a.date), ...input.workouts.map((w) => w.date)], today);
  const lines = [
    `Hoy: ${eaten.kcal} de ${input.targets.kcal} kcal, ${eaten.protein} de ${input.targets.protein} g de proteína.`,
    `Últimos 7 días: ${gym.length} entrenos de fuerza (${gym.map((w) => w.name).join(", ") || "ninguno"}), ${runs.length} carreras (${fmtKm(runs.reduce((s, a) => s + a.distanceM, 0))} km).`,
    `Racha: ${streak} ${streak === 1 ? "día" : "días"} seguidos registrando algo.`,
  ];
  const next = input.planned.filter((p) => !p.activityId && p.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (next) lines.push(`Próximo entreno planificado: ${next.date}, ${input.templates.find((t) => t.id === next.templateId)?.name ?? "running"}.`);
  return lines.join("\n");
}

/** Lo que el servidor acepta como contexto antes de recortarlo (`AiChatInput`). */
export const AI_CONTEXT_BUDGET = 5500;

/**
 * Junta las partes por orden de prioridad sin pasarse del presupuesto: si no cabe todo, se
 * recortan las últimas (las menos importantes), nunca el perfil ni la pantalla actual.
 */
export function budgetContext(parts: readonly (string | null | undefined)[], budget: number = AI_CONTEXT_BUDGET): string {
  let out = "";
  for (const p of parts) {
    if (!p) continue;
    const sep = out ? "\n" : "";
    if (out.length + sep.length + p.length <= budget) out += sep + p;
    else {
      const room = budget - out.length - sep.length - 1;
      if (room > 40) out += `${sep}${p.slice(0, room)}…`;
      break;
    }
  }
  return out;
}

/** Sesión que se ve en pantalla (para que una nota vaya a esa y no a la última). */
export function screenTarget(pathname: string): { kind: "activity" | "workout"; id: string } | null {
  const run = /^\/sesion\/([^/]+)$/.exec(pathname);
  if (run && run[1] !== "nueva") return { kind: "activity", id: decodeURIComponent(run[1]) };
  const gym = /^\/entreno\/(?:detalle|resumen)\/([^/]+)$/.exec(pathname);
  if (gym) return { kind: "workout", id: decodeURIComponent(gym[1]) };
  return null;
}
