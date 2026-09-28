import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText, type ModelMessage } from "ai";
import type { FastifyBaseLogger, FastifyRequest } from "fastify";
import { HttpError, logSafeError } from "./http";
import type { AppConfig } from "./routes/ctx";

export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const UNAVAILABLE = "La IA con foto no está disponible ahora mismo";

/** Antes de leer nada: sin clave no tiene sentido recibir hasta 16 MB de fotos para nada. */
export function requireVisionKey(cfg: AppConfig): void {
  if (!cfg.geminiApiKey) throw new HttpError(503, UNAVAILABLE);
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
 * Llamada de IA con imágenes. Solo Gemini: el modelo de respaldo de Groq (`GROQ_MODEL`, ver
 * `routes/ai.ts`) no tiene visión, así que aquí no hay reintento — mejor un 503 claro que un
 * intento silencioso contra un modelo que no puede ver la foto.
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

  try {
    const google = createGoogleGenerativeAI({ apiKey: cfg.geminiApiKey });
    const result = await generateText({ model: google(GEMINI_MODEL), instructions, messages, tools });
    return { reply: result.text, toolCalls: result.toolCalls };
  } catch (e) {
    // El 503 es claro para quien usa la app, pero el motivo real (p. ej. un modelo retirado por
    // Google, como le pasó a gemini-2.5-flash-lite) tiene que quedar en el log del servidor:
    // sin esta línea el fallo era indistinguible de «falta la clave» sin depurar a mano.
    // Solo el resumen (`logSafeError`): el error del SDK lleva la foto en base64 dentro.
    if (log) log.error({ err: logSafeError(e) }, "[vision] la llamada a Gemini falló");
    else console.error("[vision] la llamada a Gemini falló:", logSafeError(e));
    throw new HttpError(503, UNAVAILABLE);
  }
}
