import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { DB } from "./db";

const NAME = /^cheluisfit-\d{4}-\d{2}-\d{2}\.db$/;

/**
 * Copia consistente de la base de datos (VACUUM INTO) en `dir`, una por día, conservando las
 * últimas `keep`. Se escribe primero en `.tmp` y se renombra al terminar: antes se borraba la
 * copia del día **antes** de hacer la nueva, así que un fallo a mitad dejaba el día sin copia.
 * Cómo restaurar una: ver «Restaurar una copia» en el README.
 */
export function backupDb(db: DB, dir: string, keep = 14, now = new Date()): string {
  mkdirSync(dir, { recursive: true });
  const target = join(dir, `cheluisfit-${now.toISOString().slice(0, 10)}.db`);
  const tmp = `${target}.tmp`;
  if (existsSync(tmp)) rmSync(tmp);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  renameSync(tmp, target);

  const files = readdirSync(dir).filter((f) => NAME.test(f)).sort();
  for (const old of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(dir, old));
  return target;
}
