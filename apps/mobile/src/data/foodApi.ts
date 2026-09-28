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

export type SearchResult = {
  foods: Food[];
  total: number;
  /** USDA no respondió (sin red, caído): lo que se enseña es solo lo guardado en el móvil. */
  liveError?: boolean;
};

/** Palabras que no deben exigirse al buscar: «yogur de fresa» tiene que encontrar «Yogur fresa». */
const STOPWORDS = new Set(["de", "del", "la", "el", "los", "las", "con", "y", "e", "en", "a", "al", "un", "una"]);

/**
 * Orden: propios → genéricos locales → productos locales → resultados en vivo de USDA; dentro de
 * cada grupo, por coincidencia. Lo local se filtra por si todas las palabras aparecen (`score`); lo
 * de USDA no — USDA ya hizo su propia búsqueda en inglés contra su índice, así que se confía en su
 * relevancia en vez de exigir que además coincida letra a letra con las palabras en español.
 * Un resultado de USDA que ya se usó (y por eso está guardado en local, con su nombre en inglés)
 * **sigue saliendo**: se une por id con el guardado. Antes el guardado no pasaba el filtro en
 * español y el de USDA se descartaba por repetido, así que lo que más usabas desaparecía.
 */
export async function searchFoods(
  query: string,
  extra: readonly Food[] = [],
  opts: { latency?: number } = {},
): Promise<SearchResult> {
  if (opts.latency) await wait(opts.latency);
  const all = normalizeText(query).split(" ").filter(Boolean);
  const meaningful = all.filter((t) => !STOPWORDS.has(t));
  const tokens = meaningful.length > 0 ? meaningful : all;
  if (tokens.length === 0) return { foods: [], total: 0 };
  const rank = (f: Food, live: boolean) => (live ? 3 : f.source === "user" ? 0 : f.source === "usda" ? 1 : 2);
  const pool = new Map<string, Food>();
  for (const f of [...SEED_FOODS, ...extra]) pool.set(f.id, f);
  // Un original que tiene tu versión corregida deja de salir: sale la tuya.
  const replaced = new Set([...pool.values()].map((f) => f.replaces).filter((x): x is string => !!x));
  for (const id of replaced) pool.delete(id);
  const hits = new Map<string, { f: Food; s: number; r: number }>();
  for (const f of pool.values()) {
    const sc = score(f, tokens);
    if (sc > 0) hits.set(f.id, { f, s: sc, r: rank(f, false) });
  }

  let liveError = false;
  const trimmed = query.trim();
  if (trimmed.length >= 2) {
    try {
      const found = await searchUsdaFoods(trimmed);
      for (const f of found) {
        if (hits.has(f.id) || replaced.has(f.id)) continue;
        const local = pool.get(f.id);
        // Ya guardado (se usó alguna vez): se enseña el guardado, en su grupo local.
        if (local) hits.set(f.id, { f: local, s: Math.max(score(local, tokens), 1), r: rank(local, false) });
        else hits.set(f.id, { f, s: Math.max(score(f, tokens), 1), r: rank(f, true) });
      }
    } catch {
      // Fallo de red/USDA no debe romper la búsqueda: se queda con lo local, y se avisa.
      liveError = true;
    }
  }

  const sorted = [...hits.values()].sort((a, b) => a.r - b.r || b.s - a.s || a.f.name.localeCompare(b.f.name, "es"));
  return { foods: sorted.map((x) => x.f), total: sorted.length, ...(liveError ? { liveError } : {}) };
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
  if (opts.latency) await wait(opts.latency);
  const trimmed = code.trim();
  if (!isValidGtin(trimmed)) return { status: "invalid", code: trimmed };
  const variants = gtinVariants(trimmed);
  // Tu versión corregida gana al original con el mismo código de barras (antes salía el original,
  // que se había guardado antes al escanearlo).
  const matches = [...SEED_FOODS, ...extra].filter((f) => f.barcode && variants.includes(f.barcode));
  const local = matches.find((f) => f.source === "user") ?? matches[0];
  if (local) {
    // Una ficha de OFF que estaba vacía al escanearla por primera vez se vuelve a pedir: la
    // comunidad la rellena con el tiempo, y sin esto se quedaba vacía para siempre en el móvil.
    const p = local.per100;
    if (local.source === "off" && local.barcode && p.kcal === 0 && p.protein === 0 && p.carbs === 0 && p.fat === 0) {
      try {
        const fresh = await fetchOffProduct(local.barcode);
        if (fresh && fresh.per100.kcal > 0) return { status: "found", food: fresh };
      } catch {
        // sin red: se queda con la guardada
      }
    }
    return { status: "found", food: local };
  }
  // Un fallo en una variante (p. ej. timeout) no debe impedir probar el resto: `gtinVariants()`
  // existe justo porque OFF guarda el mismo producto con distinto relleno de ceros, y la
  // variante que falla no tiene por qué ser la que tiene el producto.
  // Todas las variantes a la vez (antes una tras otra, con 6 s de espera cada una: hasta ~24 s con
  // mala cobertura). Gana la primera que encuentra el producto; si ninguna, se distingue «no existe»
  // de «no se pudo preguntar».
  const outcomes = await Promise.allSettled(variants.map((v) => fetchOffProduct(v)));
  const hit = outcomes.find((o): o is PromiseFulfilledResult<Food> => o.status === "fulfilled" && o.value !== null);
  if (hit) return { status: "found", food: hit.value };
  const failure = outcomes.find((o): o is PromiseRejectedResult => o.status === "rejected");
  if (failure) {
    const lastError: unknown = failure.reason;
    return { status: "error", code: trimmed, message: lastError instanceof Error ? lastError.message : "Error desconocido" };
  }
  return { status: "not_found", code: trimmed };
}
