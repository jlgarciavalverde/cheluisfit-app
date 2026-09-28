import { purgeExpiredSessions } from "./auth";
import { backupDb } from "./backup";
import { buildApp } from "./app";

const DATA_DIR = process.env.DATA_DIR ?? "data";

const app = await buildApp({
  dbPath: `${DATA_DIR}/cheluisfit.db`,
  mediaDir: `${DATA_DIR}/media`,
  version: process.env.APP_VERSION ?? "0.0.0",
  setupCode: process.env.SETUP_CODE || undefined,
  webDir: process.env.WEB_DIR ?? "web",
  downloadsDir: `${DATA_DIR}/downloads`,
  allowedOrigins: (
    process.env.ALLOWED_ORIGINS ??
    (process.env.NODE_ENV === "production"
      ? "https://cheluisfit.redgarverde.com"
      : "https://cheluisfit.redgarverde.com,https://localhost,http://localhost:8081,http://localhost:8099")
  )
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  authRateLimit: process.env.AUTH_RATE_LIMIT ? Number(process.env.AUTH_RATE_LIMIT) : undefined,
  logLevel: process.env.LOG_LEVEL,
  geminiApiKey: process.env.GEMINI_API_KEY || undefined,
  groqApiKey: process.env.GROQ_API_KEY || undefined,
  stravaClientId: process.env.STRAVA_CLIENT_ID || undefined,
  stravaClientSecret: process.env.STRAVA_CLIENT_SECRET || undefined,
});

// Copia diaria de la base de datos (se refresca cada 6 h; queda una por día, 14 días).
const runBackup = () => {
  try {
    app.log.info({ file: backupDb(app.db, `${DATA_DIR}/backups`), expiredSessions: purgeExpiredSessions(app.db) }, "backup ok");
  } catch (err) {
    app.log.error(err, "backup falló");
  }
};
setTimeout(runBackup, 30_000).unref();
setInterval(runBackup, 6 * 3600 * 1000).unref();

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => app.close().then(() => process.exit(0)));
}

await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
