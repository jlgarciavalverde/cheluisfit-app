// Dominio de running: plantillas de entrenamiento, sesiones y estimaciones. Puro.
import { fmtPace } from "./format";
import { compactRoute } from "./route";

export type StepKind = "warmup" | "work" | "recovery" | "cooldown" | "free";

export const STEP_LABEL: Record<StepKind, string> = {
  warmup: "Calentamiento",
  work: "Trabajo",
  recovery: "Recuperación",
  cooldown: "Enfriamiento",
  free: "Libre",
};

export type StepDuration =
  | { type: "distance"; meters: number }
  | { type: "time"; seconds: number }
  | { type: "open" };

export type StepTarget =
  | { type: "none" }
  | { type: "pace"; secPerKm: number }
  | { type: "hr"; zone: 1 | 2 | 3 | 4 | 5 }
  | { type: "rpe"; value: number };

export interface Step {
  id: string;
  type: "step";
  kind: StepKind;
  duration: StepDuration;
  target: StepTarget;
}

export interface Repeat {
  id: string;
  type: "repeat";
  times: number;
  steps: Step[];
}

export type TemplateItem = Step | Repeat;

export type TemplateKind = "intervals" | "long" | "sprints" | "fartlek" | "tempo" | "easy" | "custom";

export const TEMPLATE_KIND_LABEL: Record<TemplateKind, string> = {
  intervals: "Series",
  long: "Tirada larga",
  sprints: "Sprints",
  fartlek: "Fartlek",
  tempo: "Tempo",
  easy: "Rodaje suave",
  custom: "Personalizada",
};

export interface Template {
  id: string;
  name: string;
  kind: TemplateKind;
  items: TemplateItem[];
  notes?: string;
}

/** Ritmo que se supone para pasos sin objetivo de ritmo (6:00/km). */
export const DEFAULT_PACE = 360;

/** Pasos planos de la plantilla, con las repeticiones desplegadas. */
export function flattenTemplate(t: Template): Step[] {
  const out: Step[] = [];
  for (const it of t.items) {
    if (it.type === "step") out.push(it);
    else for (let i = 0; i < it.times; i++) out.push(...it.steps);
  }
  return out;
}

export function stepEstimate(step: Step, defaultPace = DEFAULT_PACE): { meters: number; seconds: number } {
  const pace = step.target.type === "pace" ? step.target.secPerKm : defaultPace;
  if (step.duration.type === "distance") {
    return { meters: step.duration.meters, seconds: (step.duration.meters / 1000) * pace };
  }
  if (step.duration.type === "time") {
    return { meters: (step.duration.seconds / pace) * 1000, seconds: step.duration.seconds };
  }
  return { meters: 0, seconds: 0 };
}

/** Distancia y tiempo estimados de la plantilla (los pasos «abiertos» no cuentan). */
export function estimateTemplate(t: Template, defaultPace = DEFAULT_PACE): { meters: number; seconds: number; hasOpen: boolean } {
  let meters = 0;
  let seconds = 0;
  let hasOpen = false;
  for (const s of flattenTemplate(t)) {
    if (s.duration.type === "open") hasOpen = true;
    const e = stepEstimate(s, defaultPace);
    meters += e.meters;
    seconds += e.seconds;
  }
  return { meters: Math.round(meters), seconds: Math.round(seconds), hasOpen };
}

const HR_ZONE_LABEL = ["", "Z1", "Z2", "Z3", "Z4", "Z5"];

export function describeDuration(d: StepDuration): string {
  if (d.type === "open") return "Abierto";
  if (d.type === "distance") return d.meters >= 1000 && d.meters % 100 === 0 ? `${String(d.meters / 1000).replace(".", ",")} km` : `${d.meters} m`;
  const m = Math.floor(d.seconds / 60);
  const s = d.seconds % 60;
  if (s === 0) return `${m} min`;
  return m === 0 ? `${s} s` : `${m}:${String(s).padStart(2, "0")} min`;
}

export function describeTarget(t: StepTarget): string {
  switch (t.type) {
    case "none":
      return "";
    case "pace":
      return `${fmtPace(t.secPerKm)}/km`;
    case "hr":
      return `FC ${HR_ZONE_LABEL[t.zone]}`;
    case "rpe":
      return `RPE ${t.value}`;
  }
}

export function describeStep(s: Step): string {
  return [STEP_LABEL[s.kind], describeDuration(s.duration), describeTarget(s.target)].filter(Boolean).join(" · ");
}

/** «mm:ss» o minutos sueltos → segundos. `null` si no es válido. */
export function parseClock(text: string): number | null {
  const t = text.trim().replace(",", ".");
  if (!t) return null;
  if (t.includes(":")) {
    const [a, b, c] = t.split(":").map((x) => Number(x));
    if ([a, b].some((x) => !Number.isFinite(x)) || (c !== undefined && !Number.isFinite(c))) return null;
    if (c !== undefined) return a * 3600 + b * 60 + c;
    if (b < 0 || b >= 60) return null;
    return a * 60 + b;
  }
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 60) : null;
}

/** Ritmo «m:ss» → segundos por km, entre 2:00 y 15:00. */
export function parsePace(text: string): number | null {
  const s = parseClock(text.includes(":") ? text : `${text}:00`);
  return s !== null && s >= 120 && s <= 900 ? s : null;
}

// ------------------------------------------------------------------ Sesiones

export interface Lap {
  index: number;
  distanceM: number;
  durationS: number;
  avgHr?: number;
  kind?: StepKind;
}

export interface Activity {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  type: "run" | "walk";
  /** `strava` sustituye a `garmin` para carreras/caminatas: trae ruta+FC+calorías en una sola
   *  fuente, algo que Health Connect nunca expone (Garmin no comparte GPS por ahí). */
  source: "garmin" | "strava" | "manual";
  title: string;
  distanceM: number;
  durationS: number;
  avgHr?: number;
  maxHr?: number;
  ascentM?: number;
  kcal?: number;
  /** Id del registro de origen (Health Connect o `strava-<id>`), solo en `garmin`/`strava` — evita duplicar al resincronizar. */
  externalId?: string;
  templateId?: string;
  /**
   * Copia de la plantilla tal como estaba al hacer la sesión: editar o borrar la
   * plantilla después no cambia la comparación plan vs. real del pasado.
   */
  plan?: Template;
  laps?: Lap[];
  /** Ruta simplificada (lat/lon), si el reloj/Strava la aportó. */
  route?: { lat: number; lon: number }[];
  rpe?: number;
  notes?: string;
}

/** Texto de la fuente de una actividad — el icono queda en cada pantalla (evita importar tipos de UI en el dominio). */
export const SOURCE_LABEL: Record<Activity["source"], string> = { garmin: "Garmin", strava: "Strava", manual: "Manual" };

export interface Planned {
  id: string;
  date: string;
  templateId: string;
  /** Sesión que cumplió este plan (se enlaza sola por día o a mano). */
  activityId?: string;
}

export function avgPace(a: Pick<Activity, "distanceM" | "durationS">): number {
  return a.distanceM > 0 ? a.durationS / (a.distanceM / 1000) : 0;
}

export type RunningPRType = "longest" | "fastest_pace" | "5k" | "10k" | "half_marathon";

export const RUNNING_PR_LABEL: Record<RunningPRType, string> = {
  longest: "Más larga",
  fastest_pace: "Mejor ritmo (≥ 1 km)",
  "5k": "Mejor 5 km",
  "10k": "Mejor 10 km",
  half_marathon: "Mejor media maratón",
};

/** Tolerancia real: nadie corre exactamente 5.000,0 m — se acepta un rango razonable alrededor
 *  de la distancia oficial (mismo criterio que usan apps de referencia como Strava). */
const DISTANCE_BUCKETS: { type: Extract<RunningPRType, "5k" | "10k" | "half_marathon">; officialM: number; maxM: number }[] = [
  { type: "5k", officialM: 5000, maxM: 5500 },
  { type: "10k", officialM: 10000, maxM: 11000 },
  { type: "half_marathon", officialM: 21097, maxM: 22500 },
];
/** Hay que haber cubierto al menos el 98 % de la distancia: 4,5 km no son un 5K. */
const MIN_BUCKET_FRACTION = 0.98;

/**
 * Tiempo de una carrera llevado a la distancia oficial (5.000 m, 10.000 m, 21.097 m): una de
 * 5,3 km en 26:30 cuenta como 25:00 de 5K. Es lo que se compara y lo que se enseña como marca.
 */
export function prTimeS(a: Pick<Activity, "distanceM" | "durationS">, type: Extract<RunningPRType, "5k" | "10k" | "half_marathon">): number {
  const b = DISTANCE_BUCKETS.find((x) => x.type === type)!;
  return a.distanceM > 0 ? Math.round((a.durationS * b.officialM) / a.distanceM) : a.durationS;
}

/**
 * Marcas de running a partir del historial: la más larga, el mejor ritmo (carreras ≥1 km, para
 * no dejar que un sprint corto de prueba falsee el ritmo) y el mejor tiempo en cada distancia
 * estándar (5K/10K/media maratón, por rango — ver `DISTANCE_BUCKETS`). Solo cuenta `type: "run"`
 * (caminatas no compiten por ritmo). `null` en cualquier marca sin datos suficientes todavía.
 */
export function runningPRs(activities: readonly Activity[]): Record<RunningPRType, Activity | null> {
  const runs = activities.filter((a) => a.type === "run");
  const longest = [...runs].sort((a, b) => b.distanceM - a.distanceM)[0] ?? null;
  const pacedRuns = runs.filter((a) => a.distanceM >= 1000);
  const fastest_pace = [...pacedRuns].filter((a) => a.durationS > 0).sort((a, b) => avgPace(a) - avgPace(b))[0] ?? null;
  const byBucket: Record<Extract<RunningPRType, "5k" | "10k" | "half_marathon">, Activity | null> = { "5k": null, "10k": null, half_marathon: null };
  for (const bucket of DISTANCE_BUCKETS) {
    // Antes se aceptaba desde 4,5 km y ganaba la de menos tiempo: una carrera más corta batía a un
    // 5K de verdad más rápido. Ahora: distancia casi completa y tiempo llevado a la oficial.
    const inBucket = runs.filter((a) => a.durationS > 0 && a.distanceM >= bucket.officialM * MIN_BUCKET_FRACTION && a.distanceM <= bucket.maxM);
    byBucket[bucket.type] = [...inBucket].sort((a, b) => prTimeS(a, bucket.type) - prTimeS(b, bucket.type))[0] ?? null;
  }
  return { longest, fastest_pace, ...byBucket };
}

/** Lunes de la semana (ISO) de una fecha YYYY-MM-DD. */
export function weekStart(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d, 12);
  const dow = (dt.getDay() + 6) % 7; // lunes = 0
  dt.setDate(dt.getDate() - dow);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export interface WeekTotals {
  weekStart: string;
  meters: number;
  seconds: number;
  /** Segundos solo de las carreras con distancia: el denominador bueno para el ritmo. */
  pacedSeconds: number;
  sessions: number;
}

/**
 * Totales de las últimas `weeks` semanas (la más reciente al final), incluidas las vacías.
 * Solo carreras: mezclar el ritmo de una caminata con el de una carrera no tendría sentido en
 * estas gráficas. Las caminatas siguen viéndose como tarjetas normales en el historial.
 */
export function weeklyTotals(acts: readonly Activity[], today: string, weeks: number): WeekTotals[] {
  const current = weekStart(today);
  const out: WeekTotals[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const [y, m, d] = current.split("-").map(Number);
    const dt = new Date(y, m - 1, d - 7 * i, 12);
    const p = (n: number) => String(n).padStart(2, "0");
    out.push({ weekStart: `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`, meters: 0, seconds: 0, pacedSeconds: 0, sessions: 0 });
  }
  for (const a of acts) {
    if (a.type !== "run") continue;
    const w = out.find((x) => x.weekStart === weekStart(a.date));
    if (w) {
      w.meters += a.distanceM;
      w.seconds += a.durationS;
      // Para el ritmo solo cuenta el tiempo de las carreras con distancia (cinta sin distancia,
      // permiso de distancia denegado): si no, el ritmo semanal salía más lento de lo real.
      if (a.distanceM > 0) w.pacedSeconds += a.durationS;
      w.sessions += 1;
    }
  }
  return out;
}

/** Distancia por día de la semana de `today` (lunes…domingo), en metros. Solo carreras (ver `weeklyTotals`). */
export function dailyMeters(acts: readonly Activity[], today: string): number[] {
  const start = weekStart(today);
  const out = [0, 0, 0, 0, 0, 0, 0];
  for (const a of acts) {
    if (a.type !== "run" || weekStart(a.date) !== start) continue;
    const [y, m, d] = a.date.split("-").map(Number);
    out[(new Date(y, m - 1, d, 12).getDay() + 6) % 7] += a.distanceM;
  }
  return out;
}

/**
 * Añade lo importado de Health Connect a las actividades ya guardadas, sin duplicar por
 * `externalId` (una sesión ya importada en un sync anterior no vuelve a entrar). Pura, para
 * poder probarla sin la tienda/AsyncStorage de por medio.
 */
export function mergeImportedActivities(
  existing: readonly Activity[],
  imported: readonly Omit<Activity, "id">[],
  makeId: () => string,
  /** `externalId` que la persona borró a propósito: no se vuelven a importar. */
  dismissed: readonly string[] = [],
): { activities: Activity[]; addedCount: number } {
  const known = new Set([...existing.map((a) => a.externalId).filter((x): x is string => !!x), ...dismissed]);
  const fresh = imported.filter((a) => !a.externalId || !known.has(a.externalId));
  const added = fresh.map((a) => ({ ...a, id: makeId(), route: compactRoute(a.route) }));
  return { activities: [...added, ...existing], addedCount: fresh.length };
}

/**
 * Comparación plan vs. real: cuántas repeticiones de «trabajo» se completaron
 * según las vueltas del reloj, y su ritmo medio.
 */
export function planVsActual(t: Template, a: Activity): { plannedReps: number; doneReps: number; avgWorkPace: number | null } | null {
  if (!a.laps?.length) return null;
  const plannedWork = flattenTemplate(t).filter((s) => s.kind === "work");
  if (plannedWork.length === 0) return null;
  const done = a.laps.filter((l) => l.kind === "work");
  const dist = done.reduce((x, l) => x + l.distanceM, 0);
  const time = done.reduce((x, l) => x + l.durationS, 0);
  return {
    plannedReps: plannedWork.length,
    doneReps: Math.min(done.length, plannedWork.length),
    avgWorkPace: dist > 0 ? time / (dist / 1000) : null,
  };
}

// ------------------------------------------------------------ Edición de plantillas

let counter = 0;
export function makeId(prefix = "i"): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter}${Math.random().toString(36).slice(2, 5)}`;
}

export function newStep(kind: StepKind = "work"): Step {
  return {
    id: makeId("s"),
    type: "step",
    kind,
    duration: kind === "warmup" || kind === "cooldown" ? { type: "time", seconds: 600 } : { type: "distance", meters: 1000 },
    target: { type: "none" },
  };
}

export function newRepeat(): Repeat {
  return {
    id: makeId("r"),
    type: "repeat",
    times: 4,
    steps: [
      { ...newStep("work"), duration: { type: "distance", meters: 400 } },
      { ...newStep("recovery"), duration: { type: "distance", meters: 200 } },
    ],
  };
}

/** Copia profunda con ids nuevos (para duplicar plantillas o partir de una base). */
export function cloneItems(items: readonly TemplateItem[]): TemplateItem[] {
  return items.map((it) =>
    it.type === "step"
      ? { ...it, id: makeId("s"), duration: { ...it.duration }, target: { ...it.target } }
      : { ...it, id: makeId("r"), steps: it.steps.map((s) => ({ ...s, id: makeId("s"), duration: { ...s.duration }, target: { ...s.target } })) },
  );
}

/** Mueve el elemento `index` una posición arriba (−1) o abajo (+1); devuelve una lista nueva. */
export function moveItem<T>(list: readonly T[], index: number, delta: -1 | 1): T[] {
  const to = index + delta;
  if (to < 0 || to >= list.length) return [...list];
  const out = [...list];
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

/** Problemas que impiden guardar una plantilla (lista vacía = válida). */
export function templateProblems(t: Pick<Template, "name" | "items">): string[] {
  const p: string[] = [];
  if (!t.name.trim()) p.push("Ponle un nombre");
  if (t.items.length === 0) p.push("Añade al menos un paso");
  for (const it of t.items) if (it.type === "repeat" && it.steps.length === 0) p.push("Un bloque de repeticiones está vacío");
  return p;
}

// ------------------------------------------------------------ Zonas de frecuencia cardiaca

export function defaultMaxHr(age: number): number {
  return Math.max(120, 220 - Math.round(age));
}

/** Límites de cada zona como % de la FC máxima (Z1 50–60 %, … Z5 90–100 %). */
const ZONE_PCT: [number, number][] = [
  [0.5, 0.6],
  [0.6, 0.7],
  [0.7, 0.8],
  [0.8, 0.9],
  [0.9, 1.0],
];

export function hrZoneRange(zone: 1 | 2 | 3 | 4 | 5, maxHr: number): { from: number; to: number } {
  const [a, b] = ZONE_PCT[zone - 1];
  return { from: Math.round(maxHr * a), to: Math.round(maxHr * b) };
}

/** Zona a la que pertenece una FC; por debajo del 50 % → 0 (sin zona). */
export function hrZoneOf(hr: number, maxHr: number): 0 | 1 | 2 | 3 | 4 | 5 {
  const r = hr / maxHr;
  if (r < 0.5) return 0;
  if (r < 0.6) return 1;
  if (r < 0.7) return 2;
  if (r < 0.8) return 3;
  if (r < 0.9) return 4;
  return 5;
}

// ------------------------------------------------------------ Plan ↔ sesiones

/** Enlaza una sesión con una plantilla y guarda la copia del plan de ese momento. */
/**
 * Vincula la sesión con la plantilla (guarda su copia). Si el reloj trae tantas vueltas como pasos
 * tiene la plantilla, cada vuelta recibe el tipo de su paso (calentamiento, trabajo…): sin eso,
 * «plan vs. real» nunca funcionaba con datos reales, porque ningún reloj dice qué vuelta era de
 * trabajo.
 */
export function applyTemplate(a: Activity, t: Template): Activity {
  const steps = flattenTemplate(t);
  const laps = a.laps && a.laps.length === steps.length ? a.laps.map((l, i) => (l.kind ? l : { ...l, kind: steps[i]!.kind })) : a.laps;
  return { ...a, templateId: t.id, plan: structuredClone(t), ...(laps ? { laps } : {}) };
}

export function clearTemplate(a: Activity): Activity {
  const { plan: _plan, templateId: _templateId, ...rest } = a;
  return rest;
}

/**
 * Empareja cada entrenamiento planificado (hasta hoy) con una sesión del mismo día.
 * Prefiere la sesión que ya lleva esa plantilla y, si no, la más larga; una sesión
 * solo cumple un plan.
 */
export function matchPlanned(
  planned: readonly Planned[],
  activities: readonly Activity[],
  today: string,
): { plannedId: string; activityId: string }[] {
  const used = new Set(planned.filter((p) => p.activityId).map((p) => p.activityId as string));
  const out: { plannedId: string; activityId: string }[] = [];
  const pending = [...planned].sort((a, b) => a.date.localeCompare(b.date)).filter((p) => !p.activityId && p.date <= today);
  // Solo carreras: una caminata sincronizada antes que la carrera del mismo día se llevaba el plan.
  const runsOn = (date: string) => activities.filter((a) => a.date === date && a.type === "run" && !used.has(a.id));
  const take = (p: Planned, a: Activity) => {
    used.add(a.id);
    out.push({ plannedId: p.id, activityId: a.id });
  };
  // 1.ª pasada: la sesión que ya lleva la plantilla de ese plan (con dos planes el mismo día, cada
  // uno se queda con la suya en vez de que el primero se lleve la más larga).
  const left: Planned[] = [];
  for (const p of pending) {
    const exact = runsOn(p.date).find((a) => a.templateId === p.templateId);
    if (exact) take(p, exact);
    else left.push(p);
  }
  // 2.ª pasada: lo que quede, con la carrera más larga de ese día.
  for (const p of left) {
    const pick = [...runsOn(p.date)].sort((a, b) => b.distanceM - a.distanceM)[0];
    if (pick) take(p, pick);
  }
  return out;
}

// ------------------------------------------------------------ Registro manual

export interface ManualRunInput {
  distanceKm: number | null;
  durationS: number | null;
  avgHr: number | null;
}

export interface ManualRunCheck {
  ok: boolean;
  problems: string[];
  /** Avisos que no impiden guardar (ritmo poco creíble). */
  warnings: string[];
  paceSecPerKm: number | null;
}

export function checkManualRun(i: ManualRunInput & { type?: "run" | "walk" }): ManualRunCheck {
  const problems: string[] = [];
  const warnings: string[] = [];
  if (i.distanceKm === null || i.distanceKm <= 0) problems.push("Indica la distancia");
  else if (i.distanceKm > 250) problems.push("Distancia demasiado grande");
  if (i.durationS === null || i.durationS <= 0) problems.push("Indica el tiempo");
  else if (i.durationS > 24 * 3600) problems.push("El tiempo supera las 24 horas");
  if (i.avgHr !== null && (i.avgHr < 30 || i.avgHr > 230)) problems.push("Frecuencia cardiaca fuera de rango");
  let pace: number | null = null;
  if (i.distanceKm && i.durationS && i.distanceKm > 0 && i.durationS > 0) {
    pace = i.durationS / i.distanceKm;
    if (pace < 150) warnings.push("Ese ritmo es más rápido que 2:30/km: revisa distancia y tiempo");
    else if (pace > (i.type === "walk" ? 1500 : 720)) warnings.push(i.type === "walk" ? "Ese ritmo es más lento que 25:00/km: revisa distancia y tiempo" : "Ese ritmo es más lento que 12:00/km: revisa distancia y tiempo");
  }
  return { ok: problems.length === 0, problems, warnings, paceSecPerKm: pace };
}
