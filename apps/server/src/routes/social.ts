import { randomUUID } from "node:crypto";
import type { SQLInputValue } from "node:sqlite";
import { requireUser } from "../auth";
import { all, get, run, tx, type DB } from "../db";
import { HttpError } from "../http";
import { CreateCommentInput, CreatePostInput, UpdateProfileInput } from "../schemas";
import type { Register } from "./ctx";

const FEED_PAGE_SIZE = 20;

interface ProfileRow {
  user_id: string;
  username: string;
  bio: string;
  avatar_media_id: string | null;
  is_private: number;
}

function avatarUrl(mediaId: string | null): string | undefined {
  return mediaId ? `/api/media/${mediaId}` : undefined;
}

function mediaUrls(db: DB, postId: string): string[] {
  return all(db, "SELECT media_id FROM post_media WHERE post_id = ? ORDER BY position", postId).map((r) => `/api/media/${r.media_id}`);
}

/** Propio, o perfil público, o seguidor aceptado — la única regla de visibilidad de posts. */
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

/** Columnas + joins comunes a cualquier consulta de posts (feed, perfil, post suelto). */
const POST_SELECT = `SELECT p.id, p.user_id, p.kind, p.text, p.snapshot, p.created_at,
         u.name AS author_name, pr.username AS author_username, pr.avatar_media_id,
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
    author: { id: row.user_id, name: row.author_name, username: row.author_username, avatarUrl: avatarUrl(row.avatar_media_id) },
    media: mediaUrls(db, row.id),
    likesCount: row.likes_count,
    likedByMe: !!row.liked_by_me,
    commentsCount: row.comments_count,
  };
}

/**
 * Capa social: perfiles públicos, follows, posts (con snapshot de un entreno real o libres),
 * fotos, comentarios y likes. Los blobs de fitness siguen siendo privados siempre — un post
 * copia un snapshot en el momento de publicar (lo construye el móvil, `domain/socialSnapshot.ts`);
 * esta ruta nunca lee `routes/data.ts` ni el blob de nadie.
 */
export const registerSocial: Register = (app, { db }) => {
  const mutateLimit = { config: { rateLimit: { max: 60, timeWindow: "1 hour" } } };

  app.get<{ Querystring: { cursor?: string } }>("/api/social/feed", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const params: SQLInputValue[] = [user.id, user.id, user.id];
    let cursorClause = "";
    if (req.query.cursor) {
      const [createdAt, id] = req.query.cursor.split(":");
      if (!createdAt || !id) throw new HttpError(400, "Cursor no válido");
      cursorClause = "AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))";
      params.push(Number(createdAt), Number(createdAt), id);
    }
    const rows = all(
      db,
      `${POST_SELECT}
       WHERE (p.user_id = ? OR p.user_id IN (SELECT followee_id FROM follows WHERE follower_id = ? AND status = 'accepted'))
       ${cursorClause}
       ORDER BY p.created_at DESC, p.id DESC
       LIMIT ${FEED_PAGE_SIZE + 1}`,
      ...params,
    );
    const hasMore = rows.length > FEED_PAGE_SIZE;
    const page = rows.slice(0, FEED_PAGE_SIZE);
    const last = page[page.length - 1];
    return {
      posts: page.map((r) => postDTO(db, r)),
      nextCursor: hasMore && last ? `${last.created_at}:${last.id}` : null,
    };
  });

  app.get<{ Params: { id: string } }>("/api/social/posts/:id", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const row = get(db, `${POST_SELECT} WHERE p.id = ?`, user.id, req.params.id);
    if (!row || !canViewPosts(db, user.id, row.user_id)) throw new HttpError(404, "No encontrado");
    return postDTO(db, row);
  });

  app.get<{ Params: { username: string } }>("/api/social/users/:username", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const profile = get(db, "SELECT * FROM profiles WHERE username = ?", req.params.username) as ProfileRow | undefined;
    if (!profile) throw new HttpError(404, "No encontrado");
    const owner = get(db, "SELECT name FROM users WHERE id = ? AND removed_at IS NULL", profile.user_id);
    if (!owner) throw new HttpError(404, "No encontrado");
    const canView = canViewPosts(db, user.id, profile.user_id);
    const posts = canView
      ? all(db, `${POST_SELECT} WHERE p.user_id = ? ORDER BY p.created_at DESC, p.id DESC LIMIT 50`, user.id, profile.user_id).map((r) => postDTO(db, r))
      : [];
    return {
      profile: {
        id: profile.user_id,
        username: profile.username,
        name: owner.name,
        bio: profile.bio,
        avatarUrl: avatarUrl(profile.avatar_media_id),
        isPrivate: !!profile.is_private,
      },
      followState: followState(db, user.id, profile.user_id),
      counts: {
        posts: (get(db, "SELECT COUNT(*) AS c FROM posts WHERE user_id = ?", profile.user_id)!.c as number),
        followers: (get(db, "SELECT COUNT(*) AS c FROM follows WHERE followee_id = ? AND status = 'accepted'", profile.user_id)!.c as number),
        following: (get(db, "SELECT COUNT(*) AS c FROM follows WHERE follower_id = ? AND status = 'accepted'", profile.user_id)!.c as number),
      },
      posts: canView ? posts : null,
    };
  });

  /** El propio username — para que la app sepa a qué perfil navegar («Mi perfil social»). */
  app.get("/api/social/profile", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const p = requireProfile(db, user.id);
    return { username: p.username, bio: p.bio, avatarUrl: avatarUrl(p.avatar_media_id), isPrivate: !!p.is_private };
  });

  app.put("/api/social/profile", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const b = UpdateProfileInput.parse(req.body);
    requireProfile(db, user.id);
    if (b.avatarMediaId) {
      const owned = get(db, "SELECT 1 AS x FROM media WHERE id = ? AND user_id = ?", b.avatarMediaId, user.id);
      if (!owned) throw new HttpError(403, "Esa foto no es tuya");
    }
    if (b.username) {
      const clash = get(db, "SELECT 1 AS x FROM profiles WHERE username = ? AND user_id != ?", b.username, user.id);
      if (clash) throw new HttpError(409, "Ese nombre de usuario ya está en uso");
    }
    const current = requireProfile(db, user.id);
    run(
      db,
      "UPDATE profiles SET bio = ?, avatar_media_id = ?, is_private = ?, username = ? WHERE user_id = ?",
      b.bio ?? current.bio,
      b.avatarMediaId === undefined ? current.avatar_media_id : b.avatarMediaId,
      b.isPrivate === undefined ? current.is_private : b.isPrivate ? 1 : 0,
      b.username ?? current.username,
      user.id,
    );
    return { ok: true };
  });

  app.get<{ Querystring: { q?: string } }>("/api/social/search", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const q = (req.query.q ?? "").trim();
    if (q.length < 2) return { users: [] };
    const rows = all(
      db,
      `SELECT pr.username, pr.avatar_media_id, u.name FROM profiles pr JOIN users u ON u.id = pr.user_id
       WHERE u.removed_at IS NULL AND u.id != ? AND (pr.username LIKE ? OR u.name LIKE ?) LIMIT 20`,
      user.id,
      `%${q}%`,
      `%${q}%`,
    );
    return { users: rows.map((r) => ({ username: r.username, name: r.name, avatarUrl: avatarUrl(r.avatar_media_id) })) };
  });

  app.put<{ Params: { username: string } }>("/api/social/follows/:username", mutateLimit, async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const target = get(db, "SELECT * FROM profiles WHERE username = ?", req.params.username) as ProfileRow | undefined;
    if (!target) throw new HttpError(404, "No encontrado");
    if (target.user_id === user.id) throw new HttpError(400, "No puedes seguirte a ti mismo");
    const status = target.is_private ? "pending" : "accepted";
    run(
      db,
      "INSERT INTO follows (follower_id, followee_id, status, created_at) VALUES (?,?,?,?) ON CONFLICT (follower_id, followee_id) DO NOTHING",
      user.id,
      target.user_id,
      status,
      Date.now(),
    );
    reply.code(201);
    return { status };
  });

  app.delete<{ Params: { username: string } }>("/api/social/follows/:username", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const target = get(db, "SELECT user_id FROM profiles WHERE username = ?", req.params.username);
    if (!target) throw new HttpError(404, "No encontrado");
    run(db, "DELETE FROM follows WHERE follower_id = ? AND followee_id = ?", user.id, target.user_id);
    reply.code(204);
  });

  app.get("/api/social/follows/pending", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const rows = all(
      db,
      `SELECT pr.username, pr.avatar_media_id, u.name FROM follows f
       JOIN profiles pr ON pr.user_id = f.follower_id JOIN users u ON u.id = f.follower_id
       WHERE f.followee_id = ? AND f.status = 'pending' ORDER BY f.created_at`,
      user.id,
    );
    return { requests: rows.map((r) => ({ username: r.username, name: r.name, avatarUrl: avatarUrl(r.avatar_media_id) })) };
  });

  app.put<{ Params: { username: string } }>("/api/social/follows/:username/accept", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const follower = get(db, "SELECT user_id FROM profiles WHERE username = ?", req.params.username);
    if (!follower) throw new HttpError(404, "No encontrado");
    run(db, "UPDATE follows SET status = 'accepted' WHERE follower_id = ? AND followee_id = ? AND status = 'pending'", follower.user_id, user.id);
    reply.code(204);
  });

  app.delete<{ Params: { username: string } }>("/api/social/follows/:username/decline", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const follower = get(db, "SELECT user_id FROM profiles WHERE username = ?", req.params.username);
    if (!follower) throw new HttpError(404, "No encontrado");
    run(db, "DELETE FROM follows WHERE follower_id = ? AND followee_id = ? AND status = 'pending'", follower.user_id, user.id);
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
    const post = get(db, "SELECT user_id FROM posts WHERE id = ?", req.params.id);
    if (!post || !canViewPosts(db, user.id, post.user_id)) throw new HttpError(404, "No encontrado");
    run(db, "INSERT INTO likes (post_id, user_id, created_at) VALUES (?,?,?) ON CONFLICT (post_id, user_id) DO NOTHING", req.params.id, user.id, Date.now());
    reply.code(204);
  });

  app.delete<{ Params: { id: string } }>("/api/social/posts/:id/like", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    run(db, "DELETE FROM likes WHERE post_id = ? AND user_id = ?", req.params.id, user.id);
    reply.code(204);
  });

  app.get<{ Params: { id: string } }>("/api/social/posts/:id/comments", async (req) => {
    const user = requireUser(db, req.headers.authorization);
    const post = get(db, "SELECT user_id FROM posts WHERE id = ?", req.params.id);
    if (!post || !canViewPosts(db, user.id, post.user_id)) throw new HttpError(404, "No encontrado");
    const rows = all(
      db,
      `SELECT c.id, c.text, c.created_at, c.user_id, u.name AS author_name, pr.username AS author_username, pr.avatar_media_id
       FROM comments c JOIN users u ON u.id = c.user_id JOIN profiles pr ON pr.user_id = c.user_id
       WHERE c.post_id = ? ORDER BY c.created_at`,
      req.params.id,
    );
    return {
      comments: rows.map((r) => ({
        id: r.id,
        text: r.text,
        createdAt: r.created_at,
        author: { id: r.user_id, name: r.author_name, username: r.author_username, avatarUrl: avatarUrl(r.avatar_media_id) },
      })),
    };
  });

  app.post<{ Params: { id: string } }>("/api/social/posts/:id/comments", mutateLimit, async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const b = CreateCommentInput.parse(req.body);
    const post = get(db, "SELECT user_id FROM posts WHERE id = ?", req.params.id);
    if (!post || !canViewPosts(db, user.id, post.user_id)) throw new HttpError(404, "No encontrado");
    const id = randomUUID();
    run(db, "INSERT INTO comments (id, post_id, user_id, text, created_at) VALUES (?,?,?,?,?)", id, req.params.id, user.id, b.text, Date.now());
    reply.code(201);
    return { id };
  });

  app.delete<{ Params: { id: string } }>("/api/social/comments/:id", async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const comment = get(db, "SELECT c.user_id AS comment_owner, p.user_id AS post_owner FROM comments c JOIN posts p ON p.id = c.post_id WHERE c.id = ?", req.params.id);
    if (!comment) throw new HttpError(404, "No encontrado");
    if (comment.comment_owner !== user.id && comment.post_owner !== user.id) throw new HttpError(403, "No puedes borrar este comentario");
    run(db, "DELETE FROM comments WHERE id = ?", req.params.id);
    reply.code(204);
  });
};
