import { tool } from "ai";
import { z } from "zod";
import { requireUser } from "../auth";
import { perUserKey } from "../http";
import { callVision, readImages, requireVisionKey } from "../vision";
import type { Register } from "./ctx";

const FRIDGE_INSTRUCTIONS =
  "Eres el asistente de nutrición de CheluisFIT. Te doy una foto del interior de una nevera. " +
  "Responde SOLO con los ingredientes que reconozcas, uno por línea, en español, sin números ni " +
  "viñetas ni explicación adicional. Si no reconoces nada con claridad, responde con una línea " +
  "vacía.";

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
function parseIngredientLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^[-*•\d.)\s]+/, "").trim())
    .filter(Boolean);
}

/**
 * Llamadas de IA con foto (nevera, identificación de producto). Endpoints aparte de
 * `/api/ai/chat`: las fotos van por multipart, no por JSON, y no hay reintento con Groq (sin
 * visión) — ver `vision.ts`.
 */
export const registerAiVision: Register = (app, { db, cfg }) => {
  const visionLimit = { config: { rateLimit: { max: 20, timeWindow: "1 hour", keyGenerator: perUserKey } } };

  app.post("/api/ai/vision/fridge", visionLimit, async (req) => {
    requireUser(db, req.headers.authorization);
    requireVisionKey(cfg);
    const images = await readImages(req, ["photo"]);
    const { reply } = await callVision(cfg, FRIDGE_INSTRUCTIONS, [images.get("photo")!], "¿Qué ingredientes hay en esta nevera?", undefined, req.log);
    return { items: parseIngredientLines(reply) };
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
