import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { requireUser } from "../auth";
import { get, run } from "../db";
import { HttpError, perUserKey } from "../http";
import type { Register } from "./ctx";

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
};
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB: de sobra para una foto o un vídeo corto de ejercicio.
/** Tope de lo que puede tener subido cada persona (fotos de ejercicios, perfil y publicaciones). */
const MAX_BYTES_PER_USER = 1024 * 1024 * 1024;

/**
 * ¿El contenido es de verdad del tipo que dice el móvil? El tipo lo declara el cliente; sin mirar
 * los primeros bytes, cualquier cosa renombrada a `.jpg` se guardaba y se servía como imagen.
 */
export function looksLike(mime: string, b: Buffer): boolean {
  if (mime === "image/jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === "image/png") return b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  if (mime === "image/webp") return b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP";
  if (mime === "video/mp4") return b.subarray(4, 8).toString("latin1") === "ftyp";
  return false;
}

/**
 * Fotos y vídeos que el móvil sube (ejercicios propios, progreso). El archivo vive en
 * `cfg.mediaDir` (volumen fuera de la imagen); la BD solo guarda quién lo subió y su tipo.
 * Subir exige sesión; **descargar no** (para que `expo-image`/`expo-video` puedan pedirla
 * directamente por URL, como hacen con las fotos del catálogo): la protección es el id
 * aleatorio de 128 bits en la URL, no la sesión — razonable para fotos de ejercicio entre
 * amigos y familia, no para datos médicos sensibles.
 */
export const registerMedia: Register = (app, { db, cfg }) => {
  const uploadLimit = { config: { rateLimit: { max: 60, timeWindow: "1 hour", keyGenerator: perUserKey } } };

  app.post("/api/media", uploadLimit, async (req, reply) => {
    const user = requireUser(db, req.headers.authorization);
    const file = await req.file({ limits: { fileSize: MAX_BYTES } });
    if (!file) throw new HttpError(400, "Falta el archivo");
    const ext = ALLOWED[file.mimetype];
    if (!ext) throw new HttpError(415, "Solo se aceptan fotos (jpg/png/webp) o vídeo mp4");

    const buffer = await file.toBuffer();
    if (buffer.byteLength > MAX_BYTES) throw new HttpError(413, "El archivo pesa demasiado (máx. 25 MB)");
    if (!looksLike(file.mimetype, buffer)) throw new HttpError(415, "El archivo no es una foto o un vídeo válido");
    const used = (get(db, "SELECT COALESCE(SUM(size), 0) AS n FROM media WHERE user_id = ?", user.id) as { n: number }).n;
    if (used + buffer.byteLength > MAX_BYTES_PER_USER) throw new HttpError(413, "Has llegado al límite de fotos y vídeos guardados (1 GB)");

    const id = randomUUID();
    await writeFile(join(cfg.mediaDir, `${id}.${ext}`), buffer);
    run(
      db,
      "INSERT INTO media (id, user_id, filename, content_type, size, created_at) VALUES (?,?,?,?,?,?)",
      id,
      user.id,
      `${id}.${ext}`,
      file.mimetype,
      buffer.byteLength,
      Date.now(),
    );
    reply.code(201);
    return { id, url: `/api/media/${id}` };
  });

  app.get<{ Params: { id: string } }>("/api/media/:id", async (req, reply) => {
    const row = get(db, "SELECT * FROM media WHERE id = ?", req.params.id);
    if (!row) throw new HttpError(404, "No encontrado");
    const path = join(cfg.mediaDir, row.filename as string);
    if (!existsSync(path)) throw new HttpError(404, "No encontrado");

    const size = statSync(path).size;
    const range = req.headers.range;
    reply.header("Content-Type", row.content_type).header("Accept-Ranges", "bytes").header("Cache-Control", "private, max-age=31536000, immutable");
    const m = range?.match(/^bytes=(\d*)-(\d*)$/);
    if (m) {
      const start = m[1] ? Number(m[1]) : 0;
      const end = m[2] ? Number(m[2]) : size - 1;
      reply.code(206).header("Content-Range", `bytes ${start}-${end}/${size}`).header("Content-Length", end - start + 1);
      return reply.send(createReadStream(path, { start, end }));
    }
    reply.header("Content-Length", size);
    return reply.send(createReadStream(path));
  });
};
