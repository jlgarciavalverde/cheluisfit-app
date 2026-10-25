// Fútbol: partidos (del Garmin vía Health Connect `SOCCER`, o registrados a mano) con su
// resultado y lo que hiciste. Viven en `useRunning().matches` (mismo blob `cf_running_v1`, sin
// clave de sincronización nueva), aparte de `activities` para no mezclarlos con el running.
// Puro y con tests (`football.test.ts`).
import type { StoredAnalysis } from "./analysis";
import { addDays } from "./dates";
import { fmtDuration, fmtKm } from "./format";
import { hrZoneOf } from "./running";

export const POSITIONS = ["portero", "defensa", "medio", "delantero"] as const;
export type Position = (typeof POSITIONS)[number];
export const POSITION_LABEL: Record<Position, string> = { portero: "Portero", defensa: "Defensa", medio: "Medio", delantero: "Delantero" };

export const FORMATS = ["11", "7", "5", "sala"] as const;
export type Format = (typeof FORMATS)[number];
export const FORMAT_LABEL: Record<Format, string> = { "11": "Fútbol 11", "7": "Fútbol 7", "5": "Fútbol 5", sala: "Sala" };

export interface Match {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  source: "garmin" | "manual";
  title: string;
  /** Segundos jugados (en movimiento, si viene del reloj). */
  durationS: number;
  distanceM?: number;
  avgHr?: number;
  maxHr?: number;
  kcal?: number;
  /** Id del registro de Health Connect: evita duplicar al resincronizar. */
  externalId?: string;
  goalsFor?: number;
  goalsAgainst?: number;
  /** Goles y asistencias tuyos. */
  goals?: number;
  assists?: number;
  position?: Position;
  format?: Format;
  /** Esfuerzo percibido 1–10. */
  rpe?: number;
  notes?: string;
  analysis?: StoredAnalysis;
}

export type Outcome = "win" | "draw" | "loss";
export const OUTCOME_LABEL: Record<Outcome, string> = { win: "Victoria", draw: "Empate", loss: "Derrota" };

export function outcomeOf(m: Pick<Match, "goalsFor" | "goalsAgainst">): Outcome | null {
  if (m.goalsFor == null || m.goalsAgainst == null) return null;
  return m.goalsFor > m.goalsAgainst ? "win" : m.goalsFor < m.goalsAgainst ? "loss" : "draw";
}

export function scoreText(m: Pick<Match, "goalsFor" | "goalsAgainst">): string | null {
  return m.goalsFor == null || m.goalsAgainst == null ? null : `${m.goalsFor} – ${m.goalsAgainst}`;
}

/** Partidos del reloj que todavía no estaban (por `externalId`, igual que `mergeImportedActivities`). */
export function mergeImportedMatches(
  existing: readonly Match[],
  imported: readonly Omit<Match, "id">[],
  makeId: () => string,
  dismissed: readonly string[] = [],
): { matches: Match[]; addedCount: number } {
  const known = new Set([...existing.map((m) => m.externalId).filter((x): x is string => !!x), ...dismissed]);
  const fresh = imported.filter((m) => !m.externalId || !known.has(m.externalId));
  return { matches: [...fresh.map((m) => ({ ...m, id: makeId() })), ...existing], addedCount: fresh.length };
}

export interface FootballSummary {
  matches: number;
  minutes: number;
  goals: number;
  assists: number;
  wins: number;
  draws: number;
  losses: number;
  /** Media de km por partido (solo los que tienen distancia). */
  avgKm: number | null;
  avgHr: number | null;
}

export function footballSummary(matches: readonly Match[]): FootballSummary {
  const withKm = matches.filter((m) => (m.distanceM ?? 0) > 0);
  const withHr = matches.filter((m) => m.avgHr);
  const outcomes = matches.map(outcomeOf);
  return {
    matches: matches.length,
    minutes: Math.round(matches.reduce((s, m) => s + m.durationS, 0) / 60),
    goals: matches.reduce((s, m) => s + (m.goals ?? 0), 0),
    assists: matches.reduce((s, m) => s + (m.assists ?? 0), 0),
    wins: outcomes.filter((o) => o === "win").length,
    draws: outcomes.filter((o) => o === "draw").length,
    losses: outcomes.filter((o) => o === "loss").length,
    avgKm: withKm.length ? Math.round((withKm.reduce((s, m) => s + (m.distanceM ?? 0), 0) / withKm.length / 1000) * 10) / 10 : null,
    avgHr: withHr.length ? Math.round(withHr.reduce((s, m) => s + (m.avgHr ?? 0), 0) / withHr.length) : null,
  };
}

/** Partidos de un mes (`YYYY-MM`). */
export const inMonth = (matches: readonly Match[], month: string) => matches.filter((m) => m.date.startsWith(month));

/** Texto con los datos del partido para el análisis de la IA (los números los pone el código). */
export function matchAnalysisData(m: Match, all: readonly Match[], maxHr: number): string {
  const lines: string[] = [];
  const score = scoreText(m);
  const outcome = outcomeOf(m);
  lines.push(
    `Partido «${m.title}» del ${m.date}${m.format ? ` (${FORMAT_LABEL[m.format]})` : ""}: ${fmtDuration(m.durationS)} jugados` +
      (m.distanceM ? `, ${fmtKm(m.distanceM)} km recorridos` : "") +
      (score ? `, resultado ${score} (${OUTCOME_LABEL[outcome!].toLowerCase()})` : "") +
      ".",
  );
  const mine: string[] = [];
  if (m.position) mine.push(`posición ${POSITION_LABEL[m.position].toLowerCase()}`);
  if (m.goals != null) mine.push(`${m.goals} ${m.goals === 1 ? "gol" : "goles"}`);
  if (m.assists != null) mine.push(`${m.assists} ${m.assists === 1 ? "asistencia" : "asistencias"}`);
  if (m.rpe) mine.push(`esfuerzo percibido ${m.rpe}/10`);
  if (mine.length) lines.push(`La persona: ${mine.join(", ")}.`);
  const hr: string[] = [];
  if (m.avgHr) hr.push(`FC media ${m.avgHr} ppm (zona ${hrZoneOf(m.avgHr, maxHr)} de 5, FC máx. de referencia ${maxHr})`);
  if (m.maxHr) hr.push(`FC máxima ${m.maxHr} ppm`);
  if (m.kcal) hr.push(`${Math.round(m.kcal)} kcal activas`);
  if (hr.length) lines.push(`${hr.join(", ")}.`);

  const prev = all.filter((x) => x.id !== m.id && x.date < m.date && x.date >= addDays(m.date, -90));
  if (prev.length) {
    const s = footballSummary(prev);
    lines.push(
      `Últimos 3 meses antes de este partido: ${s.matches} partidos, ${s.goals} goles, ${s.assists} asistencias, balance ${s.wins}-${s.draws}-${s.losses}` +
        (s.avgKm != null ? `, ${String(s.avgKm).replace(".", ",")} km de media` : "") +
        (s.avgHr != null ? `, FC media ${s.avgHr}` : "") +
        ".",
    );
  } else lines.push("Primer partido registrado en los últimos 3 meses.");
  const days = all.filter((x) => x.id !== m.id && x.date < m.date).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (days) lines.push(`Partido anterior: ${days.date}.`);
  if (m.notes) lines.push(`Notas de la persona: ${m.notes}`);
  return lines.join("\n");
}
