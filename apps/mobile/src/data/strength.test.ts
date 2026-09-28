import { describe, expect, it } from "vitest";
import { nutrientIssues } from "@/domain/nutrition";
import { historyFor, RULE_LABEL, suggestNext, type SessionSets } from "@/domain/strength";
import { CATALOG, CATALOG_BY_ID, CATALOG_SEED } from "./exerciseCatalog";
import { filterExercises, matchVideoName } from "./exerciseSearch";
import { SEED_ROUTINES, seedWorkouts } from "./strengthSeed";

void nutrientIssues;
void RULE_LABEL;

describe("catálogo", () => {
  it("ids únicos y datos completos", () => {
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(CATALOG.length);
    expect(CATALOG.length).toBeGreaterThanOrEqual(70);
    for (const e of CATALOG) {
      expect(e.primary.length, e.id).toBeGreaterThan(0);
      expect(e.name.trim(), e.id).not.toBe("");
      expect(e.aliases.length, e.id).toBeGreaterThan(0);
    }
  });

  it("las fotos son de hosts conocidos y no todos los ejercicios tienen (fuentes heterogéneas)", () => {
    const HOSTS = /raw\.githubusercontent\.com\/(yuhonas|RepDB)|wger\.de\/media/;
    const withFrames = CATALOG.filter((e) => e.frames);
    expect(withFrames.length).toBeGreaterThan(1000);
    for (const e of withFrames) {
      for (const f of e.frames!) expect(f, e.id).toMatch(/^https:\/\//);
      expect(e.frames![0], e.id).toMatch(HOSTS);
    }
    // La semilla mantiene su invariante original: 2 fotos de free-exercise-db.
    for (const e of CATALOG_SEED) {
      expect(e.frames, e.id).toHaveLength(2);
      expect(e.frames?.[0]).toMatch(/^https:\/\/raw\.githubusercontent\.com\/yuhonas\/free-exercise-db\/main\/exercises\/.+\/0\.jpg$/);
    }
  });
});

describe("rutinas y entrenos de ejemplo", () => {
  it("todas las rutinas usan ejercicios del catálogo y son las 6 pedidas", () => {
    expect(SEED_ROUTINES.map((r) => r.name)).toEqual(["Pecho", "Espalda", "Bíceps", "Tríceps", "Pierna", "Core"]);
    for (const r of SEED_ROUTINES) for (const e of r.exercises) expect(CATALOG_BY_ID.has(e.exerciseId), e.exerciseId).toBe(true);
  });

  it("la superserie de bíceps enlaza dos ejercicios", () => {
    const b = SEED_ROUTINES.find((r) => r.id === "rt-biceps")!;
    expect(b.exercises.filter((e) => e.supersetId).length).toBe(2);
  });

  it("el historial cuadra: todo hecho, fechas pasadas y ordenado", () => {
    const list = seedWorkouts("2026-09-21");
    expect(list.length).toBeGreaterThanOrEqual(9);
    for (const w of list) {
      expect(w.date < "2026-09-21").toBe(true);
      for (const e of w.exercises) expect(e.sets.every((s) => s.done)).toBe(true);
    }
  });

  it("el drop de ejemplo va tras una serie normal", () => {
    const w = seedWorkouts("2026-09-21").find((x) => x.routineId === "rt-biceps")!;
    const curl = w.exercises.find((e) => e.exerciseId === "Close-Grip_EZ_Bar_Curl")!;
    expect(curl.sets.map((s) => s.type)).toEqual(["normal", "normal", "normal", "normal", "drop"]);
  });

  it("las sugerencias del ejemplo enseñan casos distintos", () => {
    const list = seedWorkouts("2026-09-21");
    const cfg = (id: string) => {
      const re = SEED_ROUTINES.flatMap((r) => r.exercises).find((e) => e.exerciseId === id)!;
      return { rule: re.rule, repMin: re.sets[re.sets.length - 1].repMin, repMax: re.sets[re.sets.length - 1].repMax, increment: re.increment, plannedSets: re.sets.filter((s) => s.type !== "warmup").length, kind: CATALOG_BY_ID.get(id)!.kind };
    };
    const at = (id: string) => suggestNext(historyFor(list, id), cfg(id)).action;
    expect(at("Leverage_Chest_Press")).toBe("increase"); // 12·12·12 en rango 10–12
    expect(at("Barbell_Bench_Press_-_Medium_Grip")).toBe("hold");
    expect(at("Bench_Dips")).toBe("hold");
    const s = suggestNext(historyFor(list, "Leverage_Chest_Press"), cfg("Leverage_Chest_Press"));
    expect(s.perSet[0].kg).toBe(52.5);
  });
});

describe("búsqueda de ejercicios", () => {
  it("encuentra en español e inglés, sin tildes ni plurales", () => {
    expect(filterExercises(CATALOG, { query: "dominadas" }).map((e) => e.id)).toContain("Pullups");
    expect(filterExercises(CATALOG, { query: "pull-ups" }).map((e) => e.id)).toContain("Pullups");
    expect(filterExercises(CATALOG, { query: "biceps curl" }).length).toBeGreaterThan(0);
    expect(filterExercises(CATALOG, { query: "PRENSA" }).map((e) => e.id)).toContain("Leg_Press");
    expect(filterExercises(CATALOG, { query: "xyz" })).toEqual([]);
    // por músculo
    const chest = filterExercises(CATALOG, { query: "pecho" });
    expect(chest.length).toBeGreaterThan(5);
    for (const e of filterExercises(CATALOG, { group: "chest" })) expect(chest).toContain(e);
  });

  it("filtra por grupo y equipo", () => {
    const chest = filterExercises(CATALOG, { group: "chest" });
    expect(chest.length).toBeGreaterThan(5);
    expect(chest.every((e) => e.primary.includes("chest"))).toBe(true);
    const db = filterExercises(CATALOG, { group: "biceps", equipment: "dumbbell" });
    expect(db.length).toBeGreaterThan(2);
    expect(db.every((e) => e.equipment === "dumbbell")).toBe(true);
    expect(filterExercises(CATALOG, { withVideo: true })).toEqual([]);
  });

  it("empareja nombres de archivo de vídeo con el ejercicio", () => {
    expect(matchVideoName("press-banca-con-barra.mp4", CATALOG)?.id).toBe("Barbell_Bench_Press_-_Medium_Grip");
    expect(matchVideoName("Curl martillo.MOV", CATALOG)?.id).toBe("Hammer_Curls");
    expect(matchVideoName("Dominadas.mp4", CATALOG)?.id).toBe("Pullups");
    expect(matchVideoName("cosa-rara-que-no-existe.mp4", CATALOG)).toBeNull();
    expect(matchVideoName("", CATALOG)).toBeNull();
  });

  it("no adivina cuando es ambiguo", () => {
    expect(matchVideoName("curl.mp4", CATALOG)).toBeNull(); // hay muchos curl
  });
});

const _s: SessionSets[] = [];
void _s;
