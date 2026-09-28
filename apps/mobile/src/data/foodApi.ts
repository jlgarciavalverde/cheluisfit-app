// Capa de acceso a alimentos. `searchFoods` combina lo local (SEED_FOODS + lo que el usuario ya
// tenga guardado) con una búsqueda en vivo en USDA FoodData Central (`usdaClient.ts`, +600.000
// alimentos, gratis); `lookupBarcode` prueba primero lo local y, si no hay nada, consulta Open
// Food Facts en vivo (`offClient.ts`) — así ambos catálogos crecen solos con el uso real, sin
// depender de un servidor propio.
import { gtinVariants, isValidGtin } from "@/domain/gtin";
import type { Food } from "@/domain/types";
import { fetchOffProduct } from "./offClient";
import { SEED_FOODS } from "./seed";
import { searchUsdaFoods } from "./usdaClient";
import { normalizeText } from "@/domain/text";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

export { normalizeText };

/** Singular tosco para tolerar plurales («lentejas» ≈ «lenteja»). */
function stem(t: string): string {
  return t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t;
}

function score(food: Food, tokens: string[]): number {
  const name = normalizeText(food.name).split(" ").map(stem);
  const brand = normalizeText(food.brand ?? "").split(" ").map(stem);
  let s = 0;
  for (const t of tokens) {
    const st = stem(t);
    if (name.some((w) => w === st)) s += 3;
    else if (name.some((w) => w.startsWith(st))) s += 2;
    else if (brand.some((w) => w.startsWith(st))) s += 2;
    else if (name.join(" ").includes(st)) s += 1;
    else return 0; // todas las palabras deben aparecer
  }
  return s;
}

export type SearchResult = { foods: Food[]; total: number };

/**
 * Prioridad: propios → genéricos → productos con marca; dentro de cada grupo, por coincidencia.
 * Lo local se filtra por si todas las palabras aparecen (`score`); lo de USDA no — USDA ya hizo
 * su propia búsqueda en inglés contra su índice, así que si algo pasa el filtro incluso siendo
 * el texto en español (coincide un ingrediente, una marca, etc.), se confía en su relevancia en
 * vez de exigir que además coincida letra a letra con las palabras en español.
 */
export async function searchFoods(
  query: string,
  extra: readonly Food[] = [],
  opts: { latency?: number } = {},
): Promise<SearchResult> {
  await wait(opts.latency ?? 220);
  const tokens = normalizeText(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return { foods: [], total: 0 };
  const rank = (f: Food) => (f.source === "user" ? 0 : f.source === "usda" ? 1 : 2);
  const pool = new Map<string, Food>();
  for (const f of [...SEED_FOODS, ...extra]) pool.set(f.id, f);
  const local = [...pool.values()]
    .map((f) => ({ f, s: score(f, tokens) }))
    .filter((x) => x.s > 0);

  let live: { f: Food; s: number }[] = [];
  const trimmed = query.trim();
  if (trimmed.length >= 2) {
    try {
      const found = await searchUsdaFoods(trimmed);
      live = found.filter((f) => !pool.has(f.id)).map((f) => ({ f, s: Math.max(score(f, tokens), 1) }));
    } catch {
      // Fallo de red/USDA no debe romper la búsqueda: se queda con lo local.
    }
  }

  const hits = [...local, ...live].sort((a, b) => rank(a.f) - rank(b.f) || b.s - a.s || a.f.name.localeCompare(b.f.name, "es"));
  return { foods: hits.map((x) => x.f), total: hits.length };
}

export type BarcodeResult =
  | { status: "found"; food: Food }
  | { status: "not_found"; code: string }
  | { status: "invalid"; code: string }
  | { status: "error"; code: string; message: string };

export async function lookupBarcode(
  code: string,
  extra: readonly Food[] = [],
  opts: { latency?: number } = {},
): Promise<BarcodeResult> {
  await wait(opts.latency ?? 450);
  const trimmed = code.trim();
  if (!isValidGtin(trimmed)) return { status: "invalid", code: trimmed };
  const variants = gtinVariants(trimmed);
  const local = [...SEED_FOODS, ...extra].find((f) => f.barcode && variants.includes(f.barcode));
  if (local) return { status: "found", food: local };
  // Un fallo en una variante (p. ej. timeout) no debe impedir probar el resto: `gtinVariants()`
  // existe justo porque OFF guarda el mismo producto con distinto relleno de ceros, y la
  // variante que falla no tiene por qué ser la que tiene el producto.
  let lastError: unknown = null;
  for (const v of variants) {
    try {
      const food = await fetchOffProduct(v);
      if (food) return { status: "found", food };
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError) {
    return { status: "error", code: trimmed, message: lastError instanceof Error ? lastError.message : "Error desconocido" };
  }
  return { status: "not_found", code: trimmed };
}
