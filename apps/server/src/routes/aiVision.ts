import { tool } from "ai";
import { z } from "zod";
import { requireUser } from "../auth";
import { perUserKey } from "../http";
import { callVision, callVisionObject, readImages, requireVisionKey } from "../vision";
import type { Register } from "./ctx";

const FRIDGE_INSTRUCTIONS =
  "Eres el asistente de nutrición de CheluisFIT. Te doy una foto del interior de una nevera (o de " +
  "una parte: una balda, la puerta, un cajón). Lista los alimentos que reconozcas con claridad, en " +
  "español y en singular salvo que sea un nombre plural («huevos», «espinacas»), sin marcas. Para " +
  "cada uno indica dónde está: zone = shelf (balda del cuerpo), drawer (cajón de abajo), door " +
  "(estantes de la puerta) o freezer (congelador); level = número de balda/estante contando desde " +
  "arriba empezando en 0; x = posición horizontal de 0 (izquierda) a 1 (derecha); depth = front o " +
  "back. Si se ve la cantidad, ponla (quantity + unit: ud, g, ml, l, paquete). confidence entre 0 y " +
  "1. expiresHint solo si se ve que está pasado o a punto («poco fresco», «abierto»). En " +
  "shelvesSeen pon cuántas baldas del cuerpo se ven y en doorVisible si se ve la puerta. No " +
  "inventes: si no reconoces nada, devuelve items vacío.";

/** Plan B en texto si la salida estructurada falla (modelo que no la soporta, respuesta rota). */
const FRIDGE_TEXT_INSTRUCTIONS =
  "Eres el asistente de nutrición de CheluisFIT. Te doy una foto del interior de una nevera. " +
  "Responde SOLO con los ingredientes que reconozcas, uno por línea, en español, sin números ni " +
  "viñetas ni explicación adicional. Si no reconoces nada con claridad, responde con una línea " +
  "vacía.";

export const FRIDGE_CATEGORIES = ["lacteo", "carne", "pescado", "fruta", "verdura", "bebida", "salsa", "huevos", "sobras", "otros"] as const;
export const FRIDGE_ZONES = ["shelf", "drawer", "door", "freezer"] as const;

const FridgeItemSchema = z.object({
  name: z.string().min(1).max(60),
  category: z.enum(FRIDGE_CATEGORIES),
  quantity: z.number().positive().max(10000).optional(),
  unit: z.string().max(12).optional(),
  zone: z.enum(FRIDGE_ZONES),
  level: z.number().int().min(0).max(8),
  x: z.number().min(0).max(1),
  depth: z.enum(["front", "back"]),
  confidence: z.number().min(0).max(1),
  expiresHint: z.string().max(40).optional(),
});

const FridgeScanSchema = z.object({
  items: z.array(FridgeItemSchema).max(60),
  shelvesSeen: z.number().int().min(0).max(8),
  doorVisible: z.boolean(),
});

export type FridgeScan = z.infer<typeof FridgeScanSchema>;

const FRIDGE_EXAMPLE: FridgeScan = {
  items: [{ name: "leche", category: "lacteo", quantity: 1, unit: "l", zone: "door", level: 0, x: 0.3, depth: "front", confidence: 0.9 }],
  shelvesSeen: 3,
  doorVisible: true,
};

const num = (v: unknown, lo: number, hi: number, dflt: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);

/** Arregla lo que un modelo sin salida estructurada devuelve «casi bien» (zona «main», nivel 1.5…). */
export function coerceFridge(raw: unknown): unknown {
  const o = (raw ?? {}) as { items?: unknown; shelvesSeen?: unknown; doorVisible?: unknown };
  const items = (Array.isArray(o.items) ? o.items : [])
    .map((it) => (it ?? {}) as Record<string, unknown>)
    .filter((it) => typeof it.name === "string" && it.name.trim())
    .slice(0, 60)
    .map((it) => ({
      name: String(it.name).trim().slice(0, 60),
      category: (FRIDGE_CATEGORIES as readonly string[]).includes(String(it.category)) ? it.category : "otros",
      ...(typeof it.quantity === "number" && it.quantity > 0 ? { quantity: Math.min(10000, it.quantity), ...(typeof it.unit === "string" ? { unit: it.unit.slice(0, 12) } : {}) } : {}),
      zone: (FRIDGE_ZONES as readonly string[]).includes(String(it.zone)) ? it.zone : "shelf",
      level: Math.round(num(it.level, 0, 8, 0)),
      x: num(it.x, 0, 1, 0.5),
      depth: it.depth === "back" ? "back" : "front",
      confidence: num(it.confidence, 0, 1, 0.6),
      ...(typeof it.expiresHint === "string" && it.expiresHint ? { expiresHint: it.expiresHint.slice(0, 40) } : {}),
    }));
  return { items, shelvesSeen: Math.round(num(o.shelvesSeen, 0, 8, 0)), doorVisible: o.doorVisible === true };
}

const PRODUCT_INSTRUCTIONS =
  "Eres el asistente de nutrición de CheluisFIT. Te doy una o dos fotos de un producto envasado " +
  "(delantera y, si la hay, la etiqueta de información nutricional). Usa la herramienta " +
  "propose_food para proponer sus datos: nombre, marca si se ve, código de barras si se ve, y " +
  "los valores nutricionales SIEMPRE por 100 g o 100 ml — si la etiqueta los da por ración, " +
  "conviértelos tú a 100 g antes de proponerlos. No inventes un valor que no puedas leer o " +
  "estimar razonablemente: en ese caso, pon 0. No guardes nada tú mismo, solo propón.";

const NutrientsSchema = z.object({
  kcal: z.number().nonnegative().max(900),
  protein: z.number().nonnegative().max(100),
  carbs: z.number().nonnegative().max(100),
  fat: z.number().nonnegative().max(100),
  fiber: z.number().nonnegative().max(100),
  sugars: z.number().nonnegative().max(100),
  satFat: z.number().nonnegative().max(100),
  salt: z.number().nonnegative().max(100),
});

const tools = {
  propose_food: tool({
    description: "Propone los datos de un producto leídos de sus fotos. No se guarda hasta que la persona lo confirme.",
    inputSchema: z.object({
      name: z.string().min(1).max(120),
      brand: z.string().max(80).optional(),
      barcode: z.string().max(20).optional(),
      per100: NutrientsSchema,
    }),
  }),
};

export type FoodProposal = {
  type: "propose_food";
  name: string;
  brand?: string;
  barcode?: string;
  per100: z.infer<typeof NutrientsSchema>;
};

function toFoodProposals(toolCalls: { toolName: string; input: unknown }[]): FoodProposal[] {
  return toolCalls.filter((c) => c.toolName === "propose_food").map((c) => ({ type: "propose_food", ...(c.input as Omit<FoodProposal, "type">) }));
}

/**
 * Lo que devuelve Gemini para la nevera es texto libre, no una `tool` — una lista de líneas no
 * necesita el andamiaje de tool-calling, y así se puede usar un modelo de texto igual de bien.
 */
export function parseIngredientLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    // Un preámbulo («Aquí tienes…:») o una frase larga no es un ingrediente.
    .filter((l) => l && l.length <= 60 && !l.endsWith(":"));
}

/** Ingredientes del plan B en texto: sin posición (`zone` desconocida), el móvil los coloca. */
function textFallbackScan(lines: string[]): FridgeScan & { positioned: false } {
  return {
    items: lines.map((name) => ({ name, category: "otros" as const, zone: "shelf" as const, level: 0, x: 0.5, depth: "front" as const, confidence: 0.5 })),
    shelvesSeen: 0,
    doorVisible: false,
    positioned: false,
  };
}

/**
 * Llamadas de IA con foto (nevera, identificación de producto). Endpoints aparte de
 * `/api/ai/chat`: las fotos van por multipart, no por JSON; respaldo con el modelo de visión de
 * Groq — ver `vision.ts`.
 */
export const registerAiVision: Register = (app, { db, cfg }) => {
  const visionLimit = { config: { rateLimit: { max: 20, timeWindow: "1 hour", keyGenerator: perUserKey } } };

  // Respuesta: `{ items: string[] }` (compatibilidad con APK antiguas, que solo leen nombres) +
  // `scan` con posiciones/categorías para la vista 3D (`positioned: false` si vino del plan B).
  app.post("/api/ai/vision/fridge", visionLimit, async (req) => {
    requireUser(db, req.headers.authorization);
    requireVisionKey(cfg);
    const images = await readImages(req, ["photo"]);
    const photo = images.get("photo")!;
    const structured = await callVisionObject(cfg, FRIDGE_INSTRUCTIONS, [photo], "¿Qué alimentos hay en esta foto de la nevera y dónde está cada uno?", FridgeScanSchema, req.log, {
      example: FRIDGE_EXAMPLE,
      coerce: coerceFridge,
    });
    if (structured) return { items: structured.items.map((i) => i.name), scan: { ...structured, positioned: true } };
    const { reply } = await callVision(cfg, FRIDGE_TEXT_INSTRUCTIONS, [photo], "¿Qué ingredientes hay en esta nevera?", undefined, req.log);
    const lines = parseIngredientLines(reply);
    return { items: lines, scan: textFallbackScan(lines) };
  });

  app.post("/api/ai/vision/product", visionLimit, async (req) => {
    requireUser(db, req.headers.authorization);
    requireVisionKey(cfg);
    const images = await readImages(req, ["front"], ["back"]);
    const parts = [images.get("front")!, ...(images.has("back") ? [images.get("back")!] : [])];
    const { reply, toolCalls } = await callVision(cfg, PRODUCT_INSTRUCTIONS, parts, "Identifica este producto y propón sus datos.", tools, req.log);
    return { reply, proposals: toFoodProposals(toolCalls) };
  });
};
