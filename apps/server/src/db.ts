import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";

export type DB = DatabaseSync;

/** Slug corto para `username`: minúsculas, sin acentos, solo `[a-z0-9-]`. */
export function slugify(name: string): string {
  const base = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "persona";
}

/**
 * Crea la fila de `profiles` de un usuario nuevo, con un `username` derivado de su nombre (y
 * sufijo numérico si choca). La usan tanto el backfill de la migración (usuarios ya existentes)
 * como el registro de cuentas nuevas (`routes/account.ts`) — mismo criterio en los dos sitios.
 */
export function insertProfileFor(db: DB, userId: string, name: string): void {
  const base = slugify(name);
  let username = base;
  let n = 2;
  while (get(db, "SELECT 1 AS x FROM profiles WHERE username = ?", username)) username = `${base}-${n++}`;
  run(db, "INSERT INTO profiles (user_id, username, created_at) VALUES (?,?,?)", userId, username, Date.now());
}

/** Cada paso es SQL puro, o una función para lógica que SQL no puede expresar (backfills con
 *  colisiones, etc.) — ambos corren dentro de la misma transacción BEGIN/COMMIT de su paso. */
type Migration = string | ((db: DB) => void);

const MIGRATIONS: Migration[] = [
  `
  CREATE TABLE households (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE TABLE users (
    id TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id),
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin','member')),
    created_at INTEGER NOT NULL,
    removed_at INTEGER
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    user_agent TEXT
  );
  CREATE TABLE invites (
    code TEXT PRIMARY KEY,
    household_id TEXT NOT NULL REFERENCES households(id),
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used_by TEXT REFERENCES users(id),
    used_at INTEGER
  );
  -- Cada dispositivo/tienda local (nutrición, running, fuerza, entreno activo) sincroniza su
  -- blob de AsyncStorage entero: mismo dato que ya persiste el móvil, ahora también en el
  -- servidor. Un usuario ve solo sus propias claves (los datos de fitness son personales, no
  -- compartidos por hogar — a diferencia de la lista de la compra).
  CREATE TABLE blobs (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, key)
  );
  -- Fotos y vídeos (ejercicios propios, progreso). El archivo vive en el volumen; aquí solo los
  -- metadatos para servirlo con el tipo correcto y comprobar que pertenece a quien lo pide.
  CREATE TABLE media (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  `,
  // Social: perfiles públicos, follows, posts (con snapshot de un entreno real o libres),
  // fotos, comentarios y likes. Los blobs de fitness (arriba) siguen siendo privados siempre —
  // un post copia un snapshot en el momento de publicar, nunca lee el blob de nadie.
  `
  CREATE TABLE profiles (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE,
    bio TEXT NOT NULL DEFAULT '',
    avatar_media_id TEXT REFERENCES media(id),
    is_private INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE follows (
    follower_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending','accepted')),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (follower_id, followee_id)
  );
  CREATE TABLE posts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('run','strength','free')),
    text TEXT NOT NULL DEFAULT '',
    snapshot TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE post_media (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    media_id TEXT NOT NULL REFERENCES media(id) ON DELETE CASCADE,
    position INTEGER NOT NULL,
    PRIMARY KEY (post_id, media_id)
  );
  CREATE TABLE likes (
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (post_id, user_id)
  );
  CREATE TABLE comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX idx_posts_user_created ON posts(user_id, created_at DESC);
  CREATE INDEX idx_follows_followee ON follows(followee_id, status);
  CREATE INDEX idx_comments_post ON comments(post_id, created_at);
  `,
  // Backfill: cada usuario ya existente (incluida la cuenta real en producción) necesita fila en
  // `profiles` — el username se deriva del nombre, con sufijo numérico si choca. SQL puro no
  // puede hacer esto (necesita reintentar por fila), de ahí el paso en JS.
  (db: DB) => {
    const users = db.prepare("SELECT id, name FROM users WHERE id NOT IN (SELECT user_id FROM profiles)").all() as { id: string; name: string }[];
    const taken = new Set((db.prepare("SELECT username FROM profiles").all() as { username: string }[]).map((r) => r.username));
    const now = Date.now();
    for (const u of users) {
      const base = slugify(u.name);
      let username = base;
      let n = 2;
      while (taken.has(username)) username = `${base}-${n++}`;
      taken.add(username);
      db.prepare("INSERT INTO profiles (user_id, username, created_at) VALUES (?,?,?)").run(u.id, username, now);
    }
  },
  // Strava (recorrido GPS de las carreras, ver `routes/strava.ts`). `strava_oauth_states` es de
  // un solo uso y vida corta (~10 min, purgada en el propio callback) — igual de sensible que
  // `sessions`/sin cifrar aparte: la base de datos ya es el límite de confianza del proyecto.
  `
  CREATE TABLE strava_tokens (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    athlete_id INTEGER NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE strava_oauth_states (
    state TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );
  `,
];

function migrate(db: DB) {
  const current = (db.prepare("PRAGMA user_version").get() as { user_version: number }).user_version;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.exec("BEGIN");
    try {
      const step = MIGRATIONS[v]!;
      if (typeof step === "string") db.exec(step);
      else step(db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

export function openDb(path: string): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

/** Transacción síncrona: no hacer `await` dentro de `fn`. */
export function tx<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export type Row = Record<string, any>;
export const get = (db: DB, sql: string, ...params: SQLInputValue[]) => db.prepare(sql).get(...params) as Row | undefined;
export const all = (db: DB, sql: string, ...params: SQLInputValue[]) => db.prepare(sql).all(...params) as Row[];
export const run = (db: DB, sql: string, ...params: SQLInputValue[]) => db.prepare(sql).run(...params);
