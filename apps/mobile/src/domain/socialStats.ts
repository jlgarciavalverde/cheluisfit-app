// Resumen público de estadísticas para el perfil de Social. El servidor nunca lee los datos de
// fitness de nadie: es el móvil quien calcula estas tarjetas (ya con el texto formateado) y las
// sube (`data/socialStats.ts`); la persona elige en el editor cuáles se enseñan. Nada de salud:
// ni peso, ni medidas, ni comida — solo actividad. Puro y con tests (`socialStats.test.ts`).
import { weekDates } from "./dates";
import { fmtDuration, fmtKg, fmtKm, fmtPace } from "./format";
import { avgPace, prTimeS, runningPRs, type Activity } from "./running";
import { activeDayStreak } from "./streak";
import { bestE1rm, type Workout } from "./strength";

export interface PublicStat {
  key: string;
  label: string;
  value: string;
  unit?: string;
  detail?: string;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const shortDate = (key: string) => `${Number(key.slice(8))} ${MONTHS[Number(key.slice(5, 7)) - 1]}`;

export function buildProfileStats(input: { activities: readonly Activity[]; workouts: readonly Workout[]; activeDates?: readonly string[]; today: string }): PublicStat[] {
  const { activities, workouts, today } = input;
  const out: PublicStat[] = [];
  const month = today.slice(0, 7);
  const runsMonth = activities.filter((a) => a.type === "run" && a.date.startsWith(month));
  const kmMonth = runsMonth.reduce((s, a) => s + a.distanceM, 0);
  if (kmMonth > 0) out.push({ key: "kmMonth", label: "Km este mes", value: fmtKm(kmMonth), unit: "km" });
  if (runsMonth.length > 0) out.push({ key: "runsMonth", label: "Carreras este mes", value: String(runsMonth.length) });

  const week = weekDates(today);
  const gymWeek = workouts.filter((w) => week.includes(w.date)).length;
  const gymMonth = workouts.filter((w) => w.date.startsWith(month)).length;
  if (gymWeek > 0) out.push({ key: "workoutsWeek", label: "Entrenos esta semana", value: String(gymWeek) });
  if (gymMonth > 0) out.push({ key: "workoutsMonth", label: "Entrenos este mes", value: String(gymMonth) });

  const dates = input.activeDates ?? [...activities.map((a) => a.date), ...workouts.map((w) => w.date)];
  const streak = activeDayStreak(dates, today);
  if (streak >= 2) out.push({ key: "streak", label: "Racha", value: String(streak), unit: "días" });

  const prs = runningPRs(activities);
  const prCard = (key: "pr5k" | "pr10k" | "prHalf", bucket: "5k" | "10k" | "half_marathon", label: string) => {
    const a = prs[bucket];
    if (a) out.push({ key, label, value: fmtDuration(prTimeS(a, bucket)), detail: shortDate(a.date) });
  };
  prCard("pr5k", "5k", "Mejor 5K");
  prCard("pr10k", "10k", "Mejor 10K");
  prCard("prHalf", "half_marathon", "Mejor media maratón");
  if (prs.longest) out.push({ key: "longestRun", label: "Carrera más larga", value: fmtKm(prs.longest.distanceM), unit: "km", detail: shortDate(prs.longest.date) });
  if (prs.fastest_pace) out.push({ key: "fastestPace", label: "Mejor ritmo", value: fmtPace(avgPace(prs.fastest_pace)), unit: "/km", detail: shortDate(prs.fastest_pace.date) });

  // Los 3 ejercicios con el 1RM estimado más alto (solo con peso; el resto no tiene «1RM»).
  const best = new Map<string, { name: string; e1rm: number; date: string }>();
  for (const w of workouts) {
    for (const e of w.exercises) {
      if (e.kind !== "weight_reps") continue;
      const v = bestE1rm(e.sets);
      if (v > (best.get(e.exerciseId)?.e1rm ?? 0)) best.set(e.exerciseId, { name: e.name, e1rm: v, date: w.date });
    }
  }
  [...best.values()]
    .sort((a, b) => b.e1rm - a.e1rm)
    .slice(0, 3)
    .forEach((b, i) =>
      out.push({ key: `best1rm${i + 1}`, label: `1RM ${b.name}`.slice(0, 40), value: fmtKg(Math.round(b.e1rm * 2) / 2), unit: "kg", detail: shortDate(b.date) }),
    );
  return out;
}

/** Huella para no volver a subir lo mismo (las tarjetas ya formateadas, en orden). */
export function statsFingerprint(stats: readonly PublicStat[]): string {
  return JSON.stringify(stats);
}

export const STATS_UPLOAD_EVERY_MS = 6 * 3600_000;

/** ¿Toca subir? Solo si cambió algo, y como mucho cada 6 h (el editor fuerza la subida al abrirse). */
export function shouldUploadStats(prev: { fingerprint: string; at: number } | null, next: string, now: number): boolean {
  if (!prev) return true;
  return prev.fingerprint !== next && now - prev.at >= STATS_UPLOAD_EVERY_MS;
}
