// DATOS DE EJEMPLO de running para la fase de diseño (sin Garmin ni servidor todavía).
import { addDays, todayKey } from "@/domain/dates";
import type { Activity, Lap, Planned, Step, Template } from "@/domain/running";

let n = 0;
const id = (p: string) => `${p}${++n}`;

const step = (
  kind: Step["kind"],
  duration: Step["duration"],
  target: Step["target"] = { type: "none" },
): Step => ({ id: id("s"), type: "step", kind, duration, target });

export const SEED_TEMPLATES: Template[] = [
  {
    id: "tpl-series-800",
    name: "Series 6×800",
    kind: "intervals",
    notes: "Recuperación trotando suave. Si el último 800 sale más de 10 s más lento, parar.",
    items: [
      step("warmup", { type: "time", seconds: 900 }),
      {
        id: id("r"),
        type: "repeat",
        times: 6,
        steps: [
          step("work", { type: "distance", meters: 800 }, { type: "pace", secPerKm: 235 }),
          step("recovery", { type: "distance", meters: 400 }),
        ],
      },
      step("cooldown", { type: "time", seconds: 600 }),
    ],
  },
  {
    id: "tpl-tirada-larga",
    name: "Tirada larga 18 km",
    kind: "long",
    items: [step("free", { type: "distance", meters: 18000 }, { type: "hr", zone: 2 })],
  },
  {
    id: "tpl-sprints",
    name: "Sprints 10×100",
    kind: "sprints",
    notes: "Al 95 %, salida desde parado. Recuperación completa caminando.",
    items: [
      step("warmup", { type: "time", seconds: 1200 }),
      {
        id: id("r"),
        type: "repeat",
        times: 10,
        steps: [
          step("work", { type: "distance", meters: 100 }, { type: "rpe", value: 9 }),
          step("recovery", { type: "time", seconds: 90 }),
        ],
      },
      step("cooldown", { type: "time", seconds: 600 }),
    ],
  },
  {
    id: "tpl-fartlek",
    name: "Fartlek 8×(1' fuerte / 1' suave)",
    kind: "fartlek",
    items: [
      step("warmup", { type: "time", seconds: 600 }),
      {
        id: id("r"),
        type: "repeat",
        times: 8,
        steps: [
          step("work", { type: "time", seconds: 60 }, { type: "pace", secPerKm: 250 }),
          step("recovery", { type: "time", seconds: 60 }),
        ],
      },
      step("cooldown", { type: "time", seconds: 600 }),
    ],
  },
  {
    id: "tpl-tempo",
    name: "Tempo 20 min",
    kind: "tempo",
    items: [
      step("warmup", { type: "time", seconds: 900 }),
      step("work", { type: "time", seconds: 1200 }, { type: "pace", secPerKm: 270 }),
      step("cooldown", { type: "time", seconds: 600 }),
    ],
  },
  {
    id: "tpl-rodaje",
    name: "Rodaje suave 8 km",
    kind: "easy",
    items: [step("free", { type: "distance", meters: 8000 }, { type: "hr", zone: 2 })],
  },
];

/** Ruta sintética (bucle) para probar el mapa; centrada en Murcia. */
export function fakeRoute(seed: number, points = 70): { lat: number; lon: number }[] {
  const out: { lat: number; lon: number }[] = [];
  for (let i = 0; i <= points; i++) {
    const t = (i / points) * Math.PI * 2;
    const wob = 1 + 0.18 * Math.sin(3 * t + seed) + 0.08 * Math.cos(5 * t + seed * 2);
    out.push({
      lat: 37.985 + 0.012 * wob * Math.sin(t),
      lon: -1.13 + 0.016 * wob * Math.cos(t) * (1 + 0.2 * Math.sin(t + seed)),
    });
  }
  return out;
}

function seriesLaps(): Lap[] {
  const laps: Lap[] = [{ index: 1, distanceM: 2500, durationS: 900, avgHr: 128, kind: "warmup" }];
  const work = [232, 234, 236, 235, 238, 241];
  work.forEach((sec, i) => {
    laps.push({ index: laps.length + 1, distanceM: 800, durationS: Math.round((800 / 1000) * sec), avgHr: 168 + i, kind: "work" });
    laps.push({ index: laps.length + 1, distanceM: 400, durationS: 150, avgHr: 150 - i, kind: "recovery" });
  });
  laps.push({ index: laps.length + 1, distanceM: 1600, durationS: 600, avgHr: 138, kind: "cooldown" });
  return laps;
}

export function seedActivities(today: string = todayKey()): Activity[] {
  const a = (
    daysAgo: number,
    title: string,
    km: number,
    min: number,
    extra: Partial<Activity> = {},
  ): Activity => ({
    id: `act-${daysAgo}`,
    date: addDays(today, -daysAgo),
    type: "run",
    source: "garmin",
    title,
    distanceM: Math.round(km * 1000),
    durationS: Math.round(min * 60),
    ...extra,
  });
  const withPlan = (x: Activity): Activity => {
    const tpl = SEED_TEMPLATES.find((t) => t.id === x.templateId);
    return tpl ? { ...x, plan: structuredClone(tpl) } : x;
  };
  return [
    // Sin `route`: simula lo que de verdad manda Garmin por Health Connect la mayoría de las
    // veces (no comparte GPS, ver AGENTS.md) — con `externalId` para que se vea como sincronizada
    // y dispare el botón "Ver recorrido" → aviso "sin ruta GPS" en vez de no pintarse nunca.
    a(2, "Rodaje suave", 6.8, 40.2, { avgHr: 140, maxHr: 153, ascentM: 22, kcal: 520, externalId: "hc-seed-sin-ruta" }),
    a(1, "Rodaje suave", 8.1, 47.5, { avgHr: 142, maxHr: 158, ascentM: 42, kcal: 610, route: fakeRoute(1) }),
    a(3, "Series 6×800", 9.6, 49.8, {
      avgHr: 158, maxHr: 179, ascentM: 31, kcal: 720, templateId: "tpl-series-800", laps: seriesLaps(), route: fakeRoute(2), rpe: 8,
      notes: "Buenas sensaciones hasta la quinta. La última se me atragantó.",
    }),
    a(5, "Tirada larga", 17.2, 100.4, { avgHr: 147, maxHr: 165, ascentM: 96, kcal: 1290, templateId: "tpl-tirada-larga", route: fakeRoute(3) }),
    a(8, "Rodaje suave", 7.4, 43.9, { avgHr: 140, maxHr: 155, ascentM: 25, kcal: 555, route: fakeRoute(4) }),
    a(10, "Tempo 20 min", 10.3, 54.6, { avgHr: 161, maxHr: 176, ascentM: 40, kcal: 780, templateId: "tpl-tempo", route: fakeRoute(5) }),
    a(12, "Tirada larga", 15.0, 89.2, { avgHr: 146, maxHr: 162, ascentM: 70, kcal: 1120, route: fakeRoute(6) }),
    a(15, "Rodaje suave", 6.5, 39.1, { avgHr: 139, maxHr: 152, ascentM: 20, kcal: 490 }),
    a(17, "Series 5×1000", 10.4, 55.3, { avgHr: 160, maxHr: 181, ascentM: 33, kcal: 800, laps: [], route: fakeRoute(7) }),
    a(19, "Rodaje suave", 8.0, 47.8, { avgHr: 143, maxHr: 157, ascentM: 38, kcal: 600 }),
    a(22, "Tirada larga", 14.1, 84.9, { avgHr: 145, maxHr: 160, ascentM: 60, kcal: 1050, route: fakeRoute(8) }),
    a(24, "Rodaje suave", 5.9, 36.2, { avgHr: 138, maxHr: 150, ascentM: 15, kcal: 440 }),
    a(27, "Fartlek", 8.8, 47.2, { avgHr: 155, maxHr: 176, ascentM: 28, kcal: 680, templateId: "tpl-fartlek", route: fakeRoute(9) }),
    a(31, "Rodaje suave", 7.0, 42.7, { avgHr: 141, maxHr: 154, ascentM: 30, kcal: 530 }),
    a(36, "Tirada larga", 13.0, 80.1, { avgHr: 144, maxHr: 158, ascentM: 55, kcal: 970 }),
    a(41, "Series 6×800", 9.1, 50.7, { avgHr: 157, maxHr: 177, ascentM: 30, kcal: 690, templateId: "tpl-series-800" }),
    a(45, "Rodaje suave", 6.0, 36.9, { avgHr: 137, maxHr: 149, ascentM: 18, kcal: 450 }),
  ].map(withPlan);
}

export function seedPlanned(today: string = todayKey()): Planned[] {
  return [
    // Pasados: uno cumplido (enlazado con la sesión del reloj) y otro sin registrar.
    { id: "plan-p1", date: addDays(today, -3), templateId: "tpl-series-800", activityId: "act-3" },
    { id: "plan-p2", date: addDays(today, -6), templateId: "tpl-rodaje" },
    { id: "plan-1", date: addDays(today, 1), templateId: "tpl-series-800" },
    { id: "plan-2", date: addDays(today, 3), templateId: "tpl-rodaje" },
    { id: "plan-3", date: addDays(today, 5), templateId: "tpl-tirada-larga" },
  ];
}
