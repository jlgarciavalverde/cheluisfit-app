// Despliega CheluisFIT al VPS casero: construye la imagen (amd64, el VPS es x86_64; el Mac es
// arm64 → hace falta `buildx --platform linux/amd64`), la sube por SSH, copia el APK/version.json
// al volumen de datos y reinicia el contenedor. Mismo patrón que compra-en-familia.
//
//   node tools/deploy.mjs <versión>   (p. ej. node tools/deploy.mjs 0.1.0)
//
// Requisito: la app web ya exportada (`apps/mobile/dist/`, `pnpm e2e` o `expo export --platform
// web` la genera) y, si se quiere ofrecer descarga directa, el APK ya construido
// (`apps/mobile/dist/cheluisfit.apk` + `version.json`, ver `apps/mobile/tools/build-apk.mjs`).
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const HOST = "joseluis@192.168.18.7";
const REMOTE_DIR = "~/servicios/cheluisfit";
const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error("Uso: node tools/deploy.mjs <versión X.Y.Z>");

const root = resolve(import.meta.dirname, "..");
const webExport = resolve(root, "apps/mobile/dist/index.html");
if (!existsSync(webExport)) {
  throw new Error(`No existe ${webExport}. Exporta la web primero: cd apps/mobile && npx expo export --platform web`);
}

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: "inherit", cwd: root, ...opts });
const out = (cmd, args) => execFileSync(cmd, args, { cwd: root, encoding: "utf8" }).trim();

// El export web tiene que ser posterior al último cambio del código de la app: si no, se
// desplegaba en silencio una web vieja junto a un servidor nuevo.
const newest = (dir) =>
  readdirSync(dir, { withFileTypes: true }).reduce((m, e) => {
    const p = join(dir, e.name);
    return Math.max(m, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }, 0);
if (statSync(webExport).mtimeMs < newest(resolve(root, "apps/mobile/src"))) {
  throw new Error("El export web es anterior al último cambio en apps/mobile/src. Vuelve a exportar: cd apps/mobile && npx expo export --platform web (y después, si toca, build-apk).");
}

if (!process.argv.includes("--skip-tests")) {
  console.log("→ Tests (typecheck + vitest de la app y del servidor)… (--skip-tests para saltarlos)");
  sh("pnpm", ["-r", "typecheck"]);
  sh("pnpm", ["-r", "test"]);
}

console.log(`→ Construyendo la imagen cheluisfit:${version} (linux/amd64)…`);
sh("docker", ["buildx", "build", "--platform", "linux/amd64", "--build-arg", `APP_VERSION=${version}`, "-t", `cheluisfit:${version}`, "--load", "."]);

console.log("→ Subiendo la imagen al VPS…");
execFileSync("sh", ["-c", `docker save cheluisfit:${version} | gzip | ssh ${HOST} 'docker load'`], { stdio: "inherit" });

// La versión en marcha se lee ANTES de copiar `deploy/docker-compose.yml` (que es una plantilla con
// una imagen vieja): si no, la «versión anterior» para volver atrás sería la de la plantilla.
const previous = out("ssh", [HOST, `grep -o 'image: cheluisfit:[^ ]*' ${REMOTE_DIR}/docker-compose.yml 2>/dev/null | cut -d: -f3 || true`]);
console.log("→ Preparando ~/servicios/cheluisfit en el VPS (primera vez: compose + .env.example)…");
sh("ssh", [HOST, `mkdir -p ${REMOTE_DIR}/data/downloads`]);
sh("scp", ["deploy/docker-compose.yml", `${HOST}:${REMOTE_DIR}/docker-compose.yml`]);
sh("scp", ["deploy/.env.example", `${HOST}:${REMOTE_DIR}/.env.example`]);
// No se sobrescribe un .env que ya exista (tiene el SETUP_CODE real).
sh("ssh", [HOST, `test -f ${REMOTE_DIR}/.env || cp ${REMOTE_DIR}/.env.example ${REMOTE_DIR}/.env`]);

// Copia de la base de datos justo antes de reiniciar (las migraciones corren al arrancar la versión
// nueva y la copia automática puede tener horas). La hace el propio contenedor, con `node:sqlite`.
console.log(`→ Copia de la base de datos antes de actualizar (versión actual: ${previous || "?"})…`);
try {
  sh("ssh", [
    HOST,
    // Sin comillas dobles dentro del -e (irían dentro de las del shell remoto): la comilla simple
    // que exige VACUUM INTO se construye con String.fromCharCode(39).
    `docker exec cheluisfit node --disable-warning=ExperimentalWarning -e "const {DatabaseSync}=require('node:sqlite');const q=String.fromCharCode(39);new DatabaseSync('/app/data/cheluisfit.db').exec('VACUUM INTO '+q+'/app/data/backups/pre-${version}-'+Date.now()+'.db'+q)"`,
  ]);
} catch {
  console.warn("  ⚠ No se pudo hacer la copia (¿el contenedor no estaba en marcha?). Sigue con la copia diaria automática.");
}

console.log(`→ Apuntando el compose a la versión ${version} y reiniciando…`);
// `APP_VERSION` también va en el `.env` (leído por `env_file:` en docker-compose.yml, que
// gana a la variable ya horneada en la imagen vía `ARG`/`ENV` del Dockerfile) — sin este `sed`,
// `.env` se queda con la versión de la primera vez que se creó y `/health` informa mal desde
// entonces, aunque la imagen y el APK ya sean los nuevos (nos pasó: costó un `ssh` a mano
// encontrarlo). Solo se toca esa línea; el resto de `.env` (el `SETUP_CODE` real) no se reescribe.
sh("ssh", [
  HOST,
  `cd ${REMOTE_DIR} && sed -i "s|image: cheluisfit:.*|image: cheluisfit:${version}|" docker-compose.yml && sed -i "s|^APP_VERSION=.*|APP_VERSION=${version}|" .env && docker compose up -d`,
]);

// Espera a que `/health` (dentro del contenedor) responda con la versión nueva. Si no llega en
// ~60 s, vuelve sola a la imagen anterior (sigue cargada en el VPS) y termina con error.
console.log("→ Verificando /health…");
let healthy = false;
for (let i = 0; i < 20 && !healthy; i++) {
  try {
    const body = out("ssh", [HOST, `sleep 3; docker exec cheluisfit node -e "fetch('http://127.0.0.1:3000/health').then(r=>r.text()).then(t=>console.log(t))"`]);
    healthy = JSON.parse(body).version === version;
  } catch {
    // aún arrancando
  }
}
if (!healthy) {
  sh("ssh", [HOST, `docker logs cheluisfit --tail 40`]);
  if (previous && previous !== version) {
    console.error(`✗ La ${version} no responde bien: volviendo a la ${previous}…`);
    sh("ssh", [HOST, `cd ${REMOTE_DIR} && sed -i "s|image: cheluisfit:.*|image: cheluisfit:${previous}|" docker-compose.yml && sed -i "s|^APP_VERSION=.*|APP_VERSION=${previous}|" .env && docker compose up -d`]);
  }
  throw new Error(`Despliegue de ${version} fallido${previous ? ` (vuelto a ${previous})` : ""}.`);
}
sh("ssh", [HOST, `docker ps --filter name=cheluisfit --format 'table {{.Names}}\\t{{.Status}}'`]);

// El APK solo se publica con el servidor nuevo ya sano (si hubo vuelta atrás, se queda el anterior).
const apk = resolve(root, "apps/mobile/dist/cheluisfit.apk");
const versionJson = resolve(root, "apps/mobile/dist/version.json");
if (existsSync(apk) && existsSync(versionJson)) {
  console.log("→ Copiando el APK y version.json al volumen de datos…");
  // A un nombre temporal y luego `mv` (atómico): quien estuviera descargando la versión anterior
  // no recibe un archivo a medio sobrescribir.
  sh("scp", [apk, `${HOST}:${REMOTE_DIR}/data/downloads/cheluisfit.apk.tmp`]);
  sh("scp", [versionJson, `${HOST}:${REMOTE_DIR}/data/downloads/version.json.tmp`]);
  sh("ssh", [HOST, `cd ${REMOTE_DIR}/data/downloads && mv cheluisfit.apk.tmp cheluisfit.apk && mv version.json.tmp version.json`]);
} else {
  console.log("→ Sin APK nuevo que copiar (se mantiene el que ya hubiera en el volumen).");
}


console.log(`\n✓ Desplegado cheluisfit:${version}. Recuerda: la ruta pública en Cloudflare Tunnel (cheluisfit.redgarverde.com → http://cheluisfit:3000) se añade a mano en el panel — no se puede hacer por SSH/CLI.`);
console.log(`\n→ Descarga del APK (usa SIEMPRE esta URL con «?v=», no /app.apk a secas — Cloudflare cachea .apk ~4h en su borde ignorando la cabecera Cache-Control del origen, y la query string evita que sirva una copia vieja):`);
console.log(`  https://cheluisfit.redgarverde.com/app.apk?v=${version}`);
