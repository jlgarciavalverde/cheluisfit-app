import { z } from "zod";

export const RegisterInput = z.object({
  email: z.string().trim().toLowerCase().email("Correo no válido").max(200),
  password: z.string().min(8, "Mínimo 8 caracteres").max(200),
  name: z.string().trim().min(1, "Ponle un nombre").max(80),
  inviteCode: z.string().trim().toUpperCase().length(8).optional(),
  setupCode: z.string().optional(),
  householdName: z.string().trim().min(1).max(80).optional(),
});

export const LoginInput = z.object({
  email: z.string().trim().toLowerCase().email("Correo no válido"),
  password: z.string().min(1, "Falta la contraseña"),
});

export const StravaSyncInput = z.object({
  // ISO de la última sincronización del móvil (`useRunning().lastStravaSync`), o `null` en la
  // primera vez — el servidor solo la traduce al `after` que pide Strava, la decisión de qué
  // ventana pedir (ahora, no todo el histórico, en la primera vez) vive en el móvil.
  since: z.string().nullable(),
});

export const AiChatInput = z.object({
  section: z.enum(["nutrition", "running", "strength", "general"]),
  // El histórico de la conversación en memoria del panel (ver `AiAssistant.tsx`), no el de la app.
  // Tolerante a propósito: Gemini a veces responde solo con una propuesta (texto vacío) y las APK
  // anteriores a la 0.11 reenvían ese mensaje vacío tal cual, y nadie recortaba la conversación.
  // En vez de un 400 que rompe el chat al segundo mensaje, se quitan los vacíos, se recorta cada
  // mensaje a 2000 caracteres y se queda con los últimos 20.
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(20_000) }))
    .max(200)
    .transform((ms) =>
      ms
        .map((m) => ({ role: m.role, content: m.content.trim().slice(0, 2000) }))
        .filter((m) => m.content.length > 0)
        .slice(-20)
        // Tras recortar, la conversación debe seguir empezando por la persona (Gemini lo exige).
        .filter((m, i, arr) => arr.slice(0, i + 1).some((x) => x.role === "user")),
    )
    .refine((ms) => ms.length > 0, "Escribe un mensaje"),
  // Resumen compacto que construye el móvil (`domain/aiContext.ts`), nunca el histórico entero.
  context: z.string().max(4000),
});

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

export const CreatePostInput = z.object({
  kind: z.enum(["run", "strength", "free"]),
  text: z.string().trim().max(1000).default(""),
  // El servidor no interpreta el snapshot (lo construye el móvil, domain/socialSnapshot.ts) —
  // solo valida forma y tamaño (móvil en datos móviles no debería subir kilos de JSON).
  snapshot: z.record(z.string(), z.unknown()).refine((s) => JSON.stringify(s).length <= 8192, "El resumen del entreno pesa demasiado"),
  mediaIds: z.array(z.string()).max(4).default([]),
});

export const CreateCommentInput = z.object({
  text: z.string().trim().min(1, "Escribe algo").max(500),
});

export const UpdateProfileInput = z.object({
  bio: z.string().trim().max(300).optional(),
  avatarMediaId: z.string().nullable().optional(),
  isPrivate: z.boolean().optional(),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(USERNAME_RE, "Solo minúsculas, números y guiones, 3-30 caracteres")
    .optional(),
});
