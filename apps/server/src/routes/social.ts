import { randomUUID } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import { requireUser } from "../auth";
import { all, get, run, tx, type DB } from "../db";
import { HttpError, perUserKey } from "../http";
import { CreateCommentInput, CreatePostInput, ProfileStatsInput, ReadNotificationsInput, UpdateProfileInput } from "../schemas";
import type { Register } from "./ctx";

const FEED_PAGE_SIZE = 20;
const NOTIFICATIONS_PAGE_SIZE = 30;
const LIST_LIMIT = 200;

interface ProfileRow {
  user_id: string;
  username: string;
  display_name: string;
  bio: string;
  city: string;
  sports: string;
  stats: string;
  hidden_stats: string;
  avatar_media_id: string | null;
  cover_media_id: string | null;
  is_private: number;
}

interface StatCard {
  key: string;
  label: string;
  value: string;
  unit?: string;
  detail?: string;
}

/** El nombre que ven los demás: el público del perfil o, si está vacío, el de la cuenta. */
const PUBLIC_NAME = "COALESCE(NULLIF(pr.display_name, ''), u.name)";

function mediaUrl(mediaId: string | null): string | undefined {
  return mediaId ? `/api/media/${mediaId}` : undefined;
}

const parseJson = <T>(text: string, fallback: T): T => {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
};

/** Persona tal como sale en posts, comentarios, listas y avisos (nunca datos de la cuenta). */
function publicUser(r: Record<string, any>, prefix = "") {
  return { id: r[`${prefix}user_id`], name: r[`${prefix}name`], username: r[`${prefix}username`], avatarUrl: mediaUrl(r[`${prefix}avatar_media_id`]) };
}

function mediaUrls(db: DB, postId: string): string[] {
  return all(db, "SELECT media_id FROM post_media WHERE post_id = ? ORDER BY position", postId).map((r) => `/api/media/${r.media_id}`);
}

/** Propio, o perfil público, o seguidor aceptado — la única regla de visibilidad de posts (y de lo demás del perfil). */
function canViewPosts(db: DB, viewerId: string, ownerId: string): boolean {
  if (viewerId === ownerId) return true;
  const profile = get(db, "SELECT is_private FROM profiles WHERE user_id = ?", ownerId) as { is_private: number } | undefined;
  if (!profile) return false;
  if (!profile.is_private) return true;
  return !!get(db, "SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'accepted'", viewerId, ownerId);
}

function followState(db: DB, viewerId: string, ownerId: string): "self" | "none" | "pending" | "accepted" {
  if (viewerId === ownerId) return "self";
  const row = get(db, "SELECT status FROM follows WHERE follower_id = ? AND followee_id = ?", viewerId, ownerId) as { status: string } | undefined;
  return (row?.status as "pending" | "accepted" | undefined) ?? "none";
}

function requireProfile(db: DB, userId: string): ProfileRow {
  const p = get(db, "SELECT * FROM profiles WHERE user_id = ?", userId) as ProfileRow | undefined;
  if (!p) throw new HttpError(404, "No encontrado");
  return p;
}

/** Perfil de una persona activa por @usuario (las cuentas dadas de baja no existen para nadie). */
function activeProfile(db: DB, username: string): ProfileRow {
  const p = get(
    db,
    "SELECT pr.* FROM profiles pr JOIN users u ON u.id = pr.user_id WHERE pr.username = ? AND u.removed_at IS NULL",
    username,
  ) as ProfileRow | undefined;
  if (!p) throw new HttpError(404, "No encontrado");
  return p;
}

/** Columnas + joins comunes a cualquier consulta de posts (feed, perfil, post suelto). */
const POST_SELECT = `SELECT p.id, p.user_id, p.kind, p.text, p.snapshot, p.created_at,
         ${PUBLIC_NAME} AS name, pr.username, pr.avatar_media_id,
         (SELECT COUNT(*) FROM likes WHERE post_id = p.id) AS likes_count,
         EXISTS(SELECT 1 FROM likes WHERE post_id = p.id AND user_id = ?) AS liked_by_me,
         (SELECT COUNT(*) FROM comments WHERE post_id = p.id) AS comments_count
  FROM posts p JOIN users u ON u.id = p.user_id JOIN profiles pr ON pr.user_id = p.user_id`;

function postDTO(db: DB, row: Record<string, any>) {
  return {
    id: row.id,
    kind: row.kind,
    text: row.text,
    snapshot: JSON.parse(row.snapshot),
    createdAt: row.created_at,
    author: publicUser(row),
    media: mediaUrls(db, row.id),
    likesCount: row.likes_count,
    likedByMe: !!row.liked_by_me,
    commentsCount: row.comments_count,
  };
}

/** Cláusula de cursor compuesto `created_at:id` (dos posts en el mismo milisegundo no se pierden). */
function cursorClause(cursor: string | undefined, alias: string, params: SQLInputValue[]): string {
  if (!cursor) return "";
  const [createdAt, id] = cursor.split(":");
  if (!createdAt || !id || !Number.isFinite(Number(createdAt))) throw new HttpError(400, "Cursor no válido");
  params.push(Number(createdAt), Number(createdAt), id);
  return `AND (${alias}.created_at < ? OR (${alias}.created_at = ? AND ${alias}.id < ?))`;
}

function page<T extends { created_at: number; id: string }>(rows: T[], size: number) {
  const items = rows.slice(0, size);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > size && last ? `${last.created_at}:${last.id}` : null };
}

/** `LIKE` con lo que escribe la persona: `%` y `_` son literales, no comodines. */
const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

type NotificationKind = "follow" | "follow_request" | "follow_accepted" | "like" | "comment";

/**
 * Aviso para `userId` de algo que hizo `actorId`. Nunca sobre uno mismo, y sin repetir: un like
 * quitado y vuelto a dar, o seguir/dejar/volver a seguir, sustituye el aviso anterior.
 */
function notify(db: DB, n: { userId: string; actorId: string; kind: NotificationKind; postId?: string; commentId?: string }) {
  if (n.userId === n.actorId) return;
  if (n.kind !== "comment") {
    run(
      db,
      "DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND kind = ? AND COALESCE(post_id, '') = ?",
      n.userId,
      n.actorId,
      n.kind,
      n.postId ?? "",
    );
  }
  run(
    db,
    "INSERT INTO notifications (id, user_id, actor_id, kind, post_id, comment_id, created_at) VALUES (?,?,?,?,?,?,?)",
    randomUUID(),
    n.userId,
    n.actorId,
    n.kind,
    n.postId ?? null,
    n.commentId ?? null,
    Date.now(),
  );
}

function statsFor(p: ProfileRow, includeHidden: boolean): (StatCard & { visible: boolean })[] {
  const hidden = new Set(parseJson<string[]>(p.hidden_stats, []));
  return parseJson<StatCard[]>(p.stats, [])
    .map((s) => ({ ...s, visible: !hidden.has(s.key) }))
    .filter((s) => includeHidden || s.visible);
}

/**
 * Capa social: perfiles públicos, follows, posts (con snapshot de un entreno real o libres),
 * fotos, comentarios, likes y avisos. **Lo público y lo privado van separados**: aquí solo hay
 * lo que la persona decide enseñar (nombre público, foto, portada, bio, ciudad, deportes y un
 * resumen de estadísticas que sube el propio móvil). Los blobs de fitness siguen siendo privados
 * siempre — esta ruta nunca lee `routes/data.ts` ni el blob de nadie, y el nombre y el correo de
 * la cuenta (`users`) no salen nunca de aquí.
 */
export const registerSocial: Register = (app, { db }) => {
  // Por sesión, no por IP (`perUserKey`): con `trustProxy` la IP se puede inventar, y todo el
  // grupo de amigos sale por la misma IP de casa.
  const mutateLimit = { config: { rateLimit: { max: 60, timeWindow: "1 hour", keyGenerator: perUserKey } } };

  app.get<{ Querystring: { cursor?: string } }>("/api/social/feed", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const params: SQLInputValue[] = [user.id, user.id, user.id];
    const cursor = cursorClause(req.query.cursor, "p", params);
    const rows = all(
      db,
      `${POST_SELECT}
       WHERE (p.user_id = ? OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ? AND status = 'accepted'))
       AND u.removed_at IS NULL
       ${cursor}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ${FEED_PAGE_SIZE + 1}`,
      ...params,
    ) as (Record<string, any> & { created_at: number; id: string })[];
    const { items, nextCursor } = page(rows, FEED_PAGE_SIZE);
    return { posts: items.map((r) => postDTO(db, r)), nextCursor };
  });

  app.get<{ Params: { id: string } }>("/api/social/posts/:id", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const row = get(db, `${POST_SELECT} WHERE p.id = ?`, user.id, req.params.id);
    if (!row || !canViewPosts(db, user.id, row.user_id)) throw new HttpError(404, "No encontrado");
    return postDTO(db, row);
  });

  function userPosts(viewerId: string, ownerId: string, cursor?: string) {
    const params: SQLInputValue[] = [viewerId, ownerId];
    const clause = cursorClause(cursor, "p", params);
    const rows = all(db, `${POST_SELECT} WHERE p.user_id = ? ${clause} ORDER BY p.created_at DESC, p.id DESC LIMIT ${FEED_PAGE_SIZE + 1}`, ...params) as (Record<
      string,
      any
    > & { created_at: number; id: string })[];
    const { items, nextCursor } = page(rows, FEED_PAGE_SIZE);
    return { posts: items.map((r) => postDTO(db, r)), nextCursor };
  }

  app.get<{ Params: { username: string } }>("/api/social/users/:username", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const profile = activeProfile(db, req.params.username);
    const owner = get(db, "SELECT name FROM users WHERE id = ?", profile.user_id)!;
    const canView = canViewPosts(db, user.id, profile.user_id);
    const posts = canView ? userPosts(user.id, profile.user_id) : null;
    return {
      profile: {
        id: profile.user_id,
        username: profile.username,
        // `name` = el nombre público (compatibilidad con las APK ≤ 0.19, que leían `name`).
        name: profile.display_name || owner.name,
        displayName: profile.display_name || owner.name,
        avatarUrl: mediaUrl(profile.avatar_media_id),
        isPrivate: !!profile.is_private,
        // Lo demás del perfil solo para quien puede ver sus posts (perfil privado = solo cabecera).
        bio: canView ? profile.bio : "",
        city: canView ? profile.city : "",
        sports: canView ? parseJson<string[]>(profile.sports, []) : [],
        coverUrl: canView ? mediaUrl(profile.cover_media_id) : undefined,
        stats: canView ? statsFor(profile, false).map(({ visible: _v, ...s }) => s) : [],
      },
      followState: followState(db, user.id, profile.user_id),
      followsMe: user.id !== profile.user_id && !!get(db, "SELECT 1 AS x FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'accepted'", profile.user_id, user.id),
      counts: {
        posts: get(db, "SELECT COUNT(*) AS c FROM posts WHERE user_id = ?", profile.user_id)!.c as number,
        followers: get(db, "SELECT COUNT(*) AS c FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.followee_id = ? AND f.status = 'accepted' AND u.removed_at IS NULL", profile.user_id)!.c as number,
        following: get(db, "SELECT COUNT(*) AS c FROM follows f JOIN users u ON u.id = f.followee_id WHERE f.follower_id = ? AND f.status = 'accepted' AND u.removed_at IS NULL", profile.user_id)!.c as number,
      },
      posts: posts?.posts ?? null,
      nextCursor: posts?.nextCursor ?? null,
    };
  });

  app.get<{ Params: { username: string }; Querystring: { cursor?: string } }>("/api/social/users/:username/posts", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const profile = activeProfile(db, req.params.username);
    if (!canViewPosts(db, user.id, profile.user_id)) throw new HttpError(403, "Esta cuenta es privada");
    return userPosts(user.id, profile.user_id, req.query.cursor);
  });

  /** Seguidores o seguidos de alguien, con la misma regla que sus posts. */
  for (const which of ["followers", "following"] as const) {
    app.get<{ Params: { username: string } }>(`/api/social/users/:username/${which}`, async (req) => {
      const user = requireUser(db, req.headers.authorization);
      const profile = activeProfile(db, req.params.username);
      if (!canViewPosts(db, user.id, profile.user_id)) throw new HttpError(403, "Esta cuenta es privada");
      const [match, other] = which === "followers" ? ["followee_id", "follower_id"] : ["follower_id", "followee_id"];
      const rows = all(
        db,
        `SELECT pr.user_id, pr.username, pr.avatar_media_id, ${PUBLIC_NAME} AS name FROM follows f
         JOIN profiles pr ON pr.user_id = f.${other} JOIN users u ON u.id = f.${other}
         WHERE f.${match} = ? AND f.status = 'accepted' AND u.removed_at IS NULL
         ORDER BY f.created_at DESC LIMIT ${LIST_LIMIT}`,
        profile.user_id,
      );
      return { users: rows.map((r) => ({ ...publicUser(r), followState: followState(db, user.id, r.user_id) })) };
    });
  }

  /** Tu perfil público entero (incluidas las estadísticas ocultas, para el editor). */
  app.get("/api/social/profile", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const p = requireProfile(db, user.id);
    return {
      username: p.username,
      displayName: p.display_name || user.name,
      bio: p.bio,
      city: p.city,
      sports: parseJson<string[]>(p.sports, []),
      avatarUrl: mediaUrl(p.avatar_media_id),
      avatarMediaId: p.avatar_media_id,
      coverUrl: mediaUrl(p.cover_media_id),
      coverMediaId: p.cover_media_id,
      isPrivate: !!p.is_private,
      stats: statsFor(p, true),
    };
  });

  app.put("/api/social/profile", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const b = UpdateProfileInput.parse(req.body);
    const current = requireProfile(db, user.id);
    for (const mediaId of [b.avatarMediaId, b.coverMediaId]) {
      if (!mediaId) continue;
      const owned = get(db, "SELECT 1 AS x FROM media WHERE id = ? AND user_id = ?", mediaId, user.id);
      if (!owned) throw new HttpError(403, "Esa foto no es tuya");
    }
    if (b.username) {
      const clash = get(db, "SELECT 1 AS x FROM profiles WHERE username = ? AND user_id != ?", b.username, user.id);
      if (clash) throw new HttpError(409, "Ese nombre de usuario ya está en uso");
    }
    const nowPublic = b.isPrivate === false && !!current.is_private;
    tx(db, () => {
      run(
        db,
        `UPDATE profiles SET display_name = ?, bio = ?, city = ?, sports = ?, avatar_media_id = ?, cover_media_id = ?,
           is_private = ?, hidden_stats = ?, username = ? WHERE user_id = ?`,
        b.displayName ?? current.display_name,
        b.bio ?? current.bio,
        b.city ?? current.city,
        b.sports ? JSON.stringify([...new Set(b.sports)]) : current.sports,
        b.avatarMediaId === undefined ? current.avatar_media_id : b.avatarMediaId,
        b.coverMediaId === undefined ? current.cover_media_id : b.coverMediaId,
        b.isPrivate === undefined ? current.is_private : b.isPrivate ? 1 : 0,
        b.hiddenStats ? JSON.stringify([...new Set(b.hiddenStats)]) : current.hidden_stats,
        b.username ?? current.username,
        user.id,
      );
      // Al pasar a público, las solicitudes pendientes ya no tienen sentido: se aceptan todas
      // (antes se quedaban colgadas para siempre, sin ningún sitio donde verlas).
      if (nowPublic) {
        const pending = all(db, "SELECT follower_id FROM follows WHERE followee_id = ? AND status = 'pending'", user.id);
        run(db, "UPDATE follows SET status = 'accepted' WHERE followee_id = ? AND status = 'pending'", user.id);
        run(db, "UPDATE notifications SET kind = 'follow' WHERE user_id = ? AND kind = 'follow_request'", user.id);
        for (const f of pending) notify(db, { userId: f.follower_id, actorId: user.id, kind: "follow_accepted" });
      }
    });
    return { ok: true };
  });

  /** El móvil sube su resumen de estadísticas (`domain/socialStats.ts`); qué se ve lo decide `hiddenStats`. */
  app.put("/api/social/profile/stats", mutateLimit, async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const b = ProfileStatsInput.parse(req.body);
    requireProfile(db, user.id);
    run(db, "UPDATE profiles SET stats = ?, stats_updated_at = ? WHERE user_id = ?", JSON.stringify(b.stats), Date.now(), user.id);
    return { ok: true };
  });

  app.get<{ Querystring: { q?: string } }>("/api/social/search", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const q = (req.query.q ?? "").trim();
    if (q.length < 2) return { users: [] };
    const term = likeTerm(q);
    const rows = all(
      db,
      `SELECT pr.user_id, pr.username, pr.avatar_media_id, ${PUBLIC_NAME} AS name FROM profiles pr JOIN users u ON u.id = pr.user_id
       WHERE u.removed_at IS NULL AND u.id != ?
         AND (pr.username LIKE ? ESCAPE '\\' OR pr.display_name LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')
       LIMIT 20`,
      user.id,
      term,
      term,
      term,
    );
    return { users: rows.map((r) => ({ ...publicUser(r), followState: followState(db, user.id, r.user_id) })) };
  });

  app.put<{ Params: { username: string } }>("/api/social/follows/:username", mutateLimit, async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const target = activeProfile(db, req.params.username);
    if (target.user_id === user.id) throw new HttpError(400, "No puedes seguirte a ti mismo");
    const existing = followState(db, user.id, target.user_id);
    const status = existing === "none" ? (target.is_private ? "pending" : "accepted") : existing;
    if (existing === "none") {
      tx(db, () => {
        run(db, "INSERT INTO follows (follower_id, followee_id, status, created_at) VALUES (?,?,?,?)", user.id, target.user_id, status, Date.now());
        notify(db, { userId: target.user_id, actorId: user.id, kind: status === "pending" ? "follow_request" : "follow" });
      });
    }
    reply.code(201);
    return { status };
  });

  app.delete<{ Params: { username: string } }>("/api/social/follows/:username", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const target = get(db, "SELECT user_id FROM profiles WHERE username = ?", req.params.username);
    if (!target) throw new HttpError(404, "No encontrado");
    tx(db, () => {
      run(db, "DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", user.id, target.user_id);
      run(db, "DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND kind IN ('follow','follow_request')", target.user_id, user.id);
    });
    reply.code(204);
  });

  /** Quitar a alguien de tus seguidores (o rechazar su solicitud): deja de ver tu perfil privado. */
  app.delete<{ Params: { username: string } }>("/api/social/followers/:username", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const follower = get(db, "SELECT user_id FROM profiles WHERE username = ?", req.params.username);
    if (!follower) throw new HttpError(404, "No encontrado");
    tx(db, () => {
      run(db, "DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", follower.user_id, user.id);
      run(db, "DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND kind IN ('follow','follow_request')", user.id, follower.user_id);
    });
    reply.code(204);
  });

  app.get("/api/social/follows/pending", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const rows = all(
      db,
      `SELECT pr.user_id, pr.username, pr.avatar_media_id, ${PUBLIC_NAME} AS name FROM follows f
       JOIN profiles pr ON pr.user_id = f.follower_id JOIN users u ON u.id = f.follower_id
       WHERE f.followee_id = ? AND f.status = 'pending' AND u.removed_at IS NULL ORDER BY f.created_at`,
      user.id,
    );
    return { requests: rows.map((r) => publicUser(r)) };
  });

  app.put<{ Params: { username: string } }>("/api/social/follows/:username/accept", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const follower = get(db, "SELECT user_id FROM profiles WHERE username = ?", req.params.username);
    if (!follower) throw new HttpError(404, "No encontrado");
    tx(db, () => {
      const r = run(db, "UPDATE follows SET status = 'accepted' WHERE follower_id = ? AND followee_id = ? AND status = 'pending'", follower.user_id, user.id);
      if (Number(r.changes) > 0) {
        run(db, "UPDATE notifications SET kind = 'follow' WHERE user_id = ? AND actor_id = ? AND kind = 'follow_request'", user.id, follower.user_id);
        notify(db, { userId: follower.user_id, actorId: user.id, kind: "follow_accepted" });
      }
    });
    reply.code(204);
  });

  app.delete<{ Params: { username: string } }>("/api/social/follows/:username/decline", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const follower = get(db, "SELECT user_id FROM profiles WHERE username = ?", req.params.username);
    if (!follower) throw new HttpError(404, "No encontrado");
    tx(db, () => {
      run(db, "DELETE FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'pending'", follower.user_id, user.id);
      run(db, "DELETE FROM notifications WHERE user_id = ? AND actor_id = ? AND kind = 'follow_request'", user.id, follower.user_id);
    });
    reply.code(204);
  });

  app.post("/api/social/posts", mutateLimit, async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const b = CreatePostInput.parse(req.body);
    for (const mediaId of b.mediaIds) {
      const owned = get(db, "SELECT 1 AS x FROM media WHERE id = ? AND user_id = ?", mediaId, user.id);
      if (!owned) throw new HttpError(403, "Una de las fotos no es tuya");
    }
    const id = randomUUID();
    const now = Date.now();
    tx(db, () => {
      run(db, "INSERT INTO posts (id, user_id, kind, text, snapshot, created_at) VALUES (?,?,?,?,?,?)", id, user.id, b.kind, b.text, JSON.stringify(b.snapshot), now);
      b.mediaIds.forEach((mediaId, i) => run(db, "INSERT INTO post_media (post_id, media_id, position) VALUES (?,?,?)", id, mediaId, i));
    });
    reply.code(201);
    return { id };
  });

  app.delete<{ Params: { id: string } }>("/api/social/posts/:id", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const post = get(db, "SELECT user_id FROM posts WHERE id = ?", req.params.id);
    if (!post) throw new HttpError(404, "No encontrado");
    if (post.user_id !== user.id) throw new HttpError(403, "Solo quien lo publicó puede borrarlo");
    run(db, "DELETE FROM posts WHERE id = ?", req.params.id);
    reply.code(204);
  });

  app.put<{ Params: { id: string } }>("/api/social/posts/:id/like", mutateLimit, async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const post = get(db, "SELECT p.user_id FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ? AND u.removed_at IS NULL", req.params.id);
    if (!post || !canViewPosts(db, user.id, post.user_id)) throw new HttpError(404, "No encontrado");
    tx(db, () => {
      const r = run(db, "INSERT INTO likes (post_id, user_id, created_at) VALUES (?,?,?) ON CONFLICT (post_id, user_id) DO NOTHING", req.params.id, user.id, Date.now());
      if (Number(r.changes) > 0) notify(db, { userId: post.user_id, actorId: user.id, kind: "like", postId: req.params.id });
    });
    reply.code(204);
  });

  app.delete<{ Params: { id: string } }>("/api/social/posts/:id/like", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    tx(db, () => {
      run(db, "DELETE FROM likes WHERE post_id = ? AND user_id = ?", req.params.id, user.id);
      run(db, "DELETE FROM notifications WHERE actor_id = ? AND kind = 'like' AND post_id = ?", user.id, req.params.id);
    });
    reply.code(204);
  });

  app.get<{ Params: { id: string } }>("/api/social/posts/:id/comments", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const post = get(db, "SELECT user_id FROM posts WHERE id = ?", req.params.id);
    if (!post || !canViewPosts(db, user.id, post.user_id)) throw new HttpError(404, "No encontrado");
    const rows = all(
      db,
      `SELECT c.id, c.text, c.created_at, c.user_id, ${PUBLIC_NAME} AS name, pr.username, pr.avatar_media_id
       FROM comments c JOIN users u ON u.id = c.user_id JOIN profiles pr ON pr.user_id = c.user_id
       WHERE c.post_id = ? ORDER BY c.created_at`,
      req.params.id,
    );
    return { comments: rows.map((r) => ({ id: r.id, text: r.text, createdAt: r.created_at, author: publicUser(r) })) };
  });

  app.post<{ Params: { id: string } }>("/api/social/posts/:id/comments", mutateLimit, async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const b = CreateCommentInput.parse(req.body);
    const post = get(db, "SELECT p.user_id FROM posts p JOIN users u ON u.id = p.user_id WHERE p.id = ? AND u.removed_at IS NULL", req.params.id);
    if (!post || !canViewPosts(db, user.id, post.user_id)) throw new HttpError(404, "No encontrado");
    const id = randomUUID();
    tx(db, () => {
      run(db, "INSERT INTO comments (id, post_id, user_id, text, created_at) VALUES (?,?,?,?,?)", id, req.params.id, user.id, b.text, Date.now());
      notify(db, { userId: post.user_id, actorId: user.id, kind: "comment", postId: req.params.id, commentId: id });
    });
    reply.code(201);
    return { id };
  });

  app.delete<{ Params: { id: string } }>("/api/social/comments/:id", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const comment = get(db, "SELECT c.user_id AS comment_owner, p.user_id AS post_owner FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ?", req.params.id);
    if (!comment) throw new HttpError(404, "No encontrado");
    if (comment.comment_owner !== user.id && comment.post_owner !== user.id) throw new HttpError(403, "No puedes borrar este comentario");
    // El aviso del comentario se va con él (`comment_id` con ON DELETE CASCADE).
    run(db, "DELETE FROM comments WHERE id = ?", req.params.id);
    reply.code(204);
  });

  // ------------------------------------------------------------------ Avisos

  app.get<{ Querystring: { cursor?: string } }>("/api/social/notifications", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const params: SQLInputValue[] = [user.id];
    const clause = cursorClause(req.query.cursor, "n", params);
    const rows = all(
      db,
      `SELECT n.id, n.kind, n.post_id, n.created_at, n.read_at, n.actor_id AS user_id,
              ${PUBLIC_NAME} AS name, pr.username, pr.avatar_media_id,
              p.text AS post_text, p.kind AS post_kind, c.text AS comment_text,
              EXISTS(SELECT 1 FROM follows f WHERE f.follower_id = n.actor_id AND f.followee_id = n.user_id AND f.status = 'pending') AS still_pending
       FROM notifications n
       JOIN users u ON u.id = n.actor_id JOIN profiles pr ON pr.user_id = n.actor_id
       LEFT JOIN posts p ON p.id = n.post_id LEFT JOIN comments c ON c.id = n.comment_id
       WHERE n.user_id = ? AND u.removed_at IS NULL ${clause}
       ORDER BY n.created_at DESC, n.id DESC LIMIT ${NOTIFICATIONS_PAGE_SIZE + 1}`,
      ...params,
    ) as (Record<string, any> & { created_at: number; id: string })[];
    const { items, nextCursor } = page(rows, NOTIFICATIONS_PAGE_SIZE);
    return {
      notifications: items.map((r) => ({
        id: r.id,
        kind: r.kind as NotificationKind,
        createdAt: r.created_at,
        read: r.read_at != null,
        actor: publicUser(r),
        postId: r.post_id ?? undefined,
        postKind: r.post_kind ?? undefined,
        postText: r.post_text ? String(r.post_text).slice(0, 80) : undefined,
        commentText: r.comment_text ? String(r.comment_text).slice(0, 120) : undefined,
        pending: r.kind === "follow_request" ? !!r.still_pending : undefined,
      })),
      nextCursor,
    };
  });

  app.get("/api/social/notifications/unread-count", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const c = get(
      db,
      "SELECT COUNT(*) AS c FROM notifications n JOIN users u ON u.id = n.actor_id WHERE n.user_id = ? AND n.read_at IS NULL AND u.removed_at IS NULL",
      user.id,
    )!.c as number;
    return { count: c };
  });

  app.post("/api/social/notifications/read", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const b = ReadNotificationsInput.parse(req.body ?? {});
    run(db, "UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND created_at <= ?", Date.now(), user.id, b.upTo ?? Date.now());
    return { ok: true };
  });
};
