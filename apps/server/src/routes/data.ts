import { requireUser } from "../auth";
import { all, get, run } from "../db";
import { HttpError, perUserKey } from "../http";
import type { Register } from "./ctx";

/** Claves de `AsyncStorage` que sincronizan (mismas que usa el móvil, ver `apps/mobile/src/data`). */
const KEYS = new Set(["cf_nutrition_v1", "cf_running_v1", "cf_strength_v1", "cf_active_workout_v1"]);

/**
 * Tope por blob, por debajo del `bodyLimit` global (5 MB): en Android una sola entrada de
 * AsyncStorage empieza a fallar hacia los 2 MB (CursorWindow), así que algo que pase de aquí ya
 * no podría ni guardarse bien en el móvil — mejor un 413 claro que un blob que no se puede bajar.
 */
const MAX_BLOB_BYTES = 3_000_000;

/**
 * Sincronización: cada tienda local (zustand + AsyncStorage) sube y baja su blob entero, sin
 * fusión. **Con control de versión optimista**: el móvil manda `?base=<updatedAt>` con la
 * versión que tenía la última vez que sincronizó (`0` = «espero que aún no haya nada»). Si el
 * servidor tiene otra, responde 409 con la suya y el móvil decide (ver `sync.ts` del móvil: gana
 * el servidor y lo local se guarda aparte). Sin `base` se escribe sin comprobar — lo que siguen
 * haciendo las APK anteriores a la 0.11, que no conocen el parámetro.
 */
export const registerData: Register = (app, { db }) => {
  const writeLimit = { config: { rateLimit: { max: 240, timeWindow: "1 hour", keyGenerator: perUserKey } } };

  app.get<{ Querystring: { meta?: string } }>("/api/blobs", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    // `?meta=1`: solo claves y versiones, para que el móvil sepa si algo cambió sin bajarlo todo.
    if (req.query.meta) {
      const rows = all(db, "SELECT key, updated_at FROM blobs WHERE user_id = ?", user.id);
      return { blobs: rows.map((r) => ({ key: r.key, updatedAt: r.updated_at })) };
    }
    const rows = all(db, "SELECT key, data, updated_at FROM blobs WHERE user_id = ?", user.id);
    return { blobs: rows.map((r) => ({ key: r.key, data: JSON.parse(r.data), updatedAt: r.updated_at })) };
  });

  app.get<{ Params: { key: string } }>("/api/blobs/:key", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    if (!KEYS.has(req.params.key)) throw new HttpError(404, "Clave desconocida");
    const row = get(db, "SELECT data, updated_at FROM blobs WHERE user_id = ? AND key = ?", user.id, req.params.key);
    if (!row) throw new HttpError(404, "Sin datos todavía");
    return { key: req.params.key, data: JSON.parse(row.data), updatedAt: row.updated_at };
  });

  app.put<{ Params: { key: string }; Querystring: { base?: string } }>("/api/blobs/:key", writeLimit, async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const { key } = req.params;
    if (!KEYS.has(key)) throw new HttpError(404, "Clave desconocida");
    const body = req.body as { state?: unknown } | null;
    // Siempre el envoltorio de `persist` (`{state, version}`), nunca un array ni un objeto suelto.
    if (typeof body !== "object" || body === null || Array.isArray(body) || typeof body.state !== "object" || body.state === null) {
      throw new HttpError(400, "Cuerpo no válido: se espera {state, version}");
    }
    const json = JSON.stringify(body);
    if (Buffer.byteLength(json) > MAX_BLOB_BYTES) throw new HttpError(413, "Tus datos de esta sección ocupan demasiado para sincronizarse");

    let base: number | null = null;
    if (req.query.base !== undefined) {
      base = Number(req.query.base);
      if (!Number.isInteger(base) || base < 0) throw new HttpError(400, "Versión base no válida");
    }

    const current = get(db, "SELECT data, updated_at FROM blobs WHERE user_id = ? AND key = ?", user.id, key);
    if (base !== null && (current?.updated_at ?? 0) !== base) {
      return reply.code(409).send({
        error: "conflict",
        message: "Estos datos han cambiado en otro dispositivo",
        key,
        data: current ? JSON.parse(current.data) : null,
        updatedAt: current?.updated_at ?? 0,
      });
    }
    // Siempre estrictamente mayor que la anterior, aunque dos subidas caigan en el mismo ms.
    const updatedAt = Math.max(Date.now(), (current?.updated_at ?? 0) + 1);
    run(
      db,
      `INSERT INTO blobs (user_id, key, data, updated_at) VALUES (?,?,?,?)
       ON CONFLICT (user_id, key) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      user.id,
      key,
      json,
      updatedAt,
    );
    return { updatedAt };
  });
};
