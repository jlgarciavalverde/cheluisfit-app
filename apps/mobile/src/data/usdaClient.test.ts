import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { searchUsdaFoods, UsdaError } from "./usdaClient";

beforeEach(() => vi.stubEnv("EXPO_PUBLIC_USDA_API_KEY", "clave-de-test"));

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("searchUsdaFoods", () => {
  it("usa sugars (id 2000) cuando está, y title-case el nombre (USDA lo da en mayúsculas)", async () => {
    mockFetchOnce({
      foods: [
        {
          fdcId: 111,
          description: "MACARONI AND CHEESE",
          foodNutrients: [
            { nutrientId: 1008, value: 150 },
            { nutrientId: 2000, value: 3 },
          ],
        },
      ],
    });
    const [food] = await searchUsdaFoods("macaroni");
    expect(food.name).toBe("Macaroni And Cheese");
    expect(food.per100.sugars).toBe(3);
  });

  it("recurre a sugarsLegacy (id 1063) si no hay 2000 — registros antiguos de USDA", async () => {
    mockFetchOnce({
      foods: [{ fdcId: 222, description: "OLD RECORD", foodNutrients: [{ nutrientId: 1063, value: 7.5 }] }],
    });
    const [food] = await searchUsdaFoods("old");
    expect(food.per100.sugars).toBe(7.5);
  });

  it("convierte sodio (mg) a sal (g): sodio × 2.5 / 1000, redondeado a 2 decimales", async () => {
    mockFetchOnce({
      foods: [{ fdcId: 333, description: "SALTY", foodNutrients: [{ nutrientId: 1093, value: 244 }] }],
    });
    const [food] = await searchUsdaFoods("salty");
    expect(food.per100.salt).toBe(0.61); // 244 × 2.5 / 1000 = 0.61
  });

  it("rellena con 0 los nutrientes ausentes, nunca NaN/undefined", async () => {
    mockFetchOnce({ foods: [{ fdcId: 444, description: "EMPTY", foodNutrients: [] }] });
    const [food] = await searchUsdaFoods("empty");
    expect(food.per100).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugars: 0, satFat: 0, salt: 0 });
  });

  it("descarta resultados sin nombre (description vacío)", async () => {
    mockFetchOnce({ foods: [{ fdcId: 555, description: "", foodNutrients: [] }] });
    expect(await searchUsdaFoods("x")).toEqual([]);
  });

  it("nunca lanza por «sin resultados» — devuelve []", async () => {
    mockFetchOnce({ foods: [] });
    await expect(searchUsdaFoods("nada")).resolves.toEqual([]);
  });

  it("lanza UsdaError (no un array vacío) si la respuesta HTTP falla", async () => {
    mockFetchOnce({}, false, 503);
    await expect(searchUsdaFoods("x")).rejects.toThrow(UsdaError);
  });

  it("lanza UsdaError si la red falla directamente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(searchUsdaFoods("x")).rejects.toThrow(UsdaError);
  });
});
