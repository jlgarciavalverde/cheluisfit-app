import { randomBytes } from "node:crypto";
import { requireUser } from "../auth";
import { get, run } from "../db";
import { HttpError } from "../http";
import { StravaSyncInput } from "../schemas";
import { buildAuthorizeUrl, disconnectStrava, ensureFreshToken, exchangeCode, fetchActivities, fetchLatLng, isStravaConnected, toImportedActivity } from "../strava";
import type { Register } from "./ctx";

const STATE_TTL_MS = 10 * 60 * 1000;

/**
 * OAuth de Strava, para traer el recorrido GPS de las carreras que Garmin nunca comparte por
 * Health Connect (límite externo, ver `AGENTS.md`). El servidor solo mueve blobs/actividades
 * enteras, nunca decide fusión ni dominio — eso lo hace `mergeImportedActivities()` en el móvil,
 * igual que ya pasa con Health Connect.
 */
export const registerStrava: Register = (app, { db, cfg }) => {
  const syncLimit = { config: { rateLimit: { max: 20, timeWindow: "1 hour" } } };

  app.get("/api/strava/status", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    return { connected: isStravaConnected(db, user.id) };
  });

  app.post("/api/strava/connect", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    if (!cfg.stravaClientId || !cfg.stravaClientSecret) throw new HttpError(503, "Strava no está configurado todavía");
    const state = randomBytes(24).toString("base64url");
    run(db, "INSERT INTO strava_oauth_states (state, user_id, created_at) VALUES (?,?,?)", state, user.id, Date.now());
    return { url: buildAuthorizeUrl(cfg, state) };
  });

  // Sin sesión a propósito: la visita el navegador tras el login en strava.com, no el móvil.
  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>("/api/strava/callback", async (req, reply) => {
    const { code, state } = req.query;
    run(db, "DELETE FROM strava_oauth_states WHERE created_at < ?", Date.now() - STATE_TTL_MS);
    if (!state || !code) return reply.redirect("cheluisfit://strava-connected?ok=0");
    const row = get(db, "SELECT * FROM strava_oauth_states WHERE state = ?", state);
    run(db, "DELETE FROM strava_oauth_states WHERE state = ?", state);
    if (!row) return reply.redirect("cheluisfit://strava-connected?ok=0");
    try {
      await exchangeCode(db, cfg, row.user_id as string, code);
      return reply.redirect("cheluisfit://strava-connected?ok=1");
    } catch {
      return reply.redirect("cheluisfit://strava-connected?ok=0");
    }
  });

  app.post("/api/strava/sync", syncLimit, async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const accessToken = await ensureFreshToken(db, cfg, user.id);
    const { since } = StravaSyncInput.parse(req.body);
    // Primera sincronización de esta cuenta (`since: null`): solo desde ahora, no todo el
    // histórico — evita duplicar carreras ya importadas antes por Garmin (sin fusión automática
    // por fecha, fuera de alcance para el problema real). Las siguientes mandan la marca que
    // guarda el móvil (`lastStravaSync`).
    const afterEpochS = Math.floor((since ? Date.parse(since) : Date.now()) / 1000);

    const { activities, truncated } = await fetchActivities(accessToken, afterEpochS);
    const out = [];
    for (const a of activities) {
      const route = a.map?.summary_polyline ? await fetchLatLng(accessToken, a.id) : null;
      const imported = toImportedActivity(a, route);
      if (imported) out.push(imported);
    }
    // `until`: hasta dónde puede avanzar el móvil su `lastStravaSync`. Si se cortó por el tope,
    // la fecha de inicio de la última recibida (lo posterior llegará en la siguiente); si no, ahora.
    const last = activities.at(-1);
    const until = truncated && last?.start_date ? last.start_date : new Date().toISOString();
    return { activities: out, until };
  });

  app.delete("/api/strava/disconnect", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    disconnectStrava(db, user.id);
    return { ok: true };
  });
};
