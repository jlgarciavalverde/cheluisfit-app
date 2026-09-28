// Cliente del servidor (`apps/server`). Autenticación por token (ver `authStore.ts`) y
// sincronización de los blobs de cada tienda local (ver `sync.ts`). `EXPO_PUBLIC_API_URL`
// permite apuntar a otra URL en desarrollo; en producción usa el subdominio real.
import type { ImportedActivity } from "./healthConnect";

export const API_BASE = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || "https://cheluisfit.redgarverde.com";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Cuerpo JSON de la respuesta de error, si lo hubo (p. ej. el blob del servidor en un 409). */
    public body?: unknown,
  ) {
    super(message);
  }
}

const REQUEST_TIMEOUT_MS = 8000;
const UPLOAD_TIMEOUT_MS = 30000; // fotos/vídeos pesan más y suben más despacio que una petición normal
// El chat espera a que el servidor llame a Gemini (y, si falla, a Groq): bastante más que 8 s.
const AI_CHAT_TIMEOUT_MS = 45000;
// Las llamadas de IA con foto, además de subir la imagen, esperan a que el servidor llame a
// Gemini y este responda — ese viaje de ida y vuelta puede tardar bastante más que una subida
// normal (visto de verdad: intentos reales en el móvil que no llegaban a completarse a tiempo).
const AI_VISION_TIMEOUT_MS = 60000;

const TIMEOUT_MESSAGE = "El servidor tardó demasiado en responder. Prueba otra vez en un rato.";
const OFFLINE_MESSAGE = "Sin conexión con el servidor. Comprueba la red y prueba otra vez.";

/** Cualquier fallo que no sea una respuesta HTTP (red caída, timeout) acaba como `ApiError(0)`. */
function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  return new ApiError(0, e instanceof Error && e.name === "AbortError" ? TIMEOUT_MESSAGE : OFFLINE_MESSAGE);
}

/**
 * Lee la respuesta como texto y la interpreta aparte: un proxy intermedio (Cloudflare) puede
 * responder HTML, y `res.json()` sobre eso lanzaría un `SyntaxError` críptico en vez de un
 * `ApiError` con el status real.
 */
async function readJson<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let json: unknown = null;
  let parsed = true;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    parsed = false;
  }
  const message = (json as { message?: unknown } | null)?.message;
  if (!res.ok) throw new ApiError(res.status, typeof message === "string" ? message : `Error ${res.status}`, json ?? undefined);
  if (!parsed) throw new ApiError(res.status, "El servidor ha respondido algo inesperado. Prueba otra vez en un rato.");
  return json as T;
}

/** `fetch` con timeout que cubre también la lectura del cuerpo, no solo la cabecera. */
async function fetchJson<T>(url: string, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    return await readJson<T>(res);
  } catch (e) {
    throw toApiError(e);
  } finally {
    clearTimeout(timeout);
  }
}

async function request<T>(
  path: string,
  opts: { method?: string; token?: string | null; body?: unknown; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<T> {
  return fetchJson<T>(
    `${API_BASE}${path}`,
    {
      method: opts.method ?? "GET",
      headers: {
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    },
    opts.timeoutMs ?? REQUEST_TIMEOUT_MS,
  );
}

/**
 * Mismo patrón que `api.uploadMedia`, pero contra un endpoint de IA con foto (no `/api/media`:
 * la foto no se guarda). Un fallo de red inmediato (en datos móviles la subida a veces no sale a
 * la primera) merece UN reintento; un **timeout no**: ese primer intento puede haber llegado ya a
 * Gemini, y repetirlo gastaría dos veces la cuota (y el límite de 20/hora) haciendo esperar hasta
 * 2 minutos. Un error HTTP se respeta a la primera.
 */
async function uploadForAi<T>(path: string, token: string, form: FormData): Promise<T> {
  const attempt = () => fetchJson<T>(`${API_BASE}${path}`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, AI_VISION_TIMEOUT_MS);
  const slow = () => new ApiError(0, "La subida tardó demasiado — prueba con WiFi o mejor cobertura");
  try {
    return await attempt();
  } catch (e) {
    const err = toApiError(e);
    if (err.status !== 0) throw err;
    if (err.message === TIMEOUT_MESSAGE) throw slow();
    try {
      return await attempt();
    } catch (e2) {
      const err2 = toApiError(e2);
      throw err2.message === TIMEOUT_MESSAGE ? slow() : err2;
    }
  }
}

export interface ApiUser {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
}
export interface ApiHousehold {
  id: string;
  name: string;
  members: ApiUser[];
}

export type AiSection = "nutrition" | "running" | "strength" | "general";
export interface AiMessage {
  role: "user" | "assistant";
  content: string;
}
/** Ver `apps/server/src/routes/ai.ts` — el servidor solo propone, nunca aplica nada solo. */
export type AiProposal =
  | { type: "add_meal_entry"; name: string; meal: "breakfast" | "midmorning" | "lunch" | "snack" | "dinner"; grams: number; kcal: number; protein: number; carbs: number; fat: number }
  | { type: "add_note"; note: string }
  | { type: "adjust_goal"; field: "kcal" | "protein" | "carbs" | "fat"; value: number };

/** Ver `apps/server/src/routes/aiVision.ts` — igual que `AiProposal`, solo una propuesta, nunca un guardado directo. */
export interface FoodProposal {
  type: "propose_food";
  name: string;
  brand?: string;
  barcode?: string;
  per100: { kcal: number; protein: number; carbs: number; fat: number; fiber: number; sugars: number; satFat: number; salt: number };
}

export type FollowState = "self" | "none" | "pending" | "accepted";
export interface PostAuthor {
  id: string;
  name: string;
  username: string;
  avatarUrl?: string;
}
export interface Post {
  id: string;
  kind: "run" | "strength" | "free";
  text: string;
  snapshot: Record<string, unknown>;
  createdAt: number;
  author: PostAuthor;
  media: string[];
  likesCount: number;
  likedByMe: boolean;
  commentsCount: number;
}
export interface SocialComment {
  id: string;
  text: string;
  createdAt: number;
  author: PostAuthor;
}
export interface SocialProfile {
  id: string;
  username: string;
  name: string;
  bio: string;
  avatarUrl?: string;
  isPrivate: boolean;
}
export interface SocialUserSummary {
  username: string;
  name: string;
  avatarUrl?: string;
}

// El servidor manda urls relativas (`/api/media/:id`) — se completan aquí, una sola vez, para
// que ninguna pantalla tenga que conocer `API_BASE`.
const abs = (url?: string): string | undefined => (url ? `${API_BASE}${url}` : undefined);
const absAuthor = (a: PostAuthor): PostAuthor => ({ ...a, avatarUrl: abs(a.avatarUrl) });
const absPost = (p: Post): Post => ({ ...p, author: absAuthor(p.author), media: p.media.map((m) => `${API_BASE}${m}`) });
const absComment = (c: SocialComment): SocialComment => ({ ...c, author: absAuthor(c.author) });
const absProfile = (p: SocialProfile): SocialProfile => ({ ...p, avatarUrl: abs(p.avatarUrl) });
const absSummary = (u: SocialUserSummary): SocialUserSummary => ({ ...u, avatarUrl: abs(u.avatarUrl) });

export const api = {
  setupStatus: () => request<{ needsSetup: boolean }>("/api/setup-status"),

  register: (input: { name: string; email: string; password: string; setupCode?: string; householdName?: string; inviteCode?: string }) =>
    request<{ token: string; user: ApiUser }>("/api/auth/register", { method: "POST", body: input }),

  login: (email: string, password: string) => request<{ token: string; user: ApiUser }>("/api/auth/login", { method: "POST", body: { email, password } }),

  logout: (token: string) => request<void>("/api/auth/logout", { method: "POST", token }),

  me: (token: string) => request<{ user: ApiUser; household: ApiHousehold }>("/api/me", { token }),

  createInvite: (token: string) => request<{ code: string; expiresAt: number }>("/api/household/invites", { method: "POST", token }),

  stravaStatus: (token: string) => request<{ connected: boolean }>("/api/strava/status", { token }),
  stravaConnect: (token: string) => request<{ url: string }>("/api/strava/connect", { method: "POST", token }),
  stravaSync: (token: string, since: string | null) =>
    // `until` (desde la 0.11): hasta dónde avanzar `lastStravaSync` si el servidor cortó por el tope.
    // El servidor pide la ruta de cada actividad una a una: bastante más de 8 s con varias.
    request<{ activities: ImportedActivity[]; until?: string }>("/api/strava/sync", { method: "POST", token, body: { since }, timeoutMs: AI_VISION_TIMEOUT_MS }),
  stravaDisconnect: (token: string) => request<{ ok: boolean }>("/api/strava/disconnect", { method: "DELETE", token }),

  aiChat: (token: string, section: AiSection, messages: AiMessage[], context: string) =>
    request<{ reply: string; proposals?: AiProposal[] }>("/api/ai/chat", { method: "POST", token, body: { section, messages, context }, timeoutMs: AI_CHAT_TIMEOUT_MS }),

  getBlobs: (token: string) => request<{ blobs: { key: string; data: unknown; updatedAt: number }[] }>("/api/blobs", { token, timeoutMs: UPLOAD_TIMEOUT_MS }),

  getBlob: (token: string, key: string) => request<{ key: string; data: unknown; updatedAt: number }>(`/api/blobs/${key}`, { token, timeoutMs: UPLOAD_TIMEOUT_MS }),

  /** Solo claves y versiones (sin los datos), para saber qué ha cambiado en el servidor. */
  getBlobVersions: (token: string) => request<{ blobs: { key: string; updatedAt: number }[] }>("/api/blobs?meta=1", { token }),

  /**
   * `base` = versión del servidor que tenía este dispositivo la última vez (`0` = «aún no había
   * nada»); si el servidor tiene otra responde 409 (`ApiError.body` = `{data, updatedAt}`).
   * `null` = subir sin comprobar (solo la primera vez tras actualizar desde una versión sin esto).
   */
  putBlob: (token: string, key: string, data: unknown, base: number | null) =>
    request<{ updatedAt: number }>(`/api/blobs/${key}${base === null ? "" : `?base=${base}`}`, { method: "PUT", token, body: data, timeoutMs: UPLOAD_TIMEOUT_MS }),

  /**
   * Sube una foto/vídeo (uri local de `expo-image-picker`/`expo-camera`) y devuelve la URL
   * absoluta ya lista para usar en `frames`/`video` del ejercicio — descargarla no exige sesión
   * (la protege el id aleatorio, igual que las fotos del catálogo), así que se guarda y se
   * muestra con `<Image source={{ uri }}>` exactamente igual que cualquier otra.
   */
  async uploadMedia(token: string, uri: string, filename: string, mimeType: string): Promise<{ id: string; url: string }> {
    const form = new FormData();
    // React Native acepta este objeto (no un Blob real) como parte de un FormData multipart.
    form.append("file", { uri, name: filename, type: mimeType } as unknown as Blob);
    const json = await fetchJson<{ id: string; url: string }>(`${API_BASE}/api/media`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }, UPLOAD_TIMEOUT_MS);
    return { id: json.id, url: `${API_BASE}${json.url}` };
  },

  /** Ver `apps/server/src/routes/aiVision.ts`. La foto es desechable: no pasa por `/api/media`, no se guarda. */
  async aiFridgeScan(token: string, photoUri: string): Promise<{ items: string[] }> {
    const form = new FormData();
    form.append("photo", { uri: photoUri, name: "nevera.jpg", type: "image/jpeg" } as unknown as Blob);
    return uploadForAi("/api/ai/vision/fridge", token, form);
  },

  async aiProductScan(token: string, frontUri: string, backUri?: string): Promise<{ reply: string; proposals: FoodProposal[] }> {
    const form = new FormData();
    form.append("front", { uri: frontUri, name: "delante.jpg", type: "image/jpeg" } as unknown as Blob);
    if (backUri) form.append("back", { uri: backUri, name: "detras.jpg", type: "image/jpeg" } as unknown as Blob);
    return uploadForAi("/api/ai/vision/product", token, form);
  },

  socialFeed: async (token: string, cursor?: string | null) => {
    const r = await request<{ posts: Post[]; nextCursor: string | null }>(`/api/social/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, { token });
    return { posts: r.posts.map(absPost), nextCursor: r.nextCursor };
  },

  socialPost: async (token: string, id: string) => absPost(await request<Post>(`/api/social/posts/${id}`, { token })),

  socialProfile: async (token: string, username: string) => {
    const r = await request<{ profile: SocialProfile; followState: FollowState; counts: { posts: number; followers: number; following: number }; posts: Post[] | null }>(
      `/api/social/users/${encodeURIComponent(username)}`,
      { token },
    );
    return { ...r, profile: absProfile(r.profile), posts: r.posts?.map(absPost) ?? null };
  },

  socialMyProfile: async (token: string) => {
    const r = await request<{ username: string; bio: string; avatarUrl?: string; isPrivate: boolean }>("/api/social/profile", { token });
    return { ...r, avatarUrl: abs(r.avatarUrl) };
  },

  socialUpdateProfile: (token: string, patch: { bio?: string; avatarMediaId?: string | null; isPrivate?: boolean; username?: string }) =>
    request<void>("/api/social/profile", { method: "PUT", token, body: patch }),

  socialSearch: async (token: string, q: string) => {
    const r = await request<{ users: SocialUserSummary[] }>(`/api/social/search?q=${encodeURIComponent(q)}`, { token });
    return r.users.map(absSummary);
  },

  socialFollow: (token: string, username: string) => request<{ status: "pending" | "accepted" }>(`/api/social/follows/${encodeURIComponent(username)}`, { method: "PUT", token }),
  socialUnfollow: (token: string, username: string) => request<void>(`/api/social/follows/${encodeURIComponent(username)}`, { method: "DELETE", token }),
  socialAcceptFollow: (token: string, username: string) => request<void>(`/api/social/follows/${encodeURIComponent(username)}/accept`, { method: "PUT", token }),
  socialDeclineFollow: (token: string, username: string) => request<void>(`/api/social/follows/${encodeURIComponent(username)}/decline`, { method: "DELETE", token }),
  socialPendingFollows: async (token: string) => {
    const r = await request<{ requests: SocialUserSummary[] }>("/api/social/follows/pending", { token });
    return r.requests.map(absSummary);
  },

  socialPublish: (token: string, input: { kind: "run" | "strength" | "free"; text?: string; snapshot: Record<string, unknown>; mediaIds?: string[] }) =>
    request<{ id: string }>("/api/social/posts", { method: "POST", token, body: input }),
  socialDeletePost: (token: string, id: string) => request<void>(`/api/social/posts/${id}`, { method: "DELETE", token }),
  socialLike: (token: string, id: string) => request<void>(`/api/social/posts/${id}/like`, { method: "PUT", token }),
  socialUnlike: (token: string, id: string) => request<void>(`/api/social/posts/${id}/like`, { method: "DELETE", token }),

  socialComments: async (token: string, postId: string) => {
    const r = await request<{ comments: SocialComment[] }>(`/api/social/posts/${postId}/comments`, { token });
    return r.comments.map(absComment);
  },
  socialAddComment: (token: string, postId: string, text: string) => request<{ id: string }>(`/api/social/posts/${postId}/comments`, { method: "POST", token, body: { text } }),
  socialDeleteComment: (token: string, id: string) => request<void>(`/api/social/comments/${id}`, { method: "DELETE", token }),
};
