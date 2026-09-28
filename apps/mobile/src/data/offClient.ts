// Cliente HTTP a Open Food Facts. Separado de `foodApi.ts` a propósito: `foodApi.ts` es la
// frontera estable que ya usan las pantallas (buscar/escanear); esto es el detalle de
// implementación de dónde sale el dato en vivo, así que un día se podría sustituir por un
// proxy del propio servidor sin tocar ninguna pantalla.
import type { Food, Reliability } from "@/domain/types";
// JSON directo en vez de `expo-constants`: ese módulo arrastra react-native (sintaxis Flow) y
// rompe la carga de este archivo en vitest (entorno Node, sin el transform de Metro/Expo).
import appConfig from "../../app.json";

const OFF_TIMEOUT_MS = 6000;

/** Fallo real de la petición (red, HTTP, o una respuesta de OFF que no es un "no encontrado" normal). */
export class OffError extends Error {}

function userAgent(): string {
  const version = appConfig.expo.version ?? "0.0.0";
  return `CheluisFIT/${version} (jlgarciavalverde@users.noreply.github.com)`;
}

function reliabilityFromCompleteness(completeness: unknown): Reliability {
  const c = typeof completeness === "number" ? completeness : 0;
  if (c >= 0.8) return "verified";
  if (c >= 0.4) return "community";
  return "incomplete";
}

/** Coge el primer número válido entre varias claves posibles (OFF no siempre rellena todas). */
function firstNumber(nutriments: Record<string, unknown>, ...keys: string[]): number {
  for (const k of keys) {
    const v = nutriments[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return 0;
}

type OffProduct = {
  product_name?: string;
  serving_quantity?: number | string;
  serving_size?: string;
  product_quantity?: number | string;
  product_quantity_unit?: string;
  brands?: string;
  quantity?: string;
  image_url?: string;
  completeness?: number;
  nutriments?: Record<string, unknown>;
};

/**
 * kcal con respaldo en kJ: algunas fichas de OFF (sobre todo entradas antiguas/manuales) solo
 * traen `energy_100g` (kJ) y no `energy-kcal_100g` — sin este respaldo, `firstNumber` devolvía 0
 * aunque la energía sí estuviera rellena, solo que en otra unidad. 1 kcal = 4,184 kJ.
 */
function kcalFrom(nutriments: Record<string, unknown>): number {
  const kcal = firstNumber(nutriments, "energy-kcal_100g");
  if (kcal > 0) return kcal;
  const kj = firstNumber(nutriments, "energy_100g");
  return kj > 0 ? Math.round(kj / 4.184) : 0;
}

const ETHANOL_DENSITY = 0.789; // g/mL — para pasar de % vol (unidad real de OFF) a gramos

function toFood(barcode: string, p: OffProduct): Food | null {
  const name = p.product_name?.trim();
  if (!name) return null; // sin nombre no es utilizable, se trata como "no encontrado"
  const nutriments = p.nutriments ?? {};
  // OFF llama a este campo "alcohol_100g" pero lo guarda en **% vol**, no en gramos (confirmado
  // en respuestas reales: `"alcohol_unit":"% vol"`) — hay que convertirlo, si no `Food.alcoholPer100`
  // mentiría sobre su propia unidad y el cálculo de `nutrientIssues()` saldría muy exagerado.
  const alcoholPercentVol = firstNumber(nutriments, "alcohol_100g");
  const alcoholPer100 = alcoholPercentVol > 0 ? Math.round(alcoholPercentVol * ETHANOL_DENSITY * 10) / 10 : undefined;
  return {
    id: `off-${barcode}`,
    name,
    brand: p.brands?.split(",")[0]?.trim() || undefined,
    barcode,
    source: "off",
    reliability: reliabilityFromCompleteness(p.completeness),
    per100: {
      kcal: kcalFrom(nutriments),
      protein: firstNumber(nutriments, "proteins_100g"),
      carbs: firstNumber(nutriments, "carbohydrates_100g"),
      fat: firstNumber(nutriments, "fat_100g"),
      fiber: firstNumber(nutriments, "fiber_100g"),
      sugars: firstNumber(nutriments, "sugars_100g"),
      satFat: firstNumber(nutriments, "saturated-fat_100g"),
      salt: firstNumber(nutriments, "salt_100g"),
    },
    servings: servingsFrom(p),
    packageInfo: p.quantity || undefined,
    imageUrl: p.image_url || undefined,
    alcoholPer100,
  };
}

const FIELDS = "product_name,brands,quantity,nutriments,nutriscore_grade,image_url,completeness,serving_quantity,serving_size,product_quantity,product_quantity_unit";

/**
 * Raciones de la ficha: la ración de la etiqueta y el envase entero (si no pasa de 2 kg). Antes
 * todo producto escaneado salía por 100 g y había que calcular a mano «1 yogur», «1 lata»…
 */
export function servingsFrom(p: Pick<OffProduct, "serving_quantity" | "serving_size" | "product_quantity" | "product_quantity_unit">): Food["servings"] {
  const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN);
  const out: Food["servings"] = [];
  const sq = num(p.serving_quantity);
  if (Number.isFinite(sq) && sq > 0 && sq <= 2000) out.push({ label: `1 ración (${Math.round(sq)} g)`, grams: Math.round(sq) });
  const pq = num(p.product_quantity);
  const unit = (p.product_quantity_unit ?? "g").toLowerCase();
  if (Number.isFinite(pq) && pq > 0 && pq <= 2000 && (unit === "g" || unit === "ml") && Math.round(pq) !== out[0]?.grams) {
    out.push({ label: `Envase (${Math.round(pq)} ${unit})`, grams: Math.round(pq) });
  }
  return out;
}

/**
 * Busca un producto por código de barras en Open Food Facts.
 * `null` = OFF confirma que el producto no existe (caso normal, `status_verbose: "product not
 * found"`, no es un error).
 * Lanza `OffError` = no se pudo contactar con OFF (red caída, timeout, HTTP≠2xx), o OFF ha
 * respondido `status: 0` con un motivo distinto de "no existe" (p. ej. `"no code or invalid
 * code"`, que indica que la petición en sí estaba mal formada, no que el producto no exista) —
 * el llamador debe distinguir esto de "no existe" en vez de tratarlo igual (antes se colapsaban
 * ambos casos en el mismo `null`, escondiendo fallos reales detrás de un "no encontrado").
 */
export async function fetchOffProduct(barcode: string): Promise<Food | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OFF_TIMEOUT_MS);
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=${FIELDS}`, {
      headers: { "User-Agent": userAgent() },
      signal: controller.signal,
    });
    if (!res.ok) throw new OffError(`Open Food Facts respondió ${res.status}`);
    const json = (await res.json()) as { status?: number; status_verbose?: string; product?: OffProduct };
    if (json.status === 1 && json.product) return toFood(barcode, json.product);
    if (json.status_verbose && json.status_verbose !== "product not found") {
      throw new OffError(`Open Food Facts: ${json.status_verbose}`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
