import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { generateText, Output, tool, type LanguageModel, type ModelMessage } from "ai";
import type { FastifyBaseLogger } from "fastify";
import { z } from "zod";
import { requireUser } from "../auth";
import { HttpError, logSafeError, perUserKey } from "../http";
import { AiAnalyzeInput, AiChatInput } from "../schemas";
import type { AppConfig } from "./ctx";
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
  general:
    "Eres el asistente de CheluisFIT (nutrición, running y fuerza). Tienes un resumen de hoy y de la " +
    "última semana de las tres áreas: úsalo para responder con una visión de conjunto.",
};

const COMMON_PROMPT =
  "Responde en español, breve y concreto (2-4 frases salvo que pidan más detalle). Si tu " +
  "respuesta implica un cambio de verdad en los datos de la persona (añadir una comida, apuntar " +
  "una nota, ajustar un objetivo), usa la herramienta correspondiente en vez de solo describirlo " +
  "en el texto — la persona verá una tarjeta para confirmarlo antes de que se aplique nada. " +
  "Nunca afirmes que ya registraste o guardaste algo: sin la confirmación de la persona no se " +
  "aplica nada. Cuando uses una herramienta, acompáñala con una frase corta en el texto diciendo " +
  "qué propones (el detalle numérico va en la herramienta, no en el texto). " +
  "Usa solo los datos del contexto: no inventes cifras, fechas ni sesiones que no estén ahí; si " +
  "falta algo para responder bien, dilo y sugiere cómo registrarlo en la app. Ten en cuenta el " +
  "perfil (edad, sexo, peso, objetivo) al recomendar cantidades. Ante dolor, lesiones, mareos o " +
  "cualquier tema médico, sé prudente y recomienda consultar a un profesional. Puedes usar una " +
  "lista corta con guiones si das varias opciones.";

const MEAL_SLOTS = ["breakfast", "midmorning", "lunch", "snack", "dinner"] as const;

const tools = {
  add_meal_entry: tool({
    description: "Propone añadir un alimento o plato a una comida (de hoy salvo que la persona hable de otro día). No se guarda hasta que la persona lo confirme.",
    inputSchema: z.object({
      name: z.string().min(1).max(120).describe("Nombre del alimento o plato"),
      meal: z.enum(MEAL_SLOTS),
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe("Fecha YYYY-MM-DD si no es hoy (p. ej. «ayer cené…»); el contexto dice qué día es hoy"),
      grams: z.number().positive().max(3000),
      kcal: z.number().nonnegative().max(5000),
      protein: z.number().nonnegative().max(500),
      carbs: z.number().nonnegative().max(500),
      fat: z.number().nonnegative().max(500),
    }),
  }),
  add_note: tool({
    description:
      "Propone añadir una nota a la sesión que la persona tiene abierta en pantalla (el contexto lo indica con «Pantalla actual») o, si no hay ninguna, a la más reciente de la sección. No se guarda hasta confirmarlo.",
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
  | { type: "add_meal_entry"; name: string; meal: (typeof MEAL_SLOTS)[number]; date?: string; grams: number; kcal: number; protein: number; carbs: number; fat: number }
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
 * Gemini primero y, si falla (cuota, red, modelo retirado), Groq como respaldo. Lanza 502 si
 * ninguno responde. Compartido por el chat y el análisis de entrenos.
 */
async function withFallback<T>(cfg: AppConfig, log: FastifyBaseLogger, what: string, run: (model: LanguageModel) => Promise<T>): Promise<T> {
  let lastError: unknown;
  if (cfg.geminiApiKey) {
    try {
      const google = createGoogleGenerativeAI({ apiKey: cfg.geminiApiKey });
      return await run(google(GEMINI_MODEL));
    } catch (err) {
      lastError = err;
      log.warn({ err: logSafeError(err) }, `${what}: Gemini falló, probando con Groq`);
    }
  }
  if (cfg.groqApiKey) {
    try {
      const groq = createGroq({ apiKey: cfg.groqApiKey });
      return await run(groq(GROQ_MODEL));
    } catch (err) {
      lastError = err;
    }
  }
  log.error({ err: logSafeError(lastError) }, `${what}: no respondió ni Gemini ni Groq`);
  throw new HttpError(502, "La IA no responde ahora mismo, prueba en un rato");
}

const ANALYZE_PROMPT: Record<"workout" | "run" | "week" | "match", string> = {
  workout:
    "Eres el entrenador de fuerza de CheluisFIT. Te doy los datos ya calculados de un entrenamiento " +
    "de gimnasio y de las sesiones anteriores de los mismos ejercicios. Analiza el rendimiento: " +
    "progresión (peso, repeticiones, 1RM estimado), récords, esfuerzo (RIR/RPE), volumen y descansos.",
  run:
    "Eres el entrenador de running de CheluisFIT. Te doy los datos ya calculados de una carrera o " +
    "caminata y de las semanas anteriores. Analiza ritmo, regularidad por vueltas, frecuencia " +
    "cardiaca y zonas, cumplimiento del plan y la carga respecto a las semanas previas.",
  match:
    "Eres el entrenador de fútbol de CheluisFIT (fútbol amateur con amigos). Te doy los datos ya " +
    "calculados de un partido (minutos, distancia, pulso, resultado, goles, asistencias, posición) y " +
    "de los partidos anteriores. Analiza la intensidad, el físico respecto a otros partidos y la " +
    "aportación según la posición; recomienda cómo recuperar y qué trabajar (resistencia, cambios de ritmo).",
  week:
    "Eres el entrenador de CheluisFIT. Te doy el resumen ya calculado de una semana (fuerza, " +
    "running y nutrición) y de las anteriores. Analiza la semana en conjunto: constancia, " +
    "equilibrio entre grupos musculares, carga de running y si la alimentación acompaña al objetivo.",
};

const ANALYZE_COMMON =
  "Responde en español, cercano y concreto. Los números ya están calculados: úsalos tal cual, no " +
  "los recalcules ni inventes otros. headline: una frase de resumen (máx. 100 caracteres). " +
  "highlights: 1-4 cosas que fueron bien, con su dato. warnings: 0-3 cosas a vigilar (fatiga, " +
  "estancamiento, desequilibrio, poco descanso), solo si los datos lo justifican. nextTime: 1-3 " +
  "recomendaciones concretas para la próxima vez (con números: kilos, repeticiones, ritmo, km). " +
  "score: del 1 al 10, cómo de buena fue la sesión o la semana para el objetivo. Sin consejos " +
  "médicos: ante dolor o molestias, recomienda consultar a un profesional.";

export const AnalysisSchema = z.object({
  headline: z.string().min(1).max(160),
  highlights: z.array(z.string().max(220)).max(4),
  warnings: z.array(z.string().max(220)).max(3),
  nextTime: z.array(z.string().max(220)).max(3),
  score: z.number().min(1).max(10),
});

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

    return withFallback(cfg, req.log, "Asistente", (model) => chat(model, instructions, messages));
  });

  // Análisis de un entreno, una carrera o una semana. El móvil manda los números ya calculados
  // (`domain/analysis.ts`); el modelo solo los interpreta y devuelve un objeto con forma fija.
  app.post("/api/ai/analyze", aiLimit, async (req) => {
    requireUser(db, req.headers.authorization);
    if (!cfg.geminiApiKey && !cfg.groqApiKey) throw new HttpError(503, "La IA no está configurada todavía");
    const body = AiAnalyzeInput.parse(req.body);
    const instructions = `${ANALYZE_PROMPT[body.kind]}\n\n${ANALYZE_COMMON}${body.goal ? `\n\nObjetivo de la persona: ${body.goal}` : ""}`;
    return withFallback(cfg, req.log, "Análisis", async (model) => {
      const result = await generateText({ model, instructions, prompt: body.data, output: Output.object({ schema: AnalysisSchema }) });
      const parsed = AnalysisSchema.safeParse(result.output);
      if (!parsed.success) throw new Error("La IA devolvió un análisis con forma inválida");
      return { analysis: parsed.data };
    });
  });
};
