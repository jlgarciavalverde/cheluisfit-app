// Resúmenes compactos para el asistente de IA (ver `components/ai/AiAssistant.tsx`), uno por
// sección. Nunca se manda el histórico entero al servidor: por tamaño de prompt y porque los
// planes gratuitos de IA tienen límite de tokens por minuto (ver plan). Reutilizan los mismos
// cálculos que ya usan las pantallas, no recalculan nada por su cuenta.
import { addDays, todayKey } from "./dates";
import { fmtDuration, fmtKm, fmtPace } from "./format";
import { GOAL_LABEL, isOnTarget, sumNutrients, weekSummary } from "./nutrition";
import { avgPace, planVsActual, weeklyTotals, type Activity, type Template } from "./running";
import { MUSCLE_LABEL, weeklySetsByMuscle, workoutTotals, type Muscle, type Workout } from "./strength";
import type { Entry, Food, Profile, Targets } from "./types";

export type AiSection = "nutrition" | "running" | "strength" | "general";

/**
 * A qué sección pertenece cada pantalla, para que el asistente sepa de qué se habla. `/` (Hoy)
 * cae en «general» a propósito: mezcla nutrición, running y fuerza, no es de una sola sección.
 */
export function sectionForPath(pathname: string): AiSection {
  if (/^\/(nutricion|objetivo|peso|alimento|anadir|escaner|crear-alimento)/.test(pathname)) return "nutrition";
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

/** Días completos desde `date` (YYYY-MM-DD) hasta `today`, redondeado hacia abajo. */
function daysSince(date: string, today: string): number {
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000));
}

export function nutritionContext(
  profile: Profile,
  targets: Targets,
  entries: readonly Entry[],
  today: string = todayKey(),
  fridge?: { items: string[]; lastScannedAt: string | null },
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
  if (fridge && fridge.items.length > 0 && fridge.lastScannedAt) {
    lines.push(`En la nevera (escaneada hace ${daysSince(fridge.lastScannedAt, today)} días): ${fridge.items.join(", ")}.`);
  }
  return lines.join("\n");
}

export function runningContext(activities: readonly Activity[], templates: readonly Template[], today: string = todayKey()): string {
  const weeks = weeklyTotals(activities, today, 4);
  const recent = [...activities].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const lines = [
    `Últimas 4 semanas (solo carreras): ${weeks.map((w) => `${fmtKm(w.meters)} km en ${w.sessions} sesiones`).join(" · ")}.`,
    recent.length ? "Sesiones recientes:" : "Sin sesiones registradas todavía.",
    ...recent.map((a) => {
      const base = `${a.date} — ${a.title} (${a.type === "run" ? "carrera" : "caminata"}): ${fmtKm(a.distanceM)} km en ${fmtDuration(a.durationS)}` + (a.type === "run" ? `, ritmo ${fmtPace(avgPace(a))}/km` : "");
      const tpl = a.templateId ? templates.find((t) => t.id === a.templateId) : a.plan;
      const pv = tpl && a.plan ? planVsActual(a.plan, a) : null;
      return pv ? `${base}. Plan: ${pv.doneReps}/${pv.plannedReps} series de trabajo hechas.` : base;
    }),
  ];
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
      return `${w.date} — ${w.name}: ${t.workingSets} series, ${t.volume} kg de volumen, ${fmtDuration(t.durationS)}. Ejercicios: ${w.exercises.map((e) => e.name).join(", ") || "ninguno"}.`;
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
