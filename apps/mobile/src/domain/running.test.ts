import { describe, expect, it } from "vitest";
import {
  type Activity,
  avgPace,
  dailyMeters,
  describeStep,
  estimateTemplate,
  flattenTemplate,
  mergeImportedActivities,
  parseClock,
  parsePace,
  planVsActual,
  runningPRs,
  type Template,
  weeklyTotals,
  weekStart,
} from "./running";

const series: Template = {
  id: "t1",
  name: "Series 6×800",
  kind: "intervals",
  items: [
    { id: "a", type: "step", kind: "warmup", duration: { type: "time", seconds: 900 }, target: { type: "none" } },
    {
      id: "r",
      type: "repeat",
      times: 6,
      steps: [
        { id: "w", type: "step", kind: "work", duration: { type: "distance", meters: 800 }, target: { type: "pace", secPerKm: 235 } },
        { id: "x", type: "step", kind: "recovery", duration: { type: "distance", meters: 400 }, target: { type: "none" } },
      ],
    },
    { id: "c", type: "step", kind: "cooldown", duration: { type: "time", seconds: 600 }, target: { type: "none" } },
  ],
};

describe("plantillas", () => {
  it("despliega las repeticiones", () => {
    expect(flattenTemplate(series)).toHaveLength(1 + 12 + 1);
  });

  it("estima distancia y tiempo", () => {
    const e = estimateTemplate(series);
    // calentar 15 min a 6:00 = 2.500 m · 6×(800 m + 400 m) = 7.200 m · enfriar 10 min = 1.667 m
    expect(e.meters).toBe(2500 + 7200 + 1667);
    // 900 + 6×(800·0,235 + 400·0,36) + 600 = 900 + 6×(188+144) + 600 = 3.492
    expect(e.seconds).toBe(3492);
    expect(e.hasOpen).toBe(false);
  });

  it("los pasos abiertos no suman y se avisa", () => {
    const t: Template = { ...series, items: [{ id: "f", type: "step", kind: "free", duration: { type: "open" }, target: { type: "none" } }] };
    expect(estimateTemplate(t)).toEqual({ meters: 0, seconds: 0, hasOpen: true });
  });

  it("describe un paso", () => {
    const rep = series.items[1];
    if (rep.type !== "repeat") throw new Error("se esperaba un bloque de repeticiones");
    const work = rep.steps[0];
    expect(describeStep(work)).toBe("Trabajo · 800 m · 3:55/km");
  });
});

describe("entradas de tiempo y ritmo", () => {
  it("acepta mm:ss, h:mm:ss y minutos", () => {
    expect(parseClock("1:30")).toBe(90);
    expect(parseClock("15")).toBe(900);
    expect(parseClock("1:02:03")).toBe(3723);
    expect(parseClock("12,5")).toBe(750);
    expect(parseClock("abc")).toBeNull();
    expect(parseClock("1:75")).toBeNull();
    expect(parseClock("")).toBeNull();
  });

  it("valida el ritmo entre 2:00 y 15:00 por km", () => {
    expect(parsePace("3:55")).toBe(235);
    expect(parsePace("5")).toBe(300);
    expect(parsePace("1:00")).toBeNull();
    expect(parsePace("20:00")).toBeNull();
  });
});

const act = (id: string, date: string, km: number, min: number, extra: Partial<Activity> = {}): Activity => ({
  id,
  date,
  type: "run",
  source: "garmin",
  title: "Rodaje",
  distanceM: km * 1000,
  durationS: min * 60,
  ...extra,
});

describe("sesiones y semanas", () => {
  it("calcula el lunes de la semana", () => {
    expect(weekStart("2026-09-21")).toBe("2026-09-21"); // lunes
    expect(weekStart("2026-09-27")).toBe("2026-09-21"); // domingo
    expect(weekStart("2026-09-20")).toBe("2026-09-14");
  });

  it("totales semanales con semanas vacías", () => {
    const acts = [act("a", "2026-09-21", 10, 55), act("b", "2026-09-19", 5, 28), act("c", "2026-09-05", 8, 45)];
    const w = weeklyTotals(acts, "2026-09-21", 4);
    expect(w).toHaveLength(4);
    expect(w[3]).toMatchObject({ weekStart: "2026-09-21", meters: 10000, sessions: 1 });
    expect(w[2]).toMatchObject({ weekStart: "2026-09-14", meters: 5000 });
    expect(w[1].meters).toBe(0);
    expect(w[0]).toMatchObject({ weekStart: "2026-08-31", meters: 8000 });
  });

  it("distancia por día de la semana", () => {
    const d = dailyMeters([act("a", "2026-09-23", 6, 33), act("b", "2026-09-21", 4, 22)], "2026-09-21");
    expect(d).toEqual([4000, 0, 6000, 0, 0, 0, 0]);
  });

  it("las caminatas no entran en los totales semanales ni en la distancia por día (solo carreras)", () => {
    const walk = act("w", "2026-09-21", 3, 40, { type: "walk" });
    const run = act("r", "2026-09-21", 10, 55);
    expect(weeklyTotals([walk, run], "2026-09-21", 1)[0]).toMatchObject({ meters: 10000, sessions: 1 });
    expect(dailyMeters([walk, run], "2026-09-21")).toEqual([10000, 0, 0, 0, 0, 0, 0]);
  });

  it("ritmo medio", () => {
    expect(avgPace(act("a", "2026-09-21", 10, 52.5))).toBe(315);
    expect(avgPace({ distanceM: 0, durationS: 0 })).toBe(0);
  });

  it("plan vs. real a partir de las vueltas", () => {
    const a = act("a", "2026-09-15", 9, 48, {
      laps: [
        { index: 1, distanceM: 800, durationS: 190, kind: "work" },
        { index: 2, distanceM: 400, durationS: 150, kind: "recovery" },
        { index: 3, distanceM: 800, durationS: 186, kind: "work" },
      ],
    });
    const r = planVsActual(series, a);
    expect(r?.plannedReps).toBe(6);
    expect(r?.doneReps).toBe(2);
    expect(Math.round(r?.avgWorkPace ?? 0)).toBe(235);
    expect(planVsActual(series, act("b", "2026-09-15", 5, 30))).toBeNull();
  });

  it("la comparación usa la copia del plan, no la plantilla actual", () => {
    const edited: Template = { ...series, items: series.items.map((it) => (it.type === "repeat" ? { ...it, times: 7 } : it)) };
    const a = act("a", "2026-09-15", 9, 48, {
      plan: series,
      laps: Array.from({ length: 6 }, (_, i) => ({ index: i + 1, distanceM: 800, durationS: 188, kind: "work" as const })),
    });
    expect(planVsActual(a.plan ?? edited, a)?.plannedReps).toBe(6);
    expect(planVsActual(edited, a)?.plannedReps).toBe(7);
  });
});

import { cloneItems, moveItem, newRepeat, newStep, templateProblems } from "./running";

describe("edición de plantillas", () => {
  it("mueve elementos sin salirse de la lista", () => {
    expect(moveItem([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveItem([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
    expect(moveItem([1, 2, 3], 0, -1)).toEqual([1, 2, 3]);
    expect(moveItem([1, 2, 3], 2, 1)).toEqual([1, 2, 3]);
  });

  it("clona con ids nuevos sin compartir referencias", () => {
    const copy = cloneItems(series.items);
    expect(copy).toHaveLength(series.items.length);
    const ids = (items: typeof copy) => items.flatMap((i) => (i.type === "step" ? [i.id] : [i.id, ...i.steps.map((s) => s.id)]));
    const a = new Set(ids(series.items));
    expect(ids(copy).every((id) => !a.has(id))).toBe(true);
    (copy[0] as { duration: { seconds: number } }).duration.seconds = 1;
    expect((series.items[0] as { duration: { seconds: number } }).duration.seconds).toBe(900);
  });

  it("crea pasos y bloques con valores razonables", () => {
    expect(newStep("warmup").duration).toEqual({ type: "time", seconds: 600 });
    expect(newStep("work").duration).toEqual({ type: "distance", meters: 1000 });
    const r = newRepeat();
    expect(r.times).toBe(4);
    expect(r.steps.map((s) => s.kind)).toEqual(["work", "recovery"]);
  });

  it("detecta plantillas no guardables", () => {
    expect(templateProblems({ name: "", items: [] })).toEqual(["Ponle un nombre", "Añade al menos un paso"]);
    expect(templateProblems({ name: "X", items: [{ ...newRepeat(), steps: [] }] })).toEqual(["Un bloque de repeticiones está vacío"]);
    expect(templateProblems(series)).toEqual([]);
  });
});

import { applyTemplate, checkManualRun, clearTemplate, defaultMaxHr, hrZoneOf, hrZoneRange, matchPlanned } from "./running";

describe("zonas de frecuencia cardiaca", () => {
  it("estima la FC máxima y calcula rangos", () => {
    expect(defaultMaxHr(30)).toBe(190);
    expect(defaultMaxHr(100)).toBe(120);
    expect(hrZoneRange(2, 190)).toEqual({ from: 114, to: 133 });
    expect(hrZoneRange(5, 190)).toEqual({ from: 171, to: 190 });
  });

  it("detecta la zona de una FC", () => {
    expect(hrZoneOf(80, 190)).toBe(0);
    expect(hrZoneOf(120, 190)).toBe(2);
    expect(hrZoneOf(150, 190)).toBe(3);
    expect(hrZoneOf(165, 190)).toBe(4);
    expect(hrZoneOf(185, 190)).toBe(5);
  });
});

describe("plan ↔ sesiones", () => {
  const a = (id: string, date: string, km: number, extra: Partial<Activity> = {}): Activity => ({
    id,
    date,
    type: "run",
    source: "garmin",
    title: "x",
    distanceM: km * 1000,
    durationS: km * 330,
    ...extra,
  });

  it("enlaza por día, prefiriendo la sesión con la misma plantilla y luego la más larga", () => {
    const planned = [
      { id: "p1", date: "2026-09-18", templateId: "t1" },
      { id: "p2", date: "2026-09-19", templateId: "t1" },
      { id: "p3", date: "2026-09-25", templateId: "t1" }, // futuro
      { id: "p4", date: "2026-09-17", templateId: "t1" }, // sin sesión
    ];
    const acts = [
      a("a1", "2026-09-18", 5),
      a("a2", "2026-09-18", 9, { templateId: "t1" }),
      a("a3", "2026-09-19", 4),
      a("a4", "2026-09-19", 12),
    ];
    expect(matchPlanned(planned, acts, "2026-09-21")).toEqual([
      { plannedId: "p1", activityId: "a2" },
      { plannedId: "p2", activityId: "a4" },
    ]);
  });

  it("una sesión solo cumple un plan y respeta lo ya enlazado", () => {
    const planned = [
      { id: "p1", date: "2026-09-18", templateId: "t1", activityId: "a1" },
      { id: "p2", date: "2026-09-18", templateId: "t2" },
    ];
    const acts = [a("a1", "2026-09-18", 5), a("a2", "2026-09-18", 8)];
    expect(matchPlanned(planned, acts, "2026-09-21")).toEqual([{ plannedId: "p2", activityId: "a2" }]);
  });

  it("aplicar una plantilla guarda copia y quitarla la borra", () => {
    const linked = applyTemplate(a("a1", "2026-09-18", 5), series);
    expect(linked.templateId).toBe("t1");
    expect(linked.plan).toEqual(series);
    expect(linked.plan).not.toBe(series);
    const cleared = clearTemplate(linked);
    expect(cleared.templateId).toBeUndefined();
    expect(cleared.plan).toBeUndefined();
  });
});

describe("registro manual", () => {
  it("valida distancia, tiempo y FC", () => {
    expect(checkManualRun({ distanceKm: 10, durationS: 3000, avgHr: null })).toMatchObject({ ok: true, paceSecPerKm: 300, warnings: [] });
    expect(checkManualRun({ distanceKm: null, durationS: null, avgHr: null }).problems).toEqual(["Indica la distancia", "Indica el tiempo"]);
    expect(checkManualRun({ distanceKm: 0, durationS: 100, avgHr: null }).ok).toBe(false);
    expect(checkManualRun({ distanceKm: 5, durationS: 1500, avgHr: 20 }).problems).toEqual(["Frecuencia cardiaca fuera de rango"]);
  });

  it("avisa de ritmos poco creíbles sin impedir guardar", () => {
    const fast = checkManualRun({ distanceKm: 10, durationS: 1200, avgHr: null });
    expect(fast.ok).toBe(true);
    expect(fast.warnings[0]).toContain("más rápido");
    const slow = checkManualRun({ distanceKm: 3, durationS: 3 * 800, avgHr: null });
    expect(slow.warnings[0]).toContain("más lento");
  });
});

describe("importar de Health Connect", () => {
  const imported = (externalId: string, extra: Partial<Omit<Activity, "id">> = {}): Omit<Activity, "id"> => ({
    date: "2026-09-22",
    type: "run",
    source: "garmin",
    title: "Carrera",
    distanceM: 5000,
    durationS: 1500,
    externalId,
    ...extra,
  });

  it("añade lo nuevo y cuenta cuántas actividades entraron", () => {
    const r = mergeImportedActivities([], [imported("hc-1"), imported("hc-2")], () => "x");
    expect(r.addedCount).toBe(2);
    expect(r.activities).toHaveLength(2);
    expect(r.activities.every((a) => a.id === "x")).toBe(true);
  });

  it("no duplica una sesión ya presente con el mismo externalId", () => {
    const existing: Activity[] = [{ ...imported("hc-1"), id: "act-1" }];
    const r = mergeImportedActivities(existing, [imported("hc-1"), imported("hc-2")], () => "act-2");
    expect(r.addedCount).toBe(1);
    expect(r.activities.map((a) => a.externalId)).toEqual(["hc-2", "hc-1"]);
  });

  it("una actividad importada sin externalId nunca se descarta como duplicada", () => {
    const noId = imported("noop", { externalId: undefined });
    const existing: Activity[] = [{ ...noId, id: "act-1" }];
    const r = mergeImportedActivities(existing, [noId], () => "act-2");
    expect(r.addedCount).toBe(1);
  });

  it("una actividad de Strava convive con una ya importada de Garmin, sin chocar (fuentes y externalId distintos)", () => {
    const existing: Activity[] = [{ ...imported("hc-1"), id: "act-1" }];
    const stravaOne = imported("strava-1", { source: "strava", route: [{ lat: 40, lon: -3 }] });
    const r = mergeImportedActivities(existing, [stravaOne], () => "act-2");
    expect(r.addedCount).toBe(1);
    expect(r.activities.find((a) => a.externalId === "strava-1")).toMatchObject({ source: "strava" });
  });
});

describe("runningPRs", () => {
  const run = (id: string, distanceM: number, durationS: number, date = "2026-09-01"): Activity => ({
    id,
    date,
    type: "run",
    source: "manual",
    title: "Carrera",
    distanceM,
    durationS,
  });

  it("sin actividades, todo null", () => {
    const prs = runningPRs([]);
    expect(prs).toEqual({ longest: null, fastest_pace: null, "5k": null, "10k": null, half_marathon: null });
  });

  it("ignora las caminatas para el ritmo y las distancias estándar", () => {
    const walk: Activity = { ...run("w1", 5000, 3000), type: "walk" };
    const prs = runningPRs([walk]);
    expect(prs.longest).toBeNull(); // solo cuenta `type: "run"`
    expect(prs["5k"]).toBeNull();
  });

  it("la más larga es la de mayor distancia, sea cual sea el ritmo", () => {
    const prs = runningPRs([run("a", 3000, 900), run("b", 15000, 6000)]);
    expect(prs.longest?.id).toBe("b");
  });

  it("el mejor ritmo ignora carreras de menos de 1 km (no deja que un sprint corto falsee la marca)", () => {
    const sprint = run("sprint", 200, 30); // 150 s/km, rapidísimo pero irrelevante
    const real = run("real", 5000, 1500); // 300 s/km
    const prs = runningPRs([sprint, real]);
    expect(prs.fastest_pace?.id).toBe("real");
  });

  it("clasifica por rango de distancia estándar (5K/10K/media maratón), no por el número exacto", () => {
    const prs = runningPRs([
      run("a", 5200, 1500), // dentro del rango de 5K aunque no sean 5.000 m exactos
      run("b", 10300, 3000), // dentro del rango de 10K
      run("c", 21097, 6300), // media maratón oficial
      run("d", 7000, 2000), // no encaja en ningún rango estándar
    ]);
    expect(prs["5k"]?.id).toBe("a");
    expect(prs["10k"]?.id).toBe("b");
    expect(prs.half_marathon?.id).toBe("c");
  });

  it("dentro de una distancia estándar, gana la más rápida (menor tiempo), no la más reciente", () => {
    const slower = run("slow", 5000, 1800, "2026-09-01");
    const faster = run("fast", 5100, 1500, "2026-09-10");
    expect(runningPRs([slower, faster])["5k"]?.id).toBe("fast");
    expect(runningPRs([faster, slower])["5k"]?.id).toBe("fast"); // el orden de entrada no importa
  });
});
