// Calidad del catálogo generado (`tools/build-catalog.mjs` → `catalogGen.json`): lo que un fallo
// del script dejaría pasar sin que ningún test de pantalla lo notara.
import { describe, expect, it } from "vitest";
import catalogGen from "./catalogGen.json";
import instructions from "./catalogInstructions.json";
import { CATALOG, CATALOG_BY_ID } from "./exerciseCatalog";

type Gen = { id: string; name: string; aliases: string[]; equipment: string; kind: string; frames?: string[]; gif?: string; hidden?: boolean };
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

describe("catálogo: imagen para todos los visibles", () => {
  it("todo lo que se ofrece en listas tiene foto o GIF; lo oculto sigue existiendo por id", () => {
    const visible = CATALOG.filter((e) => !e.hidden);
    expect(visible.filter((e) => !(e.frames?.length || e.gif)).map((e) => e.name)).toEqual([]);
    const hidden = gen.filter((g) => g.hidden);
    expect(hidden.length).toBeGreaterThan(0);
    for (const h of hidden) expect(h.frames ?? h.gif).toBeUndefined();
    // Los ocultos siguen localizables por id (rutinas y entrenos antiguos); solo faltan los que
    // se descartan por repetir un ejercicio de la semilla.
    const byId = hidden.filter((h) => CATALOG_BY_ID.get(h.id)?.hidden).length;
    expect(byId).toBeGreaterThan(hidden.length * 0.9);
  });

  it("las fotos de free-exercise-db usan la carpeta real (sin «/», «(» ni «,») y los GIF el formato de ExerciseDB", () => {
    // «fed:<carpeta>/<n>.jpg»: la carpeta nunca lleva «/», «(», «)» ni «,» (las reales los cambian por «_»).
    const bad = gen.flatMap((e) => e.frames ?? []).filter((f) => f.startsWith("fed:") && !/^fed:[^/(),]+\/\d\.jpg$/.test(f));
    expect(bad).toEqual([]);
    const gifs = gen.filter((e) => e.gif).map((e) => e.gif!);
    expect(gifs.length).toBeGreaterThan(1000);
    expect(gifs.every((g) => /^edb:[A-Za-z0-9]{7}$/.test(g))).toBe(true);
    for (const e of CATALOG) if (e.gif) expect(e.gif).toMatch(/^https:\/\/static\.exercisedb\.dev\/media\/[A-Za-z0-9]{7}\.gif$/);
  });
});
