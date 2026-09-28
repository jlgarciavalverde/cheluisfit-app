// Compila, firma y empaqueta el APK de CheluisFIT.
//
//   node tools/build-apk.mjs [versión]   (p. ej. 0.2.0; por defecto reusa la de app.json)
//
// Requisitos: JDK 21 + SDK de Android (build-tools 35.0.0) y el keystore de
// ~/.android-keystores/cheluisfit.{jks,properties} (ver AGENTS.md → «Empaquetado Android» para
// cómo generarlo si no existe). `expo prebuild` regenera `android/` en cada build (Continuous
// Native Generation): la firma de producción se inyecta vía `plugins/withReleaseSigning.js`
// leyendo variables de entorno — nunca se edita `android/` a mano ni se guarda la clave en el
// repo. Mismo patrón que `tools/twa/build.mjs` de Compra en Familia, adaptado a Expo/Gradle.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const appJsonPath = join(root, "app.json");
const appJson = JSON.parse(readFileSync(appJsonPath, "utf8"));

const requested = process.argv[2];
const version = requested ?? appJson.expo.version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Versión inválida «${version}»: usa el formato X.Y.Z`);
const versionCode = version.split(".").reduce((n, p) => n * 100 + Number(p), 0); // 1.2.3 -> 10203

if (appJson.expo.version !== version || appJson.expo.android.versionCode !== versionCode) {
  appJson.expo.version = version;
  appJson.expo.android.versionCode = versionCode;
  writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
  console.log(`→ app.json actualizado: versión ${version}, versionCode ${versionCode}`);
}

const JAVA_HOME = process.env.JAVA_HOME ?? "/opt/homebrew/opt/openjdk@21";
const ANDROID_HOME = process.env.ANDROID_HOME ?? "/opt/homebrew/share/android-commandlinetools";
const BUILD_TOOLS = join(ANDROID_HOME, "build-tools", "35.0.0");
if (!existsSync(JAVA_HOME)) throw new Error(`No existe JAVA_HOME (${JAVA_HOME}). Instala JDK 21.`);
if (!existsSync(ANDROID_HOME)) throw new Error(`No existe ANDROID_HOME (${ANDROID_HOME}). Instala el SDK de Android.`);

const propsFile = join(homedir(), ".android-keystores", "cheluisfit.properties");
if (!existsSync(propsFile)) {
  throw new Error(
    `No existe ${propsFile}. Genera primero el keystore de firma (ver AGENTS.md → «Empaquetado Android»).`,
  );
}
const props = Object.fromEntries(
  readFileSync(propsFile, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => l.split(/=(.*)/s).slice(0, 2)),
);
if (!existsSync(props.storeFile)) throw new Error(`No existe el keystore ${props.storeFile}`);

console.log("→ Regenerando el proyecto Android (expo prebuild --clean)…");
execFileSync("npx", ["expo", "prebuild", "--platform", "android", "--clean"], {
  cwd: root,
  stdio: "inherit",
  // CHELUISFIT_RELEASE_BUILD activa `plugins/withReleaseArchitecture.js` (solo arm64-v8a): no
  // se pone en `expo prebuild`/`expo run:android` normales de desarrollo.
  env: { ...process.env, JAVA_HOME, ANDROID_HOME, CHELUISFIT_RELEASE_BUILD: "1" },
});

const env = {
  ...process.env,
  JAVA_HOME,
  ANDROID_HOME,
  ANDROID_SDK_ROOT: ANDROID_HOME,
  PATH: `${JAVA_HOME}/bin:${process.env.PATH}`,
  CHELUISFIT_KEYSTORE_PATH: props.storeFile,
  CHELUISFIT_KEYSTORE_PASSWORD: props.storePassword,
  CHELUISFIT_KEY_ALIAS: props.alias,
  CHELUISFIT_KEY_PASSWORD: props.keyPassword,
};

console.log("→ Compilando y firmando con Gradle (la primera vez descarga Gradle y las librerías)…");
const androidDir = join(root, "android");
execFileSync("./gradlew", ["--no-daemon", "assembleRelease"], { cwd: androidDir, env, stdio: "inherit" });

const built = join(androidDir, "app/build/outputs/apk/release/app-release.apk");
if (!existsSync(built)) throw new Error(`Gradle no generó ${built}`);

console.log("→ Verificando la firma…");
execFileSync(join(BUILD_TOOLS, "apksigner"), ["verify", "--verbose", "--print-certs", built], { stdio: "inherit", env });

const out = resolve(root, "dist");
mkdirSync(out, { recursive: true });
const apk = join(out, "cheluisfit.apk");
rmSync(apk, { force: true });
copyFileSync(built, apk);

const bytes = readFileSync(apk);
const info = {
  version,
  versionCode,
  packageId: appJson.expo.android.package,
  size: statSync(apk).size,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  builtAt: new Date().toISOString(),
};
writeFileSync(join(out, "version.json"), `${JSON.stringify(info, null, 2)}\n`);
console.log(`\n✓ ${apk}\n${JSON.stringify(info, null, 2)}`);
