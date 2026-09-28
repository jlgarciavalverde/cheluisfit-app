import { createReadStream, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import { openDb, type DB } from "./db";
import { HttpError } from "./http";
import { registerAccount } from "./routes/account";
import { registerAi } from "./routes/ai";
import { registerAiVision } from "./routes/aiVision";
import type { AppConfig, Ctx } from "./routes/ctx";
import { registerData } from "./routes/data";
import { registerMedia } from "./routes/media";
import { registerSocial } from "./routes/social";
import { registerStrava } from "./routes/strava";

export type { AppConfig } from "./routes/ctx";

export type App = FastifyInstance & { db: DB };

export async function buildApp(cfg: AppConfig): Promise<App> {
  mkdirSync(cfg.mediaDir, { recursive: true });
  const db = openDb(cfg.dbPath);
  const ctx: Ctx = { db, cfg };

  const app = Fastify({
    logger: cfg.logLevel === "silent" ? false : { level: cfg.logLevel ?? "info", redact: ["req.headers.authorization"] },
    trustProxy: true,
    bodyLimit: 5_000_000, // el blob más grande es el historial de entrenos/comidas en JSON; 5 MB de sobra.
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:"],
        fontSrc: ["'self'", "data:"],
        // La versión web llama en directo a Open Food Facts y USDA FoodData Central desde el
        // cliente (`offClient.ts`/`usdaClient.ts`, sin pasar por este servidor) — sin esto, un
        // navegador que respete la CSP bloquearía el escáner y el buscador solo en la web, no
        // en la app nativa (sin CSP) ni en los e2e (servidos sin Helmet).
        connectSrc: ["'self'", "https://world.openfoodfacts.org", "https://api.nal.usda.gov"],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: null,
      },
    },
  });
  await app.register(cors, {
    origin: cfg.allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type"],
    maxAge: 86400,
  });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ZodError) return reply.code(400).send({ error: "validation", message: err.issues[0]?.message ?? "Datos no válidos" });
    if (err instanceof HttpError) return reply.code(err.status).send({ error: "http", message: err.message });
    const e = err as { statusCode?: number; message?: string };
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: "request", message: e.message });
    req.log.error(err);
    return reply.code(500).send({ error: "internal", message: "Algo ha fallado en el servidor" });
  });

  app.get("/health", async () => ({ status: "ok", version: cfg.version, uptime: Math.round(process.uptime()) }));

  registerAccount(app, ctx);
  registerData(app, ctx);
  registerMedia(app, ctx);
  registerAi(app, ctx);
  registerAiVision(app, ctx);
  registerSocial(app, ctx);
  registerStrava(app, ctx);

  // Descarga del APK de Android. Los deja `tools/build-apk.mjs` en `dist/`; el despliegue los
  // copia a `downloadsDir` (no van dentro de la imagen: cambian sin recompilar el servidor).
  //
  // Cloudflare cachea `.apk` en su borde ~4h por su propia política de extensiones "estáticas",
  // **ignorando el `Cache-Control` del origen** (comprobado: el origen manda `no-cache`, pero lo
  // que recibe el cliente trae `max-age=14400` y `cf-cache-status` distinto de `DYNAMIC`) — así
  // que `no-store` es lo correcto pero no basta por sí solo. El enlace de descarga real debe
  // llevar `?v=<versión>` (ver `tools/deploy.mjs`): Cloudflare incluye la query string en su
  // clave de caché, así que una versión nueva nunca ha sido pedida antes y fuerza ir al origen,
  // sin depender de que Cloudflare respete ninguna cabecera.
  const apkFile = cfg.downloadsDir ? join(cfg.downloadsDir, "cheluisfit.apk") : undefined;
  const versionFile = cfg.downloadsDir ? join(cfg.downloadsDir, "version.json") : undefined;
  app.get("/app.apk", async (_req, reply) => {
    if (!apkFile || !existsSync(apkFile)) return reply.code(404).send({ error: "not_found", message: "La app de Android aún no está disponible" });
    return reply
      .header("Content-Type", "application/vnd.android.package-archive")
      .header("Content-Disposition", 'attachment; filename="cheluisfit.apk"')
      .header("Cache-Control", "no-store")
      .send(createReadStream(apkFile));
  });
  app.get("/version.json", async (_req, reply) => {
    if (!versionFile || !existsSync(versionFile)) return reply.code(404).send({ error: "not_found", message: "Sin versión publicada" });
    return reply.header("Cache-Control", "no-store").type("application/json").send(readFileSync(versionFile, "utf8"));
  });

  // Export web de Expo, para «un vistazo rápido» desde el ordenador (no reemplaza al APK).
  const webDir = cfg.webDir ? resolve(cfg.webDir) : undefined;
  if (webDir && existsSync(webDir)) {
    await app.register(fastifyStatic, {
      root: webDir,
      cacheControl: false,
      setHeaders(res, path) {
        res.header("Cache-Control", path.includes("/_expo/") ? "public, max-age=31536000, immutable" : "no-cache");
      },
    });
    app.setNotFoundHandler((req, reply) => {
      const isApi = req.url.startsWith("/api") || req.url.endsWith(".apk");
      if (req.method === "GET" && !isApi) return reply.header("Cache-Control", "no-cache").sendFile("index.html");
      return reply.code(404).send({ error: "not_found", message: "No encontrado" });
    });
  }

  return Object.assign(app, { db }) as App;
}
