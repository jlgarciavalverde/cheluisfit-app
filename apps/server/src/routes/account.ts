import { randomBytes, randomUUID } from "node:crypto";
import { bearerToken, createSession, deleteSession, hashPassword, requireUser, safeEqual, verifyPassword } from "../auth";
import { all, get, insertProfileFor, run, tx } from "../db";
import { HttpError, toUser } from "../http";
import { LoginInput, RegisterInput } from "../schemas";
import type { Register } from "./ctx";

const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const INVITE_TTL_MS = 7 * 24 * 3600 * 1000;

const newInviteCode = () => Array.from(randomBytes(8), (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");

/**
 * Cuentas, invitaciones y sesiones. Registro cerrado: la primera cuenta (con `setupCode`) crea
 * el hogar y es admin; el resto necesita una invitación de un admin. Datos de fitness son
 * personales por usuario (ver `blobs` en db.ts), no compartidos por hogar.
 */
export const registerAccount: Register = (app, { db, cfg }) => {
  const authLimit = { config: { rateLimit: { max: cfg.authRateLimit ?? 10, timeWindow: "1 minute" } } };

  app.get("/api/setup-status", async () => ({
    needsSetup: (get(db, "SELECT COUNT(*) AS c FROM households")!.c as number) === 0,
  }));

  app.get<{ Params: { code: string } }>("/api/invites/:code", authLimit, async (req) => {
    const inv = get(
      db,
      `SELECT h.name FROM invites i JOIN households h ON h.id = i.household_id
       WHERE i.code = ? AND i.used_at IS NULL AND i.expires_at > ?`,
      req.params.code.toUpperCase(),
      Date.now(),
    );
    return { valid: !!inv, householdName: inv?.name ?? null };
  });

  app.post("/api/auth/register", authLimit, async (req, reply) => {
    const b = RegisterInput.parse(req.body);
    if (get(db, "SELECT 1 AS x FROM users WHERE email = ?", b.email)) throw new HttpError(409, "Ya existe una cuenta con ese correo");
    const passwordHash = await hashPassword(b.password);

    const userId = tx(db, () => {
      const now = Date.now();
      let householdId: string;
      let role: "admin" | "member";
      let inviteCode: string | null = null;

      if (b.inviteCode) {
        const inv = get(db, "SELECT * FROM invites WHERE code = ? AND used_at IS NULL AND expires_at > ?", b.inviteCode, now);
        if (!inv) throw new HttpError(400, "La invitación no es válida o ha caducado");
        householdId = inv.household_id;
        role = "member";
        inviteCode = inv.code;
      } else {
        if ((get(db, "SELECT COUNT(*) AS c FROM households")!.c as number) > 0)
          throw new HttpError(403, "El registro está cerrado: necesitas una invitación");
        if (!cfg.setupCode || !safeEqual(b.setupCode ?? "", cfg.setupCode)) throw new HttpError(403, "El código de configuración no es correcto");
        householdId = randomUUID();
        role = "admin";
        run(db, "INSERT INTO households (id, name, created_at) VALUES (?,?,?)", householdId, b.householdName ?? "CheluisFIT", now);
      }

      const id = randomUUID();
      run(
        db,
        "INSERT INTO users (id, household_id, email, name, password_hash, role, created_at) VALUES (?,?,?,?,?,?,?)",
        id,
        householdId,
        b.email,
        b.name,
        passwordHash,
        role,
        now,
      );
      if (inviteCode) run(db, "UPDATE invites SET used_by = ?, used_at = ? WHERE code = ?", id, now, inviteCode);
      insertProfileFor(db, id, b.name);
      return id;
    });

    const row = get(db, "SELECT * FROM users WHERE id = ?", userId)!;
    const token = createSession(db, userId, req.headers["user-agent"]);
    reply.code(201);
    return { token, user: toUser(row) };
  });

  app.post("/api/auth/login", authLimit, async (req) => {
    const b = LoginInput.parse(req.body);
    const row = get(db, "SELECT * FROM users WHERE email = ? AND removed_at IS NULL", b.email);
    const ok = await verifyPassword(b.password, row?.password_hash ?? null);
    if (!row || !ok) throw new HttpError(401, "Correo o contraseña incorrectos");
    return { token: createSession(db, row.id, req.headers["user-agent"]), user: toUser(row) };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    requireUser(db, req.headers.authorization);
    deleteSession(db, bearerToken(req.headers.authorization)!);
    reply.code(204);
  });

  app.get("/api/me", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const household = {
      ...get(db, "SELECT id, name FROM households WHERE id = ?", user.householdId)!,
      members: all(db, "SELECT * FROM users WHERE household_id = ? AND removed_at IS NULL ORDER BY created_at", user.householdId).map(toUser),
    };
    return { user: toUser(get(db, "SELECT * FROM users WHERE id = ?", user.id)!), household };
  });

  /** Invitar a alguien (amigos/familia) — solo el admin. */
  app.post("/api/household/invites", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    if (user.role !== "admin") throw new HttpError(403, "Solo el administrador puede invitar");
    const code = newInviteCode();
    const now = Date.now();
    run(
      db,
      "INSERT INTO invites (code, household_id, created_by, created_at, expires_at) VALUES (?,?,?,?,?)",
      code,
      user.householdId,
      user.id,
      now,
      now + INVITE_TTL_MS,
    );
    reply.code(201);
    return { code, expiresAt: now + INVITE_TTL_MS };
  });
};
