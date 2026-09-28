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
import { existsSync } from "node:fs";
import { resolve } from "node:path";

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

console.log(`→ Construyendo la imagen cheluisfit:${version} (linux/amd64)…`);
sh("docker", ["buildx", "build", "--platform", "linux/amd64", "--build-arg", `APP_VERSION=${version}`, "-t", `cheluisfit:${version}`, "--load", "."]);

console.log("→ Subiendo la imagen al VPS…");
execFileSync("sh", ["-c", `docker save cheluisfit:${version} | gzip | ssh ${HOST} 'docker load'`], { stdio: "inherit" });

console.log("→ Preparando ~/servicios/cheluisfit en el VPS (primera vez: compose + .env.example)…");
sh("ssh", [HOST, `mkdir -p ${REMOTE_DIR}/data/downloads`]);
sh("scp", ["deploy/docker-compose.yml", `${HOST}:${REMOTE_DIR}/docker-compose.yml`]);
sh("scp", ["deploy/.env.example", `${HOST}:${REMOTE_DIR}/.env.example`]);
// No se sobrescribe un .env que ya exista (tiene el SETUP_CODE real).
sh("ssh", [HOST, `test -f ${REMOTE_DIR}/.env || cp ${REMOTE_DIR}/.env.example ${REMOTE_DIR}/.env`]);

const apk = resolve(root, "apps/mobile/dist/cheluisfit.apk");
const versionJson = resolve(root, "apps/mobile/dist/version.json");
if (existsSync(apk) && existsSync(versionJson)) {
  console.log("→ Copiando el APK y version.json al volumen de datos…");
  sh("scp", [apk, versionJson, `${HOST}:${REMOTE_DIR}/data/downloads/`]);
} else {
  console.log("→ Sin APK nuevo que copiar (se mantiene el que ya hubiera en el volumen).");
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

console.log("→ Verificando…");
sh("ssh", [HOST, `sleep 3 && docker ps --filter name=cheluisfit --format 'table {{.Names}}\\t{{.Status}}' && docker logs cheluisfit --tail 20`]);

console.log(`\n✓ Desplegado cheluisfit:${version}. Recuerda: la ruta pública en Cloudflare Tunnel (cheluisfit.redgarverde.com → http://cheluisfit:3000) se añade a mano en el panel — no se puede hacer por SSH/CLI.`);
console.log(`\n→ Descarga del APK (usa SIEMPRE esta URL con «?v=», no /app.apk a secas — Cloudflare cachea .apk ~4h en su borde ignorando la cabecera Cache-Control del origen, y la query string evita que sirva una copia vieja):`);
console.log(`  https://cheluisfit.redgarverde.com/app.apk?v=${version}`);
