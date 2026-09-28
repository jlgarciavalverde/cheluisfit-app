import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { generateText, tool, type LanguageModel, type ModelMessage } from "ai";
import { z } from "zod";
import { requireUser } from "../auth";
import { HttpError, logSafeError, perUserKey } from "../http";
import { AiChatInput } from "../schemas";
import { GEMINI_MODEL } from "../vision";
import type { Register } from "./ctx";

// Modelos configurables por variable de entorno a propósito: los catálogos gratuitos de Gemini y
// Groq cambian con frecuencia (modelos que se retiran del nivel gratuito, otros nuevos que
// aparecen) — un valor por defecto razonable, pero sin obligar a tocar código para cambiarlo.
// (El de Gemini vive en `vision.ts`, compartido con la IA con foto.)
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

const SECTION_PROMPT: Record<string, string> = {
  nutrition:
    "Eres el asistente de nutrición de CheluisFIT, una app de fitness para un grupo pequeño de " +
    "amigos y familia. Ayudas a interpretar las comidas registradas y a recomendar qué comer, " +
    "con criterio nutricional razonable, sin sustituir el consejo de un profesional sanitario.",
  running:
    "Eres el asistente de running de CheluisFIT. Comentas cómo ha ido el entrenamiento (ritmo, " +
    "distancia, comparación con el plan) y ayudas a decidir qué correr a continuación.",
  strength:
    "Eres el asistente de gimnasio de CheluisFIT. Comentas el rendimiento en fuerza (volumen, " +
    "récords, progresión) y ayudas con la sobrecarga progresiva.",
  general: "Eres el asistente de CheluisFIT (nutrición, running y fuerza). Responde con criterio general.",
};

const COMMON_PROMPT =
  "Responde en español, breve y concreto (2-4 frases salvo que pidan más detalle). Si tu " +
  "respuesta implica un cambio de verdad en los datos de la persona (añadir una comida, apuntar " +
  "una nota, ajustar un objetivo), usa la herramienta correspondiente en vez de solo describirlo " +
  "en el texto — la persona verá una tarjeta para confirmarlo antes de que se aplique nada. " +
  "Nunca afirmes que ya registraste o guardaste algo: sin la confirmación de la persona no se " +
  "aplica nada. Cuando uses una herramienta, acompáñala con una frase corta en el texto diciendo " +
  "qué propones (el detalle numérico va en la herramienta, no en el texto).";

const MEAL_SLOTS = ["breakfast", "midmorning", "lunch", "snack", "dinner"] as const;

const tools = {
  add_meal_entry: tool({
    description: "Propone añadir un alimento o plato a una comida de hoy. No se guarda hasta que la persona lo confirme.",
    inputSchema: z.object({
      name: z.string().min(1).max(120).describe("Nombre del alimento o plato"),
      meal: z.enum(MEAL_SLOTS),
      grams: z.number().positive().max(3000),
      kcal: z.number().nonnegative().max(5000),
      protein: z.number().nonnegative().max(500),
      carbs: z.number().nonnegative().max(500),
      fat: z.number().nonnegative().max(500),
    }),
  }),
  add_note: tool({
    description: "Propone añadir una nota a la actividad o entrenamiento más reciente de la sección actual. No se guarda hasta confirmarlo.",
    inputSchema: z.object({ note: z.string().min(1).max(300) }),
  }),
  adjust_goal: tool({
    description: "Propone ajustar un objetivo nutricional diario (solo tiene sentido en la sección de nutrición). No se aplica hasta confirmarlo.",
    inputSchema: z.object({
      field: z.enum(["kcal", "protein", "carbs", "fat"]),
      value: z.number().positive().max(10000),
    }),
  }),
};

export type Proposal =
  | { type: "add_meal_entry"; name: string; meal: (typeof MEAL_SLOTS)[number]; grams: number; kcal: number; protein: number; carbs: number; fat: number }
  | { type: "add_note"; note: string }
  | { type: "adjust_goal"; field: "kcal" | "protein" | "carbs" | "fat"; value: number };

function toProposals(toolCalls: { toolName: string; input: unknown }[]): Proposal[] {
  const out: Proposal[] = [];
  for (const call of toolCalls) {
    if (call.toolName === "add_meal_entry") out.push({ type: "add_meal_entry", ...(call.input as Omit<Extract<Proposal, { type: "add_meal_entry" }>, "type">) });
    else if (call.toolName === "add_note") out.push({ type: "add_note", ...(call.input as { note: string }) });
    else if (call.toolName === "adjust_goal") out.push({ type: "adjust_goal", ...(call.input as { field: "kcal" | "protein" | "carbs" | "fat"; value: number }) });
  }
  return out;
}

async function chat(model: LanguageModel, instructions: string, messages: ModelMessage[]) {
  // El system prompt va en `instructions`, no como mensaje: el SDK de IA rechaza mensajes
  // "system" dentro de `messages` (AI_InvalidPromptError) — así se comportan Gemini y Groq.
  const result = await generateText({ model, instructions, messages, tools });
  return { reply: result.text, proposals: toProposals(result.toolCalls) };
}

/**
 * Proxy de IA: la clave de cada proveedor vive solo aquí (nunca llega al móvil). Gemini es el
 * proveedor principal; si falla (cuota agotada, error de red) se reintenta una vez con Groq como
 * respaldo, antes de rendirse. Ninguna `tool` tiene `execute`: el modelo solo propone, nunca
 * ejecuta nada — quien aplica el cambio de verdad es el móvil, y solo si la persona lo confirma.
 */
export const registerAi: Register = (app, { db, cfg }) => {
  const aiLimit = { config: { rateLimit: { max: 30, timeWindow: "1 hour", keyGenerator: perUserKey } } };

  app.post("/api/ai/chat", aiLimit, async (req) => {
    requireUser(db, req.headers.authorization);
    if (!cfg.geminiApiKey && !cfg.groqApiKey) throw new HttpError(503, "El asistente de IA no está configurado todavía");

    const body = AiChatInput.parse(req.body);
    const instructions = `${SECTION_PROMPT[body.section]}\n\n${COMMON_PROMPT}\n\nContexto de la persona:\n${body.context}`;
    const messages: ModelMessage[] = body.messages.map((m) => ({ role: m.role, content: m.content }) as ModelMessage);

    let lastError: unknown;
    if (cfg.geminiApiKey) {
      try {
        const google = createGoogleGenerativeAI({ apiKey: cfg.geminiApiKey });
        return await chat(google(GEMINI_MODEL), instructions, messages);
      } catch (err) {
        lastError = err;
        app.log.warn({ err: logSafeError(err) }, "Gemini falló, probando con Groq");
      }
    }
    if (cfg.groqApiKey) {
      try {
        const groq = createGroq({ apiKey: cfg.groqApiKey });
        return await chat(groq(GROQ_MODEL), instructions, messages);
      } catch (err) {
        lastError = err;
      }
    }
    app.log.error({ err: logSafeError(lastError) }, "El asistente de IA no respondió (ni Gemini ni Groq)");
    throw new HttpError(502, "El asistente no responde ahora mismo, prueba en un rato");
  });
};
