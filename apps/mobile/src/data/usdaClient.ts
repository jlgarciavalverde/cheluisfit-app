// Cliente de USDA FoodData Central — amplía la búsqueda de texto (`foodApi.ts` → `searchFoods`)
// más allá del catálogo local, con más de 600.000 alimentos (genéricos y de marca), gratis y sin
// límite realista para el uso de esta app (1000 peticiones/hora por clave). A diferencia de Open
// Food Facts, esta base de datos es en inglés: busca lo que se escriba tal cual, así que para
// términos en español solo encuentra coincidencias en marcas/nombres que también estén en
// inglés — no traduce. Por eso los platos caseros españoles concretos siguen viviendo en
// `seed.ts`, no aquí.
import type { Food, Nutrients } from "@/domain/types";

/**
 * Clave gratuita de api.data.gov (sin coste, sin tarjeta), en la variable `EXPO_PUBLIC_USDA_API_KEY`.
 * No está horneada en el código a propósito: el repo es público y, aunque no es un secreto sensible,
 * cualquiera podría gastar la cuota (1000 peticiones/hora por clave) con una clave visible. Se lee
 * en cada llamada (no al importar) para respetar los tests y el arranque de Expo.
 */
const usdaApiKey = () => process.env.EXPO_PUBLIC_USDA_API_KEY ?? "";
const USDA_TIMEOUT_MS = 5000;
const PAGE_SIZE = 15;

/** Error real (red, HTTP, timeout) al consultar USDA — distinto de "no hay resultados". */
export class UsdaError extends Error {}

const NUTRIENT_ID = {
  kcal: 1008,
  // Los alimentos «Foundation» a menudo no traen 1008 y solo la energía Atwater (general 2047,
  // específica 2048): sin este respaldo salían con 0 kcal.
  kcalAtwaterGeneral: 2047,
  kcalAtwaterSpecific: 2048,
  protein: 1003,
  carbs: 1005,
  fat: 1004,
  fiber: 1079,
  sugars: 2000,
  sugarsLegacy: 1063, // registros antiguos usan este id en vez de 2000
  satFat: 1258,
  sodiumMg: 1093, // se convierte a sal: sal(g) = sodio(mg) × 2.5 / 1000
} as const;

type UsdaFoodNutrient = { nutrientId: number; value?: number };
type UsdaFood = {
  fdcId: number;
  description: string;
  dataType?: string;
  brandOwner?: string;
  brandName?: string;
  foodNutrients?: UsdaFoodNutrient[];
};

function nutrientValue(nutrients: UsdaFoodNutrient[], ...ids: number[]): number {
  for (const id of ids) {
    const n = nutrients.find((x) => x.nutrientId === id);
    if (n && typeof n.value === "number" && Number.isFinite(n.value)) return n.value;
  }
  return 0;
}

/** Nombre legible: USDA devuelve muchos en mayúsculas (sobre todo "Branded") — se capitaliza. */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function toFood(f: UsdaFood): Food {
  const n = f.foodNutrients ?? [];
  const per100: Nutrients = {
    kcal: nutrientValue(n, NUTRIENT_ID.kcal, NUTRIENT_ID.kcalAtwaterGeneral) || nutrientValue(n, NUTRIENT_ID.kcalAtwaterSpecific),
    protein: nutrientValue(n, NUTRIENT_ID.protein),
    carbs: nutrientValue(n, NUTRIENT_ID.carbs),
    fat: nutrientValue(n, NUTRIENT_ID.fat),
    fiber: nutrientValue(n, NUTRIENT_ID.fiber),
    sugars: nutrientValue(n, NUTRIENT_ID.sugars, NUTRIENT_ID.sugarsLegacy),
    satFat: nutrientValue(n, NUTRIENT_ID.satFat),
    salt: Math.round(((nutrientValue(n, NUTRIENT_ID.sodiumMg) * 2.5) / 1000) * 100) / 100,
  };
  return {
    id: `usda-${f.fdcId}`,
    name: titleCase(f.description),
    brand: f.brandName || f.brandOwner || undefined,
    source: "usda",
    per100,
    servings: [],
  };
}

/**
 * Busca en vivo en USDA FoodData Central. Nunca lanza por "sin resultados" (devuelve `[]`); solo
 * lanza `UsdaError` si de verdad no se pudo consultar — el llamador (`foodApi.ts`) decide si
 * eso debe detener la búsqueda o simplemente quedarse con los resultados locales.
 */
export async function searchUsdaFoods(query: string): Promise<Food[]> {
  const key = usdaApiKey();
  if (!key) {
    throw new UsdaError("Falta la clave de USDA: define EXPO_PUBLIC_USDA_API_KEY (gratis en https://api.data.gov)");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), USDA_TIMEOUT_MS);
  try {
    const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${key}&query=${encodeURIComponent(query)}&pageSize=${PAGE_SIZE}`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new UsdaError(`USDA FoodData Central respondió ${res.status}`);
    const json = (await res.json()) as { foods?: UsdaFood[] };
    return (json.foods ?? []).filter((f) => f.description).map(toFood);
  } catch (e) {
    if (e instanceof UsdaError) throw e;
    throw new UsdaError(e instanceof Error ? e.message : "Error desconocido");
  } finally {
    clearTimeout(timeout);
  }
}
