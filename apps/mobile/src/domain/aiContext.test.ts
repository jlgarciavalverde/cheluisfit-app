import { describe, expect, it } from "vitest";
import { foodFromMealProposal, nutritionContext, runningContext, sectionForPath, strengthContext } from "./aiContext";
import { addDays } from "./dates";
import { newSet } from "./strength";
import type { Activity, Template } from "./running";
import type { Workout } from "./strength";
import type { Entry, Profile, Targets } from "./types";

const TODAY = "2026-09-23";

const profile: Profile = { name: "Test", sex: "male", age: 30, heightCm: 180, weightKg: 80, activity: 1.55, goal: "maintain" };
const targets: Targets = { kcal: 2200, protein: 150, carbs: 220, fat: 70, fiber: 30, sugarsMax: 50, satFatMax: 25, saltMax: 6, mealSplit: { breakfast: 20, midmorning: 10, lunch: 35, snack: 10, dinner: 25 } };

const entry = (date: string, kcal: number): Entry => ({ id: `e-${date}-${kcal}`, date, meal: "lunch", foodId: "f1", name: "Comida", grams: 100, nutrients: { kcal, protein: 20, carbs: 20, fat: 10, fiber: 2, sugars: 2, satFat: 3, salt: 1 } });

describe("nutritionContext", () => {
  it("resume objetivo, semana y hoy en texto legible", () => {
    const entries = [entry(TODAY, 800), entry(addDays(TODAY, -1), 2100), entry(addDays(TODAY, -2), 2150)];
    const text = nutritionContext(profile, targets, entries, TODAY);
    expect(text).toContain("Mantener peso");
    expect(text).toContain("2200 kcal/día");
    expect(text).toContain("3 de 7 con registro");
    expect(text).toContain("Hoy llevas: 800 kcal");
  });

  it("sin ningún día registrado no revienta (media a 0, no NaN)", () => {
    const text = nutritionContext(profile, targets, [], TODAY);
    expect(text).toContain("0 de 7 con registro");
    expect(text).not.toContain("NaN");
  });

  it("añade el contenido de la nevera si se ha escaneado", () => {
    const text = nutritionContext(profile, targets, [], TODAY, { items: ["tomate", "pollo"], lastScannedAt: addDays(TODAY, -2) });
    expect(text).toContain("En la nevera (escaneada hace 2 días): tomate, pollo.");
  });

  it("sin nevera escaneada, no añade nada sobre ella", () => {
    const text = nutritionContext(profile, targets, [], TODAY, { items: [], lastScannedAt: null });
    expect(text).not.toContain("nevera");
  });
});

const template: Template = { id: "tpl-1", name: "Series", kind: "intervals", items: [] };

const activity = (date: string, overrides: Partial<Activity> = {}): Activity => ({
  id: `a-${date}`,
  date,
  type: "run",
  source: "garmin",
  title: "Rodaje",
  distanceM: 8000,
  durationS: 2400,
  ...overrides,
});

describe("runningContext", () => {
  it("resume semanas y sesiones recientes con ritmo", () => {
    const activities = [activity(TODAY), activity(addDays(TODAY, -3), { distanceM: 10000, durationS: 3000 })];
    const text = runningContext(activities, [template], TODAY);
    expect(text).toContain("8 km");
    expect(text).toContain("Rodaje");
    expect(text).toContain("ritmo");
  });

  it("sin actividades no revienta", () => {
    const text = runningContext([], [], TODAY);
    expect(text).toContain("Sin sesiones registradas todavía.");
  });

  it("caminatas no llevan ritmo (mezclarlo no tendría sentido)", () => {
    const text = runningContext([activity(TODAY, { type: "walk", title: "Paseo" })], [], TODAY);
    expect(text).toContain("Paseo");
    expect(text).not.toContain("ritmo");
  });
});

const workout = (date: string): Workout => ({
  id: `w-${date}`,
  name: "Empuje",
  date,
  startedAt: `${date}T10:00:00.000Z`,
  endedAt: `${date}T11:00:00.000Z`,
  exercises: [
    {
      id: "we1",
      exerciseId: "ex1",
      name: "Press banca",
      primary: ["chest"],
      secondary: ["triceps"],
      equipment: "barbell",
      kind: "weight_reps",
      sets: [{ ...newSet("normal", 60, 8), done: true }, { ...newSet("normal", 60, 8), done: true }],
      plan: { sets: [], restS: 90, rule: "double", increment: 2.5 },
    },
  ],
});

describe("strengthContext", () => {
  it("resume series por músculo y entrenos recientes", () => {
    const text = strengthContext([workout(TODAY)], TODAY);
    expect(text).toContain("Pecho: 2");
    expect(text).toContain("Tríceps: 1"); // secundario, 0,5 por serie × 2 series
    expect(text).toContain("Empuje");
    expect(text).toContain("Press banca");
  });

  it("sin entrenos no revienta", () => {
    const text = strengthContext([], TODAY);
    expect(text).toContain("ninguna");
    expect(text).toContain("Sin entrenos registrados todavía.");
  });
});

describe("sectionForPath", () => {
  it("reconoce cada sección por el prefijo de la ruta", () => {
    expect(sectionForPath("/")).toBe("general"); // Hoy mezcla las 3 secciones
    expect(sectionForPath("/nutricion")).toBe("nutrition");
    expect(sectionForPath("/alimento/123")).toBe("nutrition");
    expect(sectionForPath("/running")).toBe("running");
    expect(sectionForPath("/sesion/act-1")).toBe("running");
    expect(sectionForPath("/fuerza")).toBe("strength");
    expect(sectionForPath("/entreno/w1")).toBe("strength");
    expect(sectionForPath("/mas")).toBe("general");
    expect(sectionForPath("/cuenta")).toBe("general");
  });
});

describe("foodFromMealProposal", () => {
  it("convierte los totales propuestos (para los gramos dados) a valores por 100 g", () => {
    const food = foodFromMealProposal({ name: "Ensalada de pollo", grams: 350, kcal: 420, protein: 35, carbs: 15, fat: 22 });
    expect(food.name).toBe("Ensalada de pollo");
    expect(food.reliability).toBe("incomplete");
    // 420 kcal / 350 g × 100 = 120 kcal/100g
    expect(food.per100.kcal).toBe(120);
    expect(food.per100.protein).toBe(10);
  });
});

import { AI_MAX_MESSAGES, chatHistory } from "./aiContext";

describe("chatHistory", () => {
  it("resume las respuestas que solo traen propuesta en vez de mandarlas vacías", () => {
    const h = chatHistory([
      { role: "user", content: "he comido 120 g de arroz" },
      { role: "assistant", content: "", proposals: [{ type: "add_meal_entry", name: "Arroz", grams: 120 }] },
      { role: "user", content: "gracias" },
    ]);
    expect(h).toHaveLength(3);
    expect(h[1]!.content).toBe("[propuse añadir «Arroz» (120 g)]");
    expect(h.every((m) => m.content.length > 0)).toBe(true);
  });

  it("quita los errores locales y se queda con los últimos 20", () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: `m${i}` }));
    const h = chatHistory([...many, { role: "assistant", content: "No he podido responder", local: true }]);
    expect(h).toHaveLength(AI_MAX_MESSAGES);
    expect(h.at(-1)!.content).toBe("m29");
  });

  it("recorta mensajes demasiado largos", () => {
    expect(chatHistory([{ role: "user", content: "x".repeat(5000) }])[0]!.content).toHaveLength(2000);
  });
});
