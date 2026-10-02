import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays } from "@/domain/dates";
import { isValidGtin } from "@/domain/gtin";
import { nutrientIssues } from "@/domain/nutrition";
import { lookupBarcode, normalizeText, searchFoods } from "./foodApi";
import { SEED_FOODS, SEED_PROFILE, seedEntries, seedWeights } from "./seed";

describe("datos de ejemplo", () => {
  it("todos los códigos de barras son válidos y únicos", () => {
    const codes = SEED_FOODS.filter((f) => f.barcode).map((f) => f.barcode as string);
    for (const c of codes) expect(isValidGtin(c), c).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("los ids son únicos y las fichas coherentes (salvo la «incompleta» a propósito)", () => {
    expect(new Set(SEED_FOODS.map((f) => f.id)).size).toBe(SEED_FOODS.length);
    for (const f of SEED_FOODS) {
      if (f.reliability === "incomplete") continue;
      expect(nutrientIssues(f.per100), f.name).toEqual([]);
    }
  });

  it("genera hoy parcial y 6 días previos completos", () => {
    const e = seedEntries("2026-09-21");
    expect(e.filter((x) => x.date === "2026-09-21").length).toBeGreaterThan(0);
    expect(e.filter((x) => x.date === "2026-09-21" && x.meal === "dinner")).toHaveLength(0);
    for (let d = 1; d <= 6; d++) {
      const day = e.filter((x) => x.date === addDays("2026-09-21", -d));
      expect(new Set(day.map((x) => x.meal)).size).toBe(5);
    }
  });
});

describe("pesos de ejemplo", () => {
  it("terminan en el peso del perfil y bajan poco a poco", () => {
    const w = seedWeights("2026-09-21");
    expect(w).toHaveLength(9);
    expect(w[w.length - 1]).toEqual({ date: "2026-09-21", kg: SEED_PROFILE.weightKg });
    expect(w[0].kg).toBeGreaterThan(w[w.length - 1].kg);
  });
});

describe("búsqueda simulada", () => {
  // Sin datos de USDA que ofrecer, para que estos casos prueben solo lo local sin depender de
  // la red real. La mezcla con USDA en vivo se prueba aparte, más abajo.
  beforeEach(() => vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ foods: [] }) })));
  afterEach(() => vi.unstubAllGlobals());

  it("ignora tildes, mayúsculas y plurales", async () => {
    expect(normalizeText("  Yogur   Griego ÁÉÍ ")).toBe("yogur griego aei");
    const r = await searchFoods("LENTEJAS cocidas", [], { latency: 0 });
    expect(r.foods.map((f) => f.brand)).toEqual(expect.arrayContaining(["Dia", "Carrefour"]));
  });

  it("encuentra por marca y ordena propios → genéricos → marcas", async () => {
    const r = await searchFoods("hacendado yogur", [], { latency: 0 });
    expect(r.foods.length).toBeGreaterThanOrEqual(3);
    const all = await searchFoods("pollo", [], { latency: 0 });
    expect(all.foods[0].source).toBe("usda");
    const own = await searchFoods("tortilla", [], { latency: 0 });
    expect(own.foods[0].source).toBe("user");
  });

  it("todas las palabras deben coincidir", async () => {
    expect((await searchFoods("pollo chocolate", [], { latency: 0 })).total).toBe(0);
    expect((await searchFoods("   ", [], { latency: 0 })).total).toBe(0);
  });
});

describe("búsqueda: mezcla con USDA en vivo", () => {
  beforeEach(() => vi.stubEnv("EXPO_PUBLIC_USDA_API_KEY", "clave-de-test"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("añade resultados de USDA sin exigirles coincidencia palabra a palabra (USDA ya filtró)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            foods: [
              {
                fdcId: 123456,
                description: "SOUP, LENTIL",
                foodNutrients: [
                  { nutrientId: 1008, value: 60 },
                  { nutrientId: 1003, value: 3.8 },
                  { nutrientId: 1005, value: 10.2 },
                  { nutrientId: 1004, value: 0.7 },
                ],
              },
            ],
          }),
      }),
    );
    const r = await searchFoods("sopa de lentejas rara", [], { latency: 0 });
    const usda = r.foods.find((f) => f.id === "usda-123456");
    expect(usda).toMatchObject({ name: "Soup, Lentil", source: "usda", per100: { kcal: 60, protein: 3.8 } });
  });

  it("si USDA falla (red caída), la búsqueda no se rompe: se queda con lo local", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const r = await searchFoods("pollo", [], { latency: 0 });
    expect(r.total).toBeGreaterThan(0); // el "pollo" genérico local sigue apareciendo
    // Ids de resultados en vivo son `usda-<fdcId numérico>`; los locales usan slugs descriptivos.
    expect(r.foods.some((f) => /^usda-\d+$/.test(f.id))).toBe(false);
  });
});

describe("búsqueda por código de barras", () => {
  // Lo local se prueba encontrando en SEED_FOODS (sin red); lo que no está en local cae a Open
  // Food Facts, así que aquí se simula "OFF también dice que no existe" para no depender de la
  // red real en los tests. El fallback a OFF en vivo se prueba aparte en `offClient.test.ts`.
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ status: 0 }) }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("encuentra en local, no encuentra ni en local ni en OFF, y rechaza códigos inválidos", async () => {
    const found = await lookupBarcode("8480000205049", [], { latency: 0 });
    expect(found.status).toBe("found");
    expect((await lookupBarcode("8410000000009", [], { latency: 0 })).status).toBe("not_found");
    expect((await lookupBarcode("8480000205040", [], { latency: 0 })).status).toBe("invalid");
    expect((await lookupBarcode("20512", [], { latency: 0 })).status).toBe("invalid");
  });

  it("si OFF no responde, devuelve «error» en vez de confundirlo con «no encontrado»", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect((await lookupBarcode("8410000000009", [], { latency: 0 })).status).toBe("error");
  });

  it("si una variante del código falla, sigue probando el resto en vez de rendirse (gtinVariants existe para esto)", async () => {
    // "036000291452" (UPC-A) genera 3 variantes: la propia, con un 0 más (13 dígitos) y sin el
    // 0 inicial (11 dígitos) — la primera falla por red, la segunda encuentra el producto.
    // Comparación exacta del código (no `.includes`): "036000291452" es substring de
    // "0036000291452", así que un `.includes` habría confundido las dos variantes entre sí.
    const codeFromUrl = (url: string) => url.match(/product\/(\d+)\.json/)?.[1];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (codeFromUrl(url) === "036000291452") return Promise.reject(new Error("timeout"));
      if (codeFromUrl(url) === "0036000291452") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ status: 1, product: { product_name: "Producto de prueba", nutriments: { "energy-kcal_100g": 100 } } }),
        });
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ status: 0 }) });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await lookupBarcode("036000291452", [], { latency: 0 });
    expect(result.status).toBe("found");
    if (result.status === "found") expect(result.food.name).toBe("Producto de prueba");
    expect(fetchMock).toHaveBeenCalledTimes(2); // no se detuvo en la primera variante fallida
  });
});

describe("búsqueda: correcciones de la 0.13", () => {
  beforeEach(() => vi.stubEnv("EXPO_PUBLIC_USDA_API_KEY", "clave-de-test"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const usdaHit = { fdcId: 777, description: "CHICKEN, BROILER, BREAST", foodNutrients: [{ nutrientId: 1008, value: 120 }] };

  it("un resultado de USDA ya usado sigue apareciendo (con su copia guardada)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ foods: [usdaHit] }) }));
    const first = await searchFoods("pechuga", []);
    const saved = first.foods.find((f) => f.id === "usda-777")!;
    expect(saved).toBeDefined();
    // Se usa y queda guardado en local (con el nombre en inglés, que no contiene «pechuga»).
    const again = await searchFoods("pechuga", [saved]);
    expect(again.foods.some((f) => f.id === "usda-777")).toBe(true);
  });

  it("las palabras vacías no se exigen: «yogur de fresa» encuentra «Yogur fresa»", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ foods: [] }) }));
    const own = { id: "user-yf", name: "Yogur fresa", source: "user" as const, per100: { kcal: 90, protein: 4, carbs: 13, fat: 2, fiber: 0, sugars: 12, satFat: 1, salt: 0.1 }, servings: [] };
    expect((await searchFoods("yogur de fresa", [own])).foods[0]?.id).toBe("user-yf");
  });

  it("sin red avisa de que solo se ve lo guardado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect((await searchFoods("pollo", [])).liveError).toBe(true);
  });
});
