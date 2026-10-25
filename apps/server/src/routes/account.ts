import { randomBytes, randomUUID } from "node:crypto";
import { bearerToken, createSession, deleteSession, hashPassword, hashToken, requireUser, safeEqual, verifyPassword } from "../auth";
import { all, get, insertProfileFor, run, tx } from "../db";
import { HttpError, toUser } from "../http";
import { AdminRecoveryInput, ChangePasswordInput, LoginInput, RegisterInput, ResetPasswordInput, UpdateMeInput } from "../schemas";
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

  /**
   * Datos privados de la cuenta (nombre real y correo). No cambian nada de Social: lo que ven los
   * demás es el perfil público (`routes/social.ts`, `display_name`).
   */
  app.put("/api/me", authLimit, async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const b = UpdateMeInput.parse(req.body);
    if (b.email && b.email !== user.email && get(db, "SELECT 1 AS x FROM users WHERE email = ? AND id != ?", b.email, user.id)) {
      throw new HttpError(409, "Ya existe una cuenta con ese correo");
    }
    run(db, "UPDATE users SET name = ?, email = ? WHERE id = ?", b.name ?? user.name, b.email ?? user.email, user.id);
    return { user: toUser(get(db, "SELECT * FROM users WHERE id = ?", user.id)!) };
  });

  /** Cambiar la contraseña pidiendo la actual; cierra las demás sesiones (no la de este móvil). */
  app.put("/api/me/password", authLimit, async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const b = ChangePasswordInput.parse(req.body);
    const row = get(db, "SELECT password_hash FROM users WHERE id = ?", user.id);
    if (!(await verifyPassword(b.current, (row?.password_hash as string | undefined) ?? null))) throw new HttpError(403, "La contraseña actual no es correcta");
    const hash = await hashPassword(b.next);
    const current = bearerToken(req.headers.authorization);
    tx(db, () => {
      run(db, "UPDATE users SET password_hash = ? WHERE id = ?", hash, user.id);
      run(db, "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?", user.id, hashToken(current ?? ""));
    });
    return { ok: true };
  });

  // ---------- Recuperar el acceso (sin correo: lo genera un administrador) ----------
  // Mismo diseño que Compra en Familia: el admin genera un código de un solo uso (24 h) para otra
  // persona del hogar y se lo pasa por WhatsApp; con él se pone una contraseña nueva. Para el
  // propio admin, el `SETUP_CODE` del `.env` del servidor hace de llave maestra.
  const RESET_TTL_MS = 24 * 3600 * 1000;

  app.get("/api/household/members", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    if (user.role !== "admin") throw new HttpError(403, "Solo el administrador puede ver esto");
    return { members: all(db, "SELECT * FROM users WHERE household_id = ? AND removed_at IS NULL ORDER BY created_at", user.householdId).map(toUser) };
  });

  app.post<{ Params: { id: string } }>("/api/household/members/:id/reset", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    if (user.role !== "admin") throw new HttpError(403, "Solo el administrador puede restablecer accesos");
    const target = get(db, "SELECT * FROM users WHERE id = ? AND household_id = ? AND removed_at IS NULL", req.params.id, user.householdId);
    if (!target) throw new HttpError(404, "Esa persona no está en el hogar");
    if (target.id === user.id) throw new HttpError(400, "Para cambiar tu contraseña usa «Datos de la cuenta»");
    const code = newInviteCode();
    const now = Date.now();
    tx(db, () => {
      run(db, "DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL", target.id);
      run(db, "INSERT INTO password_resets (code, user_id, created_by, created_at, expires_at) VALUES (?,?,?,?,?)", code, target.id, user.id, now, now + RESET_TTL_MS);
    });
    reply.code(201);
    return { code, name: target.name, expiresAt: now + RESET_TTL_MS };
  });

  app.get<{ Params: { code: string } }>("/api/reset/:code", authLimit, async (req) => {
    const row = get(
      db,
      `SELECT u.name FROM password_resets r JOIN users u ON u.id = r.user_id
       WHERE r.code = ? AND r.used_at IS NULL AND r.expires_at > ? AND u.removed_at IS NULL`,
      req.params.code.toUpperCase(),
      Date.now(),
    );
    return { valid: !!row, name: row?.name ?? null };
  });

  /** Contraseña nueva con el código; cierra todas las sesiones y abre una nueva en este móvil. */
  app.post("/api/auth/reset", authLimit, async (req) => {
    const b = ResetPasswordInput.parse(req.body);
    const now = Date.now();
    const r = get(
      db,
      `SELECT r.code, u.* FROM password_resets r JOIN users u ON u.id = r.user_id
       WHERE r.code = ? AND r.used_at IS NULL AND r.expires_at > ? AND u.removed_at IS NULL`,
      b.code,
      now,
    );
    if (!r) throw new HttpError(400, "El código no es válido o ha caducado");
    const hash = await hashPassword(b.password);
    tx(db, () => {
      run(db, "UPDATE users SET password_hash = ? WHERE id = ?", hash, r.id);
      run(db, "UPDATE password_resets SET used_at = ? WHERE code = ?", now, r.code);
      run(db, "DELETE FROM sessions WHERE user_id = ?", r.id);
    });
    return { token: createSession(db, r.id, req.headers["user-agent"]), user: toUser(r) };
  });

  /** El administrador sin acceso: su correo + el `SETUP_CODE` del servidor. Solo cuentas admin. */
  app.post("/api/auth/admin-recovery", authLimit, async (req) => {
    const b = AdminRecoveryInput.parse(req.body);
    const u = get(db, "SELECT * FROM users WHERE email = ? AND role = 'admin' AND removed_at IS NULL", b.email);
    // Mismo error para «no existe» y «código mal»: no se puede sondear qué correos son admin.
    if (!u || !cfg.setupCode || !safeEqual(b.setupCode, cfg.setupCode)) throw new HttpError(403, "El correo o el código de configuración no son correctos");
    const hash = await hashPassword(b.password);
    tx(db, () => {
      run(db, "UPDATE users SET password_hash = ? WHERE id = ?", hash, u.id);
      run(db, "DELETE FROM sessions WHERE user_id = ?", u.id);
    });
    return { token: createSession(db, u.id, req.headers["user-agent"]), user: toUser(u) };
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
