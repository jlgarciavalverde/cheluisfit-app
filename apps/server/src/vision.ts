import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { generateText, Output, type ModelMessage } from "ai";
import type { z } from "zod";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import { HttpError, logSafeError } from "./http";
import type { AppConfig } from "./routes/ctx";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
/** Respaldo con visión en Groq (desde la 0.18; el `GROQ_MODEL` del chat no ve fotos). */
export const GROQ_VISION_MODEL = process.env.GROQ_VISION_MODEL || "qwen/qwen3.8-27b";

const UNAVAILABLE = "La IA con foto no está disponible ahora mismo";

/** Antes de leer nada: sin clave no tiene sentido recibir hasta 16 MB de fotos para nada. */
export function requireVisionKey(cfg: AppConfig): void {
  if (!cfg.geminiApiKey && !cfg.groqApiKey) throw new HttpError(503, UNAVAILABLE);
}

/** Modelos con visión por orden: Gemini y, si falla o no hay clave, el de visión de Groq. */
function visionModels(cfg: AppConfig) {
  const out = [];
  if (cfg.geminiApiKey) out.push({ name: "Gemini", model: createGoogleGenerativeAI({ apiKey: cfg.geminiApiKey })(GEMINI_MODEL) });
  if (cfg.groqApiKey) out.push({ name: "Groq", model: createGroq({ apiKey: cfg.groqApiKey })(GROQ_VISION_MODEL) });
  return out;
}

const ALLOWED_IMAGE = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export interface ImagePart {
  buffer: Buffer;
  mediaType: string;
}

/**
 * Lee las fotos de una petición multipart, indexadas por `fieldname`. Fotos desechables (una
 * lectura de IA, nunca se guardan) — a diferencia de `routes/media.ts`, nada de esto toca
 * `cfg.mediaDir` ni la tabla `media`: los `Buffer` se procesan en memoria y se descartan al
 * terminar la petición.
 */
export async function readImages(req: FastifyRequest, required: string[], optional: string[] = []): Promise<Map<string, ImagePart>> {
  const out = new Map<string, ImagePart>();
  const wanted = new Set([...required, ...optional]);
  try {
    for await (const part of req.files({ limits: { fileSize: MAX_IMAGE_BYTES, files: wanted.size } })) {
      // Un archivo que no se lee deja la petición colgada para siempre (el iterador de
      // @fastify/multipart espera a que se consuma): se vacía y se sigue.
      if (!wanted.has(part.fieldname)) {
        part.file.resume();
        continue;
      }
      if (!ALLOWED_IMAGE.has(part.mimetype)) {
        part.file.resume();
        throw new HttpError(415, "Solo se aceptan fotos (jpg/png/webp)");
      }
      out.set(part.fieldname, { buffer: await part.toBuffer(), mediaType: part.mimetype });
    }
  } catch (e) {
    if (e instanceof HttpError) throw e;
    // Los errores de la librería vienen en inglés («request file too large»…).
    const code = (e as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE") throw new HttpError(413, "La foto pesa demasiado (máx. 8 MB)");
    if (code === "FST_FILES_LIMIT") throw new HttpError(413, "Demasiadas fotos en la misma petición");
    if (code === "FST_INVALID_MULTIPART_CONTENT_TYPE") throw new HttpError(400, "Se esperaba una foto (multipart/form-data)");
    throw e;
  }
  for (const field of required) {
    if (!out.has(field)) throw new HttpError(400, `Falta la foto «${field}»`);
  }
  return out;
}

/**
 * Llamada de IA con imágenes: Gemini y, si falla, `GROQ_VISION_MODEL` (un modelo de Groq que sí
 * ve fotos; el `GROQ_MODEL` del chat no). Desde la 0.18 — antes era solo Gemini y una clave de
 * Gemini caducada dejaba la Nevera y el escaneo por foto sin funcionar. 503 si fallan los dos.
 */
export async function callVision(
  cfg: AppConfig,
  instructions: string,
  images: ImagePart[],
  text: string,
  tools?: Parameters<typeof generateText>[0]["tools"],
  log?: FastifyBaseLogger,
): Promise<{ reply: string; toolCalls: { toolName: string; input: unknown }[] }> {
  requireVisionKey(cfg);

  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [{ type: "text", text }, ...images.map((img) => ({ type: "image" as const, image: img.buffer, mediaType: img.mediaType }))],
    },
  ];

  for (const { name, model } of visionModels(cfg)) {
    try {
      const result = await generateText({ model, instructions, messages, tools });
      return { reply: result.text, toolCalls: result.toolCalls };
    } catch (e) {
      // El motivo real (clave caducada, modelo retirado por Google…) tiene que quedar en el log:
      // sin esto el fallo era indistinguible de «falta la clave». Solo el resumen
      // (`logSafeError`): el error del SDK lleva la foto en base64 dentro.
      if (log) log.error({ err: logSafeError(e) }, `[vision] la llamada a ${name} falló`);
      else console.error(`[vision] la llamada a ${name} falló:`, logSafeError(e));
    }
  }
  throw new HttpError(503, UNAVAILABLE);
}

/**
 * Igual que `callVision`, pero pidiendo un objeto que cumpla `schema`. Gemini usa su salida
 * estructurada (`Output.object`); el modelo de visión de Groq no la admite con fotos («Generated
 * JSON does not match the expected schema», comprobado en producción), así que a él se le pide el
 * JSON en el texto con un ejemplo y se pasa por `coerce` (que arregla zonas/categorías que no
 * existen, nombres en inglés no, eso no) antes de validarlo. `null` si ninguno da algo válido.
 */
export async function callVisionObject<S extends z.ZodType>(
  cfg: AppConfig,
  instructions: string,
  images: ImagePart[],
  text: string,
  schema: S,
  log?: FastifyBaseLogger,
  json?: { example: unknown; coerce: (raw: unknown) => unknown },
): Promise<z.infer<S> | null> {
  requireVisionKey(cfg);
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [{ type: "text", text }, ...images.map((img) => ({ type: "image" as const, image: img.buffer, mediaType: img.mediaType }))],
    },
  ];
  for (const { name, model } of visionModels(cfg)) {
    try {
      let raw: unknown;
      if (name === "Gemini" || !json) {
        raw = (await generateText({ model, instructions, messages, output: Output.object({ schema }) })).output;
      } else {
        const r = await generateText({
          model,
          instructions: `${instructions}\n\nResponde SOLO con un objeto JSON, sin texto alrededor, con esta forma (ejemplo): ${JSON.stringify(json.example)}`,
          messages,
        });
        const m = r.text.match(/\{[\s\S]*\}/);
        raw = m ? json.coerce(JSON.parse(m[0])) : null;
      }
      const parsed = schema.safeParse(raw);
      if (parsed.success) return parsed.data;
      if (log) log.warn(`[vision] ${name} devolvió un objeto con forma inválida`);
    } catch (e) {
      if (log) log.warn({ err: logSafeError(e) }, `[vision] la salida estructurada de ${name} falló`);
      else console.warn(`[vision] la salida estructurada de ${name} falló:`, logSafeError(e));
    }
  }
  return null;
}
