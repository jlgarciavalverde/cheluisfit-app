import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOffProduct, OffError } from "./offClient";

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok, status, json: () => Promise.resolve(body) }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe("fetchOffProduct", () => {
  it("mapea un producto encontrado, con reliability por completeness", async () => {
    mockFetchOnce({
      status: 1,
      product: {
        product_name: "Atún claro en aceite de oliva",
        brands: "Hacendado, Mercadona",
        quantity: "3 x 52 g",
        completeness: 0.85,
        nutriments: {
          "energy-kcal_100g": 200,
          proteins_100g: 25,
          carbohydrates_100g: 0,
          fat_100g: 12,
          fiber_100g: 0,
          sugars_100g: 0,
          "saturated-fat_100g": 2,
          salt_100g: 1.1,
        },
      },
    });
    const food = await fetchOffProduct("8480000123456");
    expect(food).toMatchObject({
      id: "off-8480000123456",
      name: "Atún claro en aceite de oliva",
      brand: "Hacendado",
      source: "off",
      reliability: "verified",
      per100: { kcal: 200, protein: 25, fat: 12, salt: 1.1 },
    });
  });

  it("si falta energy-kcal_100g pero hay energy_100g (kJ), calcula las kcal en vez de dar 0", async () => {
    // Caso real de OFF: fichas antiguas/manuales solo traen la energía en kJ.
    mockFetchOnce({
      status: 1,
      product: { product_name: "Solo en kJ", completeness: 0.5, nutriments: { energy_100g: 836.8 } },
    });
    const food = await fetchOffProduct("8480000000024");
    expect(food?.per100.kcal).toBe(200); // 836,8 / 4,184 = 200
  });

  it("mapea el alcohol por separado en gramos, aparte de Nutrients (para nutrientIssues, no se muestra)", async () => {
    // Datos reales de OFF (whisky Talisker Storm, 5000281032733). OFF llama al campo
    // "alcohol_100g" pero lo guarda en **% vol** (confirmado: `alcohol_unit: "% vol"` en la
    // respuesta real), no en gramos — hay que convertirlo con la densidad del etanol.
    mockFetchOnce({
      status: 1,
      product: {
        product_name: "Talisker Storm",
        completeness: 0.6,
        nutriments: { "energy-kcal_100g": 254, carbohydrates_100g: 0.1, fat_100g: 0, proteins_100g: 0, alcohol_100g: 45.8 },
      },
    });
    const food = await fetchOffProduct("5000281032733");
    expect(food?.alcoholPer100).toBe(36.1); // 45,8 % vol × 0,789 g/mL ≈ 36,1 g
    expect(food?.per100).not.toHaveProperty("alcohol"); // no forma parte de Nutrients
  });

  it("sin alcohol_100g, alcoholPer100 queda undefined (no 0 falso)", async () => {
    mockFetchOnce({ status: 1, product: { product_name: "Atún", completeness: 0.8, nutriments: { "energy-kcal_100g": 200 } } });
    const food = await fetchOffProduct("8480000000031");
    expect(food?.alcoholPer100).toBeUndefined();
  });

  it("rellena con 0 los nutrientes ausentes en vez de NaN/undefined", async () => {
    mockFetchOnce({ status: 1, product: { product_name: "Producto incompleto", completeness: 0.2, nutriments: {} } });
    const food = await fetchOffProduct("8480000000017");
    expect(food?.reliability).toBe("incomplete");
    expect(food?.per100).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sugars: 0, satFat: 0, salt: 0 });
  });

  it("devuelve null cuando OFF confirma que el producto no existe (status 0, «product not found»)", async () => {
    mockFetchOnce({ status: 0, status_verbose: "product not found" });
    await expect(fetchOffProduct("0000000000017")).resolves.toBeNull();
  });

  it("devuelve null también si status es 0 sin status_verbose (por si acaso)", async () => {
    mockFetchOnce({ status: 0 });
    await expect(fetchOffProduct("0000000000017")).resolves.toBeNull();
  });

  it("lanza cuando la respuesta HTTP no es ok, para distinguirlo de «no existe»", async () => {
    mockFetchOnce({}, false, 503);
    await expect(fetchOffProduct("8480000123456")).rejects.toThrow(OffError);
  });

  it('lanza (no null) cuando OFF dice «no code or invalid code» — la petición estaba mal formada, no es que el producto no exista', async () => {
    // Respuesta real reproducida contra OFF: pasa esto cuando el código de barras no llega
    // bien construido en la URL. Antes se confundía con "producto no encontrado".
    mockFetchOnce({ code: null, status: 0, status_verbose: "no code or invalid code" });
    await expect(fetchOffProduct("8480000123456")).rejects.toThrow(/no code or invalid code/);
  });
});

import { servingsFrom } from "./offClient";

describe("raciones de Open Food Facts", () => {
  it("ración de la etiqueta y envase, sin repetir ni aceptar tamaños absurdos", () => {
    expect(servingsFrom({ serving_quantity: 125, product_quantity: 500, product_quantity_unit: "g" })).toEqual([
      { label: "1 ración (125 g)", grams: 125 },
      { label: "Envase (500 g)", grams: 500 },
    ]);
    expect(servingsFrom({ serving_quantity: "330", product_quantity: 330, product_quantity_unit: "ml" })).toEqual([{ label: "1 ración (330 g)", grams: 330 }]);
    expect(servingsFrom({ product_quantity: 5000 })).toEqual([]);
    expect(servingsFrom({})).toEqual([]);
  });
});
