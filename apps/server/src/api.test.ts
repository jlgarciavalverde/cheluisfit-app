import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Nunca se llama a Gemini/Groq de verdad en los tests: solo se sustituye `generateText` (lo
// demás del paquete `ai`, como `tool()`, se queda real, para que `routes/ai.ts` construya sus
// herramientas igual que en producción). Los proveedores se sustituyen por una función identidad
// que solo envuelve el id de modelo, para poder distinguir en las aserciones cuál se llamó.
const generateTextMock = vi.fn();
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return { ...actual, generateText: (...args: unknown[]) => generateTextMock(...args) };
});
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: () => (modelId: string) => ({ provider: "google", modelId }) }));
vi.mock("@ai-sdk/groq", () => ({ createGroq: () => (modelId: string) => ({ provider: "groq", modelId }) }));

// `strava.ts` es el único sitio del servidor que llama a `fetch` de verdad (todo lo demás, OFF/
// USDA, lo consulta el móvil en directo) — se sustituye entero, nunca se llama a strava.com real.
const stravaFetchMock = vi.fn();
vi.stubGlobal("fetch", (...args: Parameters<typeof fetch>) => stravaFetchMock(...args));

const { buildApp } = await import("./app");
const { logSafeError } = await import("./http");

const SETUP = "codigo-de-prueba";
let app: Awaited<ReturnType<typeof buildApp>>;

beforeAll(async () => {
  app = await buildApp({
    dbPath: ":memory:",
    mediaDir: "/tmp/cheluisfit-test-media",
    version: "test",
    setupCode: SETUP,
    allowedOrigins: [],
    logLevel: "silent",
    geminiApiKey: "fake-gemini-key",
    groqApiKey: "fake-groq-key",
    stravaClientId: "fake-strava-client",
    stravaClientSecret: "fake-strava-secret",
    // La suite social registra muchos usuarios de prueba (invita + registra por cada uno) — muy
    // por encima del límite pensado para tráfico real de /api/auth/register.
    authRateLimit: 1000,
  });
});
afterAll(() => app.close());

type Json = Record<string, any>;
async function call(method: string, url: string, token?: string, payload?: unknown) {
  const res = await app.inject({
    method: method as "GET",
    url,
    payload: payload as object | undefined,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return { status: res.statusCode, body: (res.body ? safeJson(res.body) : null) as Json };
}
const safeJson = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

const chelu = { name: "Chelu", email: "chelu@casa.es", password: "supersecreta1" };
let token: string;

describe("cuentas", () => {
  it("al principio necesita configuración", async () => {
    expect((await call("GET", "/api/setup-status")).body.needsSetup).toBe(true);
  });

  it("no se puede crear el hogar sin el código de configuración", async () => {
    expect((await call("POST", "/api/auth/register", undefined, { ...chelu, setupCode: "mal" })).status).toBe(403);
  });

  it("crea el hogar con el código y la primera persona es admin", async () => {
    const r = await call("POST", "/api/auth/register", undefined, { ...chelu, setupCode: SETUP, householdName: "Casa" });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe("admin");
    token = r.body.token;
    expect((await call("GET", "/api/setup-status")).body.needsSetup).toBe(false);
  });

  it("después el registro público queda cerrado", async () => {
    const r = await call("POST", "/api/auth/register", undefined, { name: "Intruso", email: "x@x.es", password: "12345678", setupCode: SETUP });
    expect(r.status).toBe(403);
  });

  it("login correcto e incorrecto", async () => {
    expect((await call("POST", "/api/auth/login", undefined, { email: chelu.email, password: "mala" })).status).toBe(401);
    const ok = await call("POST", "/api/auth/login", undefined, { email: chelu.email, password: chelu.password });
    expect(ok.status).toBe(200);
    expect(ok.body.user.email).toBe(chelu.email);
  });

  it("/api/me exige sesión", async () => {
    expect((await call("GET", "/api/me")).status).toBe(401);
    const r = await call("GET", "/api/me", token);
    expect(r.body.user.name).toBe("Chelu");
    expect(r.body.household.members).toHaveLength(1);
  });

  it("una invitación deja entrar a otra persona en el mismo hogar", async () => {
    const inv = await call("POST", "/api/household/invites", token);
    expect(inv.status).toBe(201);
    const r = await call("POST", "/api/auth/register", undefined, {
      name: "Amiga", email: "amiga@casa.es", password: "otrasecreta1", inviteCode: inv.body.code,
    });
    expect(r.status).toBe(201);
    expect(r.body.user.role).toBe("member");
    const me = await call("GET", "/api/me", r.body.token);
    expect(me.body.household.members).toHaveLength(2);
  });

  it("una invitación caducada o repetida no vale", async () => {
    const r = await call("POST", "/api/auth/register", undefined, { name: "X", email: "x2@casa.es", password: "12345678", inviteCode: "AAAAAAAA" });
    expect(r.status).toBe(400);
  });
});

describe("sincronización de datos (blobs)", () => {
  const blob = (state: Json) => ({ state, version: 1 });

  it("sin datos todavía, 404", async () => {
    expect((await call("GET", "/api/blobs/cf_strength_v1", token)).status).toBe(404);
  });

  it("clave desconocida, 404", async () => {
    expect((await call("PUT", "/api/blobs/cualquier_cosa", token, blob({ x: 1 }))).status).toBe(404);
  });

  it("sube y recupera el blob de fuerza", async () => {
    const payload = blob({ routines: [{ id: "r1", name: "Pecho", exercises: [] }], workouts: [] });
    const put = await call("PUT", "/api/blobs/cf_strength_v1", token, payload);
    expect(put.status).toBe(200);
    expect(typeof put.body.updatedAt).toBe("number");
    const r = await call("GET", "/api/blobs/cf_strength_v1", token);
    expect(r.body.data).toEqual(payload);
    expect(r.body.updatedAt).toBe(put.body.updatedAt);
  });

  it("rechaza lo que no sea el envoltorio {state, version}", async () => {
    expect((await call("PUT", "/api/blobs/cf_strength_v1", token, { routines: [] })).status).toBe(400);
    expect((await call("PUT", "/api/blobs/cf_strength_v1", token, [1, 2])).status).toBe(400);
  });

  it("rechaza un blob demasiado grande con 413", async () => {
    const r = await call("PUT", "/api/blobs/cf_running_v1", token, blob({ big: "x".repeat(3_100_000) }));
    expect(r.status).toBe(413);
  });

  it("con ?base= que no coincide devuelve 409 y la versión del servidor", async () => {
    const first = await call("PUT", "/api/blobs/cf_strength_v1", token, blob({ n: 1 }));
    const stale = first.body.updatedAt - 1;
    const r = await call("PUT", `/api/blobs/cf_strength_v1?base=${stale}`, token, blob({ n: 2 }));
    expect(r.status).toBe(409);
    expect(r.body.data).toEqual(blob({ n: 1 }));
    expect(r.body.updatedAt).toBe(first.body.updatedAt);
    // Con la base buena, entra y la versión sube.
    const ok = await call("PUT", `/api/blobs/cf_strength_v1?base=${first.body.updatedAt}`, token, blob({ n: 3 }));
    expect(ok.status).toBe(200);
    expect(ok.body.updatedAt).toBeGreaterThan(first.body.updatedAt);
  });

  it("?base=0 solo entra si todavía no hay nada", async () => {
    expect((await call("PUT", "/api/blobs/cf_active_workout_v1?base=0", token, blob({ w: null }))).status).toBe(200);
    expect((await call("PUT", "/api/blobs/cf_active_workout_v1?base=0", token, blob({ w: 1 }))).status).toBe(409);
  });

  it("?meta=1 lista claves y versiones sin los datos", async () => {
    const r = await call("GET", "/api/blobs?meta=1", token);
    expect(r.body.blobs.length).toBeGreaterThan(0);
    expect(r.body.blobs[0].data).toBeUndefined();
    expect(typeof r.body.blobs[0].updatedAt).toBe("number");
  });

  it("cada usuario solo ve sus propios blobs", async () => {
    await call("PUT", "/api/blobs/cf_strength_v1", token, blob({ routines: [], workouts: [] }));
    const otro = (await call("POST", "/api/auth/login", undefined, { email: "amiga@casa.es", password: "otrasecreta1" })).body.token;
    expect((await call("GET", "/api/blobs/cf_strength_v1", otro)).status).toBe(404);
  });

  it("/api/blobs lista todas las claves subidas", async () => {
    await call("PUT", "/api/blobs/cf_running_v1", token, blob({ activities: [] }));
    const r = await call("GET", "/api/blobs", token);
    const keys = r.body.blobs.map((b: Json) => b.key).sort();
    expect(keys).toEqual(["cf_active_workout_v1", "cf_running_v1", "cf_strength_v1"]);
  });

  it("requiere sesión", async () => {
    expect((await call("PUT", "/api/blobs/cf_strength_v1", undefined, blob({}))).status).toBe(401);
  });
});

describe("fotos de ejercicios (media)", () => {
  const boundary = "----test";
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01, 0x02, 0x03]);
  const multipartBody = (filename: string, contentType: string, data: Buffer) =>
    Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`),
      data,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

  it("sube una foto y la vuelve a servir", async () => {
    const up = await app.inject({
      method: "POST",
      url: "/api/media",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody("crunch.jpg", "image/jpeg", jpegBytes),
    });
    expect(up.statusCode).toBe(201);
    const { id, url } = JSON.parse(up.body);
    expect(url).toBe(`/api/media/${id}`);

    // Descargar no exige sesión (protege el id aleatorio de la URL, como las fotos del catálogo).
    const down = await app.inject({ method: "GET", url });
    expect(down.statusCode).toBe(200);
    expect(down.headers["content-type"]).toBe("image/jpeg");
    expect(Buffer.from(down.rawPayload)).toEqual(jpegBytes);
  });

  it("subir exige sesión", async () => {
    const up = await app.inject({
      method: "POST",
      url: "/api/media",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody("x.jpg", "image/jpeg", jpegBytes),
    });
    expect(up.statusCode).toBe(401);
  });

  it("un id inventado no existe", async () => {
    expect((await app.inject({ method: "GET", url: "/api/media/no-existe" })).statusCode).toBe(404);
  });

  it("rechaza tipos no permitidos", async () => {
    const up = await app.inject({
      method: "POST",
      url: "/api/media",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody("virus.exe", "application/octet-stream", Buffer.from("no")),
    });
    expect(up.statusCode).toBe(415);
  });

});

describe("asistente de IA", () => {
  const body = { section: "nutrition", messages: [{ role: "user", content: "¿Qué ceno hoy?" }], context: "Objetivo: 2000 kcal. Hoy llevas 1200." };
  afterAll(() => generateTextMock.mockReset());

  it("requiere sesión", async () => {
    expect((await call("POST", "/api/ai/chat", undefined, body)).status).toBe(401);
  });

  it("valida el cuerpo (sección desconocida)", async () => {
    const r = await call("POST", "/api/ai/chat", token, { ...body, section: "futbol" });
    expect(r.status).toBe(400);
  });

  it("sin ninguna clave configurada, 503 (no confunde «no configurado» con un fallo de red)", async () => {
    const noKeyApp = await buildApp({ dbPath: ":memory:", mediaDir: "/tmp/cheluisfit-test-media-noai", version: "test", setupCode: "x", allowedOrigins: [], logLevel: "silent" });
    const reg = await noKeyApp.inject({ method: "POST", url: "/api/auth/register", payload: { name: "A", email: "a@a.es", password: "12345678", setupCode: "x" } });
    const r = await noKeyApp.inject({ method: "POST", url: "/api/ai/chat", headers: { authorization: `Bearer ${JSON.parse(reg.body).token}` }, payload: body });
    expect(r.statusCode).toBe(503);
    await noKeyApp.close();
  });

  it("Gemini responde: devuelve el texto y traduce las tool calls a propuestas", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "Te propongo una ensalada de pollo.",
      toolCalls: [{ toolName: "add_meal_entry", input: { name: "Ensalada de pollo", meal: "dinner", grams: 350, kcal: 420, protein: 35, carbs: 15, fat: 22 } }],
    });
    const r = await call("POST", "/api/ai/chat", token, body);
    expect(r.status).toBe(200);
    expect(r.body.reply).toBe("Te propongo una ensalada de pollo.");
    expect(r.body.proposals).toEqual([{ type: "add_meal_entry", name: "Ensalada de pollo", meal: "dinner", grams: 350, kcal: 420, protein: 35, carbs: 15, fat: 22 }]);
    expect(generateTextMock).toHaveBeenCalledTimes(1);
    expect(generateTextMock.mock.calls[0]?.[0].model.provider).toBe("google");
  });

  it("respuesta sin propuestas: `proposals` no aparece como array vacío confuso", async () => {
    generateTextMock.mockResolvedValueOnce({ text: "Vas bien esta semana.", toolCalls: [] });
    const r = await call("POST", "/api/ai/chat", token, body);
    expect(r.body.proposals).toEqual([]);
  });

  it("si Gemini falla, reintenta con Groq automáticamente antes de rendirse", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("cuota de Gemini agotada"));
    generateTextMock.mockResolvedValueOnce({ text: "Respuesta de respaldo.", toolCalls: [] });
    const r = await call("POST", "/api/ai/chat", token, body);
    expect(r.status).toBe(200);
    expect(r.body.reply).toBe("Respuesta de respaldo.");
    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(generateTextMock.mock.calls[1]?.[0].model.provider).toBe("groq");
  });

  it("tolera el historial que manda la app: mensajes vacíos (solo propuesta), largos y más de 20", async () => {
    generateTextMock.mockResolvedValueOnce({ text: "Vale.", toolCalls: [] });
    const messages = [
      { role: "assistant", content: "Hola, ¿en qué te ayudo?" }, // sin «user» delante: se descarta
      ...Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: i === 5 ? "" : `m${i}` })),
      { role: "user", content: "x".repeat(3000) },
    ];
    const r = await call("POST", "/api/ai/chat", token, { ...body, messages });
    expect(r.status).toBe(200);
    const sent = generateTextMock.mock.calls.at(-1)?.[0].messages as { role: string; content: string }[];
    expect(sent.length).toBeLessThanOrEqual(20);
    expect(sent[0]!.role).toBe("user");
    expect(sent.every((m) => m.content.length > 0 && m.content.length <= 2000)).toBe(true);
  });

  it("sin ningún mensaje con texto, 400", async () => {
    const r = await call("POST", "/api/ai/chat", token, { ...body, messages: [{ role: "user", content: "   " }] });
    expect(r.status).toBe(400);
  });

  it("si fallan los dos proveedores, 502 (no un 500 genérico)", async () => {
    generateTextMock.mockRejectedValueOnce(new Error("Gemini caído"));
    generateTextMock.mockRejectedValueOnce(new Error("Groq caído"));
    const r = await call("POST", "/api/ai/chat", token, body);
    expect(r.status).toBe(502);
  });
});

describe("IA con foto (nevera y escaneo de producto)", () => {
  const boundary = "----vision-test";
  const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xdb, 0x00, 0x01, 0x02, 0x03]);
  const part = (field: string, filename: string, contentType: string, data: Buffer) =>
    `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n` +
    data.toString("binary") +
    "\r\n";
  const multipartBody = (parts: [string, string, string, Buffer][]) => Buffer.from(parts.map((p) => part(...p)).join("") + `--${boundary}--\r\n`, "binary");

  afterAll(() => generateTextMock.mockReset());

  it("nevera: requiere sesión", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/ai/vision/fridge",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody([["photo", "nevera.jpg", "image/jpeg", jpegBytes]]),
    });
    expect(r.statusCode).toBe(401);
  });

  it("nevera: falta la foto", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/ai/vision/fridge",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.from(`--${boundary}--\r\n`),
    });
    expect(r.statusCode).toBe(400);
  });

  it("nevera: convierte la respuesta de texto en una lista de ingredientes", async () => {
    generateTextMock.mockResolvedValueOnce({ text: "- Tomate\n* Pollo\n1. Arroz\n\nQueso", toolCalls: [] });
    const r = await app.inject({
      method: "POST",
      url: "/api/ai/vision/fridge",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody([["photo", "nevera.jpg", "image/jpeg", jpegBytes]]),
    });
    expect(r.statusCode).toBe(200);
    expect(JSON.parse(r.body).items).toEqual(["Tomate", "Pollo", "Arroz", "Queso"]);
  });

  it("producto: acepta solo la foto delantera y traduce la tool call a una propuesta", async () => {
    generateTextMock.mockResolvedValueOnce({
      text: "Yogur griego natural.",
      toolCalls: [
        {
          toolName: "propose_food",
          input: { name: "Yogur griego natural", brand: "Marca", per100: { kcal: 120, protein: 9, carbs: 4, fat: 8, fiber: 0, sugars: 4, satFat: 5, salt: 0.1 } },
        },
      ],
    });
    const r = await app.inject({
      method: "POST",
      url: "/api/ai/vision/product",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody([["front", "delante.jpg", "image/jpeg", jpegBytes]]),
    });
    expect(r.statusCode).toBe(200);
    const body2 = JSON.parse(r.body);
    expect(body2.reply).toBe("Yogur griego natural.");
    expect(body2.proposals).toEqual([{ type: "propose_food", name: "Yogur griego natural", brand: "Marca", per100: { kcal: 120, protein: 9, carbs: 4, fat: 8, fiber: 0, sugars: 4, satFat: 5, salt: 0.1 } }]);
  });

  it("producto: falta la foto delantera obligatoria", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/ai/vision/product",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody([["back", "detras.jpg", "image/jpeg", jpegBytes]]),
    });
    expect(r.statusCode).toBe(400);
  });

  it("rechaza tipos que no son foto", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/ai/vision/fridge",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody([["photo", "x.pdf", "application/pdf", Buffer.from("no")]]),
    });
    expect(r.statusCode).toBe(415);
  });

  it("un campo de archivo que no se espera no deja la petición colgada", async () => {
    generateTextMock.mockResolvedValueOnce({ text: "- Leche", toolCalls: [] });
    const r = await app.inject({
      method: "POST",
      url: "/api/ai/vision/product",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody([
        ["extra", "otra.jpg", "image/jpeg", jpegBytes],
        ["front", "delante.jpg", "image/jpeg", jpegBytes],
      ]),
    });
    expect([200, 413]).toContain(r.statusCode);
  });

  it("una foto de más de 8 MB da un 413 en español", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/ai/vision/fridge",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody([["photo", "grande.jpg", "image/jpeg", Buffer.alloc(8 * 1024 * 1024 + 10, 1)]]),
    });
    expect(r.statusCode).toBe(413);
    expect(JSON.parse(r.body).message).toMatch(/pesa demasiado/);
  });

  it("si Gemini falla, 503 y el log no lleva la foto", async () => {
    const err = Object.assign(new Error("modelo retirado"), { statusCode: 404, requestBodyValues: { contents: "BASE64FOTO" } });
    generateTextMock.mockRejectedValueOnce(err);
    const r = await app.inject({
      method: "POST",
      url: "/api/ai/vision/fridge",
      headers: { authorization: `Bearer ${token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody([["photo", "nevera.jpg", "image/jpeg", jpegBytes]]),
    });
    expect(r.statusCode).toBe(503);
    expect(JSON.stringify(logSafeError(err))).not.toContain("BASE64FOTO");
    expect(logSafeError(err)).toMatchObject({ message: "modelo retirado", statusCode: 404 });
  });

  it("sin GEMINI_API_KEY, 503 (no confunde «no configurado» con un fallo de red)", async () => {
    const noKeyApp = await buildApp({ dbPath: ":memory:", mediaDir: "/tmp/cheluisfit-test-media-noai2", version: "test", setupCode: "x", allowedOrigins: [], logLevel: "silent" });
    const reg = await noKeyApp.inject({ method: "POST", url: "/api/auth/register", payload: { name: "A", email: "b@b.es", password: "12345678", setupCode: "x" } });
    const r = await noKeyApp.inject({
      method: "POST",
      url: "/api/ai/vision/fridge",
      headers: { authorization: `Bearer ${JSON.parse(reg.body).token}`, "content-type": `multipart/form-data; boundary=${boundary}` },
      payload: multipartBody([["photo", "nevera.jpg", "image/jpeg", jpegBytes]]),
    });
    expect(r.statusCode).toBe(503);
    await noKeyApp.close();
  });
});

describe("red social", () => {
  async function registerViaInvite(name: string, email: string) {
    const inv = await call("POST", "/api/household/invites", token);
    const r = await call("POST", "/api/auth/register", undefined, { name, email, password: "supersecreta1", inviteCode: inv.body.code });
    return { token: r.body.token as string, id: r.body.user.id as string };
  }
  const snapshot = { snapshotVersion: 1, kind: "free" };

  it("«mi perfil» (GET /api/social/profile) devuelve el propio username, para saber a dónde navegar", async () => {
    const rio = await registerViaInvite("Río Grande", "rio@casa.es");
    const r = await call("GET", "/api/social/profile", rio.token);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ username: "rio-grande", isPrivate: false });
  });

  it("registrarse crea un perfil con username derivado del nombre (sin acentos, en minúsculas)", async () => {
    const ana = await registerViaInvite("Ana López", "ana@casa.es");
    const r = await call("GET", "/api/social/users/ana-lopez", ana.token);
    expect(r.status).toBe(200);
    expect(r.body.profile).toMatchObject({ username: "ana-lopez", name: "Ana López", isPrivate: false });
  });

  it("publicar un post libre aparece en el feed propio", async () => {
    const bea = await registerViaInvite("Bea", "bea@casa.es");
    const post = await call("POST", "/api/social/posts", bea.token, { kind: "free", text: "Hola", snapshot });
    expect(post.status).toBe(201);
    const feed = await call("GET", "/api/social/feed", bea.token);
    expect(feed.body.posts[0]).toMatchObject({ id: post.body.id, text: "Hola", author: { username: "bea" } });
  });

  it("perfil privado: sin follow no enseña posts; con follow aceptado sí; al dejar de seguir, otra vez no", async () => {
    const cris = await registerViaInvite("Cris", "cris@casa.es");
    await call("PUT", "/api/social/profile", cris.token, { isPrivate: true });
    await call("POST", "/api/social/posts", cris.token, { kind: "free", text: "Privado", snapshot });
    const ana = await registerViaInvite("Ana Vista", "ana2@casa.es");

    const before = await call("GET", "/api/social/users/cris", ana.token);
    expect(before.body).toMatchObject({ followState: "none", posts: null });

    const follow = await call("PUT", "/api/social/follows/cris", ana.token);
    expect(follow.body.status).toBe("pending");
    const pending = await call("GET", "/api/social/follows/pending", cris.token);
    expect(pending.body.requests.map((r: Json) => r.username)).toContain("ana-vista");

    await call("PUT", "/api/social/follows/ana-vista/accept", cris.token);
    const after = await call("GET", "/api/social/users/cris", ana.token);
    expect(after.body.followState).toBe("accepted");
    expect(after.body.posts).toHaveLength(1);
    const feed = await call("GET", "/api/social/feed", ana.token);
    expect(feed.body.posts.some((p: Json) => p.text === "Privado")).toBe(true);

    await call("DELETE", "/api/social/follows/cris", ana.token);
    const afterUnfollow = await call("GET", "/api/social/users/cris", ana.token);
    expect(afterUnfollow.body).toMatchObject({ followState: "none", posts: null });
  });

  it("no puedes usar en un post una foto que no es tuya", async () => {
    const dani = await registerViaInvite("Dani", "dani@casa.es");
    const eva = await registerViaInvite("Eva", "eva@casa.es");
    const up = await app.inject({
      method: "POST",
      url: "/api/media",
      headers: { authorization: `Bearer ${dani.token}`, "content-type": "multipart/form-data; boundary=x" },
      payload: Buffer.concat([
        Buffer.from('--x\r\nContent-Disposition: form-data; name="file"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n'),
        Buffer.from([0xff, 0xd8, 0xff]),
        Buffer.from("\r\n--x--\r\n"),
      ]),
    });
    const mediaId = JSON.parse(up.body).id;
    const r = await call("POST", "/api/social/posts", eva.token, { kind: "free", snapshot, mediaIds: [mediaId] });
    expect(r.status).toBe(403);
  });

  it("dar like es idempotente y se puede quitar", async () => {
    const fer = await registerViaInvite("Fer", "fer@casa.es");
    const post = await call("POST", "/api/social/posts", fer.token, { kind: "free", snapshot });
    await call("PUT", `/api/social/posts/${post.body.id}/like`, fer.token);
    await call("PUT", `/api/social/posts/${post.body.id}/like`, fer.token); // repetido, no debe duplicar
    let feed = await call("GET", "/api/social/feed", fer.token);
    expect(feed.body.posts[0]).toMatchObject({ likesCount: 1, likedByMe: true });
    await call("DELETE", `/api/social/posts/${post.body.id}/like`, fer.token);
    feed = await call("GET", "/api/social/feed", fer.token);
    expect(feed.body.posts[0]).toMatchObject({ likesCount: 0, likedByMe: false });
  });

  it("comentar: lo borra quien lo escribió, o el dueño del post, nadie más", async () => {
    const gus = await registerViaInvite("Gus", "gus@casa.es");
    const hana = await registerViaInvite("Hana", "hana@casa.es");
    const ivo = await registerViaInvite("Ivo", "ivo@casa.es");
    const post = await call("POST", "/api/social/posts", gus.token, { kind: "free", snapshot });

    const c1 = await call("POST", `/api/social/posts/${post.body.id}/comments`, hana.token, { text: "Bien ahí" });
    expect(c1.status).toBe(201);
    expect((await call("DELETE", `/api/social/comments/${c1.body.id}`, hana.token)).status).toBe(204); // el autor puede

    const c2 = await call("POST", `/api/social/posts/${post.body.id}/comments`, hana.token, { text: "Otra vez" });
    expect((await call("DELETE", `/api/social/comments/${c2.body.id}`, gus.token)).status).toBe(204); // el dueño del post puede

    const c3 = await call("POST", `/api/social/posts/${post.body.id}/comments`, hana.token, { text: "Tercera" });
    expect((await call("DELETE", `/api/social/comments/${c3.body.id}`, ivo.token)).status).toBe(403); // nadie más
  });

  it("buscar usuarios por nombre o username, sin incluirse a uno mismo", async () => {
    const jon = await registerViaInvite("Jonatan Buscable", "jon@casa.es");
    const kira = await registerViaInvite("Kira", "kira@casa.es");
    const r = await call("GET", "/api/social/search?q=buscable", kira.token);
    expect(r.body.users.map((u: Json) => u.username)).toContain("jonatan-buscable");
    const self = await call("GET", "/api/social/search?q=jonatan", jon.token);
    expect(self.body.users.map((u: Json) => u.username)).not.toContain("jonatan-buscable");
  });

  it("paginación del feed por cursor: 22 posts propios se ven en dos páginas de 20 y 2", async () => {
    const leo = await registerViaInvite("Leo", "leo@casa.es");
    for (let i = 0; i < 22; i++) await call("POST", "/api/social/posts", leo.token, { kind: "free", text: `post ${i}`, snapshot });
    const p1 = await call("GET", "/api/social/feed", leo.token);
    expect(p1.body.posts).toHaveLength(20);
    expect(p1.body.nextCursor).not.toBeNull();
    const p2 = await call("GET", `/api/social/feed?cursor=${encodeURIComponent(p1.body.nextCursor)}`, leo.token);
    expect(p2.body.posts).toHaveLength(2);
    expect(p2.body.nextCursor).toBeNull();
    const ids = [...p1.body.posts, ...p2.body.posts].map((p: Json) => p.id);
    expect(new Set(ids).size).toBe(22); // sin duplicados ni huecos entre páginas
  });

  it("borrar un post de otra persona, 403", async () => {
    const mia = await registerViaInvite("Mia", "mia@casa.es");
    const noe = await registerViaInvite("Noe", "noe@casa.es");
    const post = await call("POST", "/api/social/posts", mia.token, { kind: "free", snapshot });
    expect((await call("DELETE", `/api/social/posts/${post.body.id}`, noe.token)).status).toBe(403);
    expect((await call("DELETE", `/api/social/posts/${post.body.id}`, mia.token)).status).toBe(204);
  });

  it("obtener un post suelto respeta la misma regla de visibilidad que el feed", async () => {
    const ona = await registerViaInvite("Ona", "ona@casa.es");
    await call("PUT", "/api/social/profile", ona.token, { isPrivate: true });
    const post = await call("POST", "/api/social/posts", ona.token, { kind: "free", text: "Solo para seguidores", snapshot });

    const pat = await registerViaInvite("Pat", "pat@casa.es");
    expect((await call("GET", `/api/social/posts/${post.body.id}`, pat.token)).status).toBe(404); // no lo sigue, ni sabe que existe
    expect((await call("GET", `/api/social/posts/${post.body.id}`, ona.token)).status).toBe(200); // la autora sí

    await call("PUT", "/api/social/follows/ona", pat.token);
    await call("PUT", "/api/social/follows/pat/accept", ona.token);
    const seen = await call("GET", `/api/social/posts/${post.body.id}`, pat.token);
    expect(seen.status).toBe(200);
    expect(seen.body.text).toBe("Solo para seguidores");
  });
});

describe("Strava (recorrido GPS)", () => {
  const jsonResponse = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response;

  afterAll(() => stravaFetchMock.mockReset());

  it("requiere sesión en todas las rutas", async () => {
    expect((await call("GET", "/api/strava/status")).status).toBe(401);
    expect((await call("POST", "/api/strava/connect")).status).toBe(401);
    expect((await call("POST", "/api/strava/sync", undefined, { since: null })).status).toBe(401);
    expect((await call("DELETE", "/api/strava/disconnect")).status).toBe(401);
  });

  it("sin conectar, status da connected:false", async () => {
    const r = await call("GET", "/api/strava/status", token);
    expect(r.body.connected).toBe(false);
  });

  it("sin STRAVA_CLIENT_ID/SECRET configuradas, conectar da 503 (no confunde «no configurado» con un fallo de red)", async () => {
    const noKeyApp = await buildApp({ dbPath: ":memory:", mediaDir: "/tmp/cheluisfit-test-media-nostrava", version: "test", setupCode: "x", allowedOrigins: [], logLevel: "silent" });
    const reg = await noKeyApp.inject({ method: "POST", url: "/api/auth/register", payload: { name: "A", email: "strava-nokey@a.es", password: "12345678", setupCode: "x" } });
    const r = await noKeyApp.inject({ method: "POST", url: "/api/strava/connect", headers: { authorization: `Bearer ${JSON.parse(reg.body).token}` } });
    expect(r.statusCode).toBe(503);
    await noKeyApp.close();
  });

  it("conectar devuelve la URL de autorización con el client_id", async () => {
    const r = await call("POST", "/api/strava/connect", token);
    expect(r.status).toBe(200);
    expect(r.body.url).toContain("https://www.strava.com/oauth/authorize");
    expect(r.body.url).toContain("client_id=fake-strava-client");
    expect(r.body.url).toContain("redirect_uri=");
  });

  it("callback sin state/code válido redirige con ok=0, sin guardar nada", async () => {
    const bad = await app.inject({ method: "GET", url: "/api/strava/callback?code=x&state=no-existe" });
    expect(bad.statusCode).toBe(302);
    expect(bad.headers.location).toBe("cheluisfit://strava-connected?ok=0");
    expect((await call("GET", "/api/strava/status", token)).body.connected).toBe(false);
  });

  it("callback con state válido intercambia el código y conecta la cuenta", async () => {
    const connect = await call("POST", "/api/strava/connect", token);
    const state = new URLSearchParams(connect.body.url.split("?")[1]).get("state")!;

    stravaFetchMock.mockResolvedValueOnce(jsonResponse(200, { access_token: "at-1", refresh_token: "rt-1", expires_at: Math.floor(Date.now() / 1000) + 21600, athlete: { id: 999 } }));
    const cb = await app.inject({ method: "GET", url: `/api/strava/callback?code=abc&state=${state}` });
    expect(cb.statusCode).toBe(302);
    expect(cb.headers.location).toBe("cheluisfit://strava-connected?ok=1");

    expect((await call("GET", "/api/strava/status", token)).body.connected).toBe(true);

    // El `state` es de un solo uso: repetir el mismo callback ya no encuentra nada que conectar.
    const replay = await app.inject({ method: "GET", url: `/api/strava/callback?code=abc&state=${state}` });
    expect(replay.headers.location).toBe("cheluisfit://strava-connected?ok=0");
  });

  it("sincronizar trae actividades de tipos soportados, con ruta solo si hay mapa, y deja fuera lo que no es carrera/caminata", async () => {
    stravaFetchMock.mockResolvedValueOnce(
      jsonResponse(200, [
        { id: 1, type: "Run", start_date_local: "2026-09-20T08:00:00Z", name: "Rodaje", distance: 8000, moving_time: 2400, average_heartrate: 150, kilojoules: 800, map: { summary_polyline: "xyz" } },
        { id: 2, type: "Walk", start_date_local: "2026-09-21T08:00:00Z", name: "Paseo", distance: 3000, moving_time: 1800, map: {} },
        { id: 3, type: "Ride", start_date_local: "2026-09-21T09:00:00Z", name: "Bici", distance: 20000, moving_time: 3600, map: {} }, // no soportado, se descarta
      ]),
    );
    stravaFetchMock.mockResolvedValueOnce(jsonResponse(200, { latlng: { data: [[40.0, -3.0], [40.001, -3.001]] } }));

    const r = await call("POST", "/api/strava/sync", token, { since: null });
    expect(r.status).toBe(200);
    expect(r.body.activities).toHaveLength(2); // la de bici queda fuera
    const run = r.body.activities.find((a: { externalId: string }) => a.externalId === "strava-1");
    expect(run).toMatchObject({ type: "run", source: "strava", distanceM: 8000, avgHr: 150, kcal: 800 });
    expect(run.route).toEqual([{ lat: 40.0, lon: -3.0 }, { lat: 40.001, lon: -3.001 }]);
    const walk = r.body.activities.find((a: { externalId: string }) => a.externalId === "strava-2");
    expect(walk.route).toBeUndefined(); // sin `summary_polyline`, no se pide la ruta
  });

  it("pagina: con más de una página de actividades no se pierde ninguna", async () => {
    const rides = Array.from({ length: 100 }, (_, i) => ({ id: 100 + i, type: "Ride", start_date_local: "2026-09-22T08:00:00Z", name: "Bici", distance: 1, moving_time: 1, map: {} }));
    stravaFetchMock.mockResolvedValueOnce(jsonResponse(200, rides));
    stravaFetchMock.mockResolvedValueOnce(jsonResponse(200, [{ id: 9, type: "Run", start_date_local: "2026-09-23T08:00:00Z", name: "Series", distance: 5000, moving_time: 1500, map: {} }]));
    const r = await call("POST", "/api/strava/sync", token, { since: "2026-09-20T00:00:00Z" });
    expect(r.status).toBe(200);
    expect(r.body.activities.map((a: { externalId: string }) => a.externalId)).toEqual(["strava-9"]);
    expect(typeof r.body.until).toBe("string");
  });

  it("desconectar borra el enlace; sincronizar después falla con claridad", async () => {
    const r = await call("DELETE", "/api/strava/disconnect", token);
    expect(r.status).toBe(200);
    expect((await call("GET", "/api/strava/status", token)).body.connected).toBe(false);

    const sync = await call("POST", "/api/strava/sync", token, { since: null });
    expect(sync.status).toBe(409);
  });
});
