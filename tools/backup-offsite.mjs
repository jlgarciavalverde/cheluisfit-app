// Copias cruzadas entre el Mac y el VPS, para que ninguna pérdida de una sola máquina sea
// irreparable:
//   VPS → Mac: las copias de la base de datos (`data/backups/*.db`), que en el VPS viven en el
//              mismo disco que la base de datos real → `~/Copias/cheluisfit/db/`; y las fotos y
//              vídeos subidos (`data/media/`) → `~/Copias/cheluisfit/media/`.
//   Mac → VPS: el código entero con su historial (`git bundle`, se restaura con
//              `git clone repo-<fecha>.bundle`) y la clave de firma del APK (`cheluisfit.jks`, ya
//              protegida por su contraseña; el `.properties` con la contraseña NO sale del Mac:
//              guárdala en tu gestor de contraseñas) → `~/backups/cheluisfit/` del VPS.
//
//   node tools/backup-offsite.mjs      (lo llama también `tools/deploy.mjs` al terminar)
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const HOST = "joseluis@192.168.18.7";
const REMOTE = "~/backups/cheluisfit";
const KEEP_BUNDLES = 5;
const root = resolve(import.meta.dirname, "..");
const stamp = new Date().toISOString().slice(0, 10);
const run = (cmd, args) => execFileSync(cmd, args, { cwd: root, stdio: ["ignore", "pipe", "inherit"], encoding: "utf8" });

// 1. VPS → Mac: copias de la base de datos (solo las que falten; son pequeñas).
const localDb = join(homedir(), "Copias", "cheluisfit", "db");
mkdirSync(localDb, { recursive: true });
const remoteFiles = run("ssh", [HOST, "ls ~/servicios/cheluisfit/data/backups/ | grep '\\.db$' || true"]).split("\n").filter(Boolean);
const have = new Set(readdirSync(localDb));
const missing = remoteFiles.filter((f) => !have.has(f) || f.startsWith(`cheluisfit-${stamp}`));
for (const f of missing) run("scp", ["-q", `${HOST}:servicios/cheluisfit/data/backups/${f}`, join(localDb, f)]);
console.log(`→ Base de datos: ${missing.length} copia(s) nuevas en ${localDb} (${remoteFiles.length} en el VPS)`);

// 1b. VPS → Mac: fotos y vídeos subidos (no están en la base de datos ni en sus copias).
const localMedia = join(homedir(), "Copias", "cheluisfit", "media");
mkdirSync(localMedia, { recursive: true });
run("rsync", ["-a", `${HOST}:servicios/cheluisfit/data/media/`, `${localMedia}/`]);
console.log(`→ Fotos y vídeos: sincronizados en ${localMedia}`);

// 2. Mac → VPS: código con todo su historial.
run("ssh", [HOST, `mkdir -p ${REMOTE}/firma && chmod 700 ${REMOTE} ${REMOTE}/firma`]);
const bundle = join(root, `.repo-${stamp}.bundle`);
run("git", ["bundle", "create", bundle, "--all"]);
run("scp", ["-q", bundle, `${HOST}:${REMOTE.replace("~/", "")}/repo-${stamp}.bundle`]);
rmSync(bundle);
run("ssh", [HOST, `cd ${REMOTE} && ls -1 repo-*.bundle | sort | head -n -${KEEP_BUNDLES} | xargs -r rm --`]);
console.log(`→ Código: repo-${stamp}.bundle en el VPS (se guardan las ${KEEP_BUNDLES} últimas)`);

// 3. Mac → VPS: clave de firma (sin su contraseña).
const jks = join(homedir(), ".android-keystores", "cheluisfit.jks");
if (existsSync(jks)) {
  run("scp", ["-q", "-p", jks, `${HOST}:${REMOTE.replace("~/", "")}/firma/cheluisfit.jks`]);
  run("ssh", [HOST, `chmod 600 ${REMOTE}/firma/cheluisfit.jks`]);
  console.log("→ Clave de firma: copiada al VPS (la contraseña sigue solo en el Mac: guárdala también en tu gestor)");
} else {
  console.warn(`⚠ No existe ${jks}: no se ha copiado la clave de firma`);
}
chmodSync(localDb, 0o700);
console.log("✓ Copias cruzadas al día");
