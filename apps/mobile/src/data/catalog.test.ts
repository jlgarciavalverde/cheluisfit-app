// Calidad del catálogo generado (`tools/build-catalog.mjs` → `catalogGen.json`): lo que un fallo
// del script dejaría pasar sin que ningún test de pantalla lo notara.
import { describe, expect, it } from "vitest";
import catalogGen from "./catalogGen.json";
import instructions from "./catalogInstructions.json";
import { CATALOG, CATALOG_BY_ID } from "./exerciseCatalog";

type Gen = { id: string; name: string; aliases: string[]; equipment: string; kind: string; frames?: string[] };
const gen = catalogGen as Gen[];

describe("catálogo de ejercicios", () => {
  it("los ejercicios de peso corporal no piden kilos (salvo los lastrados)", () => {
    const bad = gen.filter((e) => e.equipment === "bodyweight" && e.kind === "weight_reps" && !/weighted|lastrad/i.test(`${e.name} ${e.aliases.join(" ")}`));
    expect(bad.map((e) => e.name)).toEqual([]);
  });

  it("las planchas e isométricos se registran por tiempo", () => {
    const planks = gen.filter((e) => /\bplank\b/i.test(e.aliases[0] ?? "") && !/\b(jack|tap|walk|up|row|reach|dip|crunch|shoulder|to|rotation|twist|knee|hip|jump)/i.test(e.aliases[0] ?? ""));
    expect(planks.length).toBeGreaterThan(0);
    expect(planks.filter((e) => e.kind !== "duration").map((e) => e.aliases[0])).toEqual([]);
  });

  it("nombres sin espacios sobrantes, con mayúscula inicial y sin repetir", () => {
    expect(gen.filter((e) => e.name !== e.name.trim() || e.name[0] !== e.name[0]!.toUpperCase()).map((e) => e.name)).toEqual([]);
    const names = CATALOG.map((e) => e.name.toLowerCase());
    expect(names.length - new Set(names).size).toBe(0);
  });

  it("ids únicos, y ningún ejercicio de la semilla aparece otra vez como copia de free-exercise-db", () => {
    const ids = CATALOG.map((e) => e.id);
    expect(ids.length - new Set(ids).size).toBe(0);
    const seed = CATALOG.filter((e) => !e.id.includes(":"));
    for (const s of seed) expect(CATALOG_BY_ID.has(`fed:${s.id}`)).toBe(false);
  });

  it("las fotos se expanden a URLs completas y las instrucciones van aparte", () => {
    for (const e of CATALOG) for (const f of e.frames ?? []) expect(f.startsWith("https://")).toBe(true);
    expect(Object.keys(instructions).length).toBeGreaterThan(1000);
    expect(Object.keys(instructions).every((id) => CATALOG_BY_ID.has(id) || gen.some((g) => g.id === id))).toBe(true);
  });
});
