// Construye `src/data/catalogGen.json`: el catálogo grande de ejercicios a partir de cuatro
// fuentes abiertas, normalizadas al dominio de la app (`domain/strength.ts`). El catálogo
// «semilla» de 75 ejercicios (`exerciseCatalog.ts`) NO se toca: se fusiona en tiempo de
// ejecución y gana cualquier colisión (ver `exerciseCatalog.ts`).
//
// Fuentes (prioridad de mayor a menor — en colisión gana la más alta y la otra aporta lo que
// le falte: fotos, instrucciones en español, aliases):
//   1. RepDB free tier   — 601 ej, nombres+instrucciones ES/EN/DE, ilustraciones WebP.
//                           Licencia: uso en app gratis con atribución visible (repdb.co).
//   2. hasaneyldrm       — 1.324 ej (datos MIT), instrucciones en 10 idiomas (incl. ES).
//                           Nombres solo EN → se traducen con Gemini (caché en repo).
//                           Sin multimedia reutilizable (© Gym Visual).
//   3. wger              — 910 ej (CC-BY-SA), ~70% con nombre ES, fotos en ~30%.
//   4. free-exercise-db  — 876 ej (dominio público, la fuente original del catálogo semilla),
//                           fotos para todos, nombres EN → también se traducen.
//
// Uso:  node tools/build-catalog.mjs            (usa la caché si está completa)
//       GEMINI_API_KEY=… node tools/build-catalog.mjs   (para traducir los nombres que falten)
//
// Los JSON de las fuentes van en `tools/catalog-cache/` (commiteados): el catálogo no depende
// de que las fuentes sigan vivas ni de red en cada build.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = join(ROOT, "tools/catalog-cache");
const OUT = join(ROOT, "src/data/catalogGen.json");
// Instrucciones aparte (~860 KB): solo se cargan al abrir la ficha de un ejercicio.
const OUT_INSTR = join(ROOT, "src/data/catalogInstructions.json");
const SEED_FILE = join(ROOT, "src/data/exerciseCatalog.ts");

const MUSCLES = ["chest", "lats", "middleBack", "lowerBack", "traps", "shoulders", "biceps", "triceps", "forearms", "abs", "quads", "hamstrings", "glutes", "calves", "adductors", "abductors", "neck"];
const EQUIPMENT = ["barbell", "dumbbell", "machine", "cable", "bodyweight", "kettlebell", "bands", "other"];

// ---- Mapeos de músculos a los unions de la app --------------------------------------------

// wger identifica los músculos por id.
const WGER_MUSCLE = {
  1: "biceps", 2: "shoulders", 3: "shoulders", 4: "chest", 5: "triceps", 6: "abs",
  7: "calves", 8: "glutes", 9: "traps", 10: "quads", 11: "hamstrings", 12: "lats",
  13: "biceps", 14: "abs", 15: "calves",
};

// RepDB usa slugs anatómicos.
const REPDB_MUSCLE = {
  pectoralis_major: "chest", latissimus_dorsi: "lats", rhomboids: "middleBack",
  erector_spinae: "lowerBack", quadratus_lumborum: "lowerBack", trapezius: "traps",
  anterior_deltoid: "shoulders", lateral_deltoid: "shoulders", posterior_deltoid: "shoulders",
  serratus_anterior: "shoulders", supraspinatus: "shoulders",
  biceps_brachii: "biceps", brachialis: "biceps",
  triceps_brachii: "triceps",
  forearm_flexors: "forearms", forearm_extensors: "forearms", brachioradialis: "forearms", forearms: "forearms",
  rectus_abdominis: "abs", obliques: "abs", transverse_abdominis: "abs", hip_flexors: "abs",
  quadriceps: "quads", hamstrings: "hamstrings", gluteus_maximus: "glutes", gluteus_medius: "abductors",
  gastrocnemius: "calves", soleus: "calves", adductors: "adductors", abductors: "abductors",
};

// hasaneyldrm usa el vocabulario de ExerciseDB (nombres comunes en inglés). Los que no mapean
// (tobillos, muñecas, "core" genérico…) se descartan de la lista, no se fuerzan.
const HV_MUSCLE = {
  abs: "abs", abdominals: "abs", obliques: "abs", "lower abs": "abs", core: "abs",
  quads: "quads", quadriceps: "quads", lats: "lats", "latissimus dorsi": "lats",
  calves: "calves", soleus: "calves", pectorals: "chest", chest: "chest", "upper chest": "chest",
  glutes: "glutes", hamstrings: "hamstrings", adductors: "adductors", "inner thighs": "adductors", groin: "adductors",
  abductors: "abductors", triceps: "triceps", biceps: "biceps", brachialis: "biceps",
  spine: "lowerBack", "lower back": "lowerBack", "upper back": "middleBack", back: "middleBack", rhomboids: "middleBack",
  delts: "shoulders", deltoids: "shoulders", shoulders: "shoulders", "rear deltoids": "shoulders",
  "rotator cuff": "shoulders", "serratus anterior": "shoulders",
  forearms: "forearms", "wrist flexors": "forearms", "wrist extensors": "forearms", "grip muscles": "forearms",
  traps: "traps", trapezius: "traps", "levator scapulae": "neck", sternocleidomastoid: "neck",
};

// free-exercise-db usa el vocabulario clásico de bodybuilding.com.
const FED_MUSCLE = {
  abdominals: "abs", abductors: "abductors", adductors: "adductors", biceps: "biceps",
  calves: "calves", chest: "chest", forearms: "forearms", glutes: "glutes", hamstrings: "hamstrings",
  lats: "lats", "lower back": "lowerBack", "middle back": "middleBack", neck: "neck",
  quadriceps: "quads", shoulders: "shoulders", traps: "traps", triceps: "triceps",
};

// ---- Mapeos de equipamiento ----------------------------------------------------------------

// RepDB: las máquinas de cardio van como "other" + kind duration.
const REPDB_EQUIPMENT = {
  barbell: "barbell", ez_bar: "barbell", trap_bar: "barbell", dumbbell: "dumbbell",
  kettlebell: "kettlebell", cable: "cable", smith_machine: "machine", leg_press: "machine",
  leg_curl: "machine", leg_extension: "machine", hack_squat: "machine", lat_pulldown_machine: "machine",
  "standing_calf_raise_machine": "machine", "seated_calf_raise_machine": "machine", donkey_calf_raise_machine: "machine",
  shoulder_press_machine: "machine", plate_loaded_lateral_raise_machine: "machine", dip_machine: "machine",
  assisted_pullup_machine: "machine", chest_press_machine: "machine", hip_abduction_machine: "machine",
  hip_adduction_machine: "machine", back_extension_machine: "machine", bicep_curl_machine: "machine",
  chest_fly_machine: "machine", preacher_curl_machine: "machine", ab_crunch_machine: "machine",
  tricep_extension_machine: "machine", pec_deck: "machine", hip_thrust_machine: "machine",
  shrug_machine: "machine", loop_band: "bands", resistance_band: "bands",
  pull_up_bar: "bodyweight", rings: "bodyweight", dip_station: "bodyweight", suspension_trainer: "bodyweight",
  flat_bench: "other", stability_ball: "other", plyo_box: "other", ab_wheel: "other",
  battle_rope: "other", slam_ball: "other", climbing_rope: "other", wrist_roller: "other",
  plates: "other", sled: "other", jump_rope: "other",
  treadmill: "other", elliptical: "other", stationary_bike: "other", air_bike: "other",
  rower: "other", stair_climber: "other",
};
const REPDB_DURATION = new Set(["treadmill", "elliptical", "stationary_bike", "air_bike", "rower", "stair_climber", "jump_rope", "battle_rope"]);

const HV_EQUIPMENT = {
  barbell: "barbell", "ez barbell": "barbell", "trap bar": "barbell", "olympic barbell": "barbell",
  dumbbell: "dumbbell", cable: "cable", "leverage machine": "machine", "smith machine": "machine",
  "body weight": "bodyweight", assisted: "bodyweight", kettlebell: "kettlebell",
  band: "bands", "resistance band": "bands",
  "stability ball": "other", weighted: "other", medicine: "other", "medicine ball": "other",
  "bosu ball": "other", roller: "other", "foam roll": "other", wheel: "other", "wheel roller": "other",
  rope: "other", hammer: "other", tire: "other", stationary: "other", "stepmill machine": "other",
  "skierg machine": "other", "elliptical machine": "other", "upper body ergometer": "other",
};

const FED_EQUIPMENT = {
  barbell: "barbell", "e-z curl bar": "barbell", "olympic barbell": "barbell",
  dumbbell: "dumbbell", cable: "cable", machine: "machine", "leverage machine": "machine",
  "body only": "bodyweight", kettlebell: "kettlebell", bands: "bands",
  "medicine ball": "other", "exercise ball": "other", "foam roll": "other", other: "other",
};

// wger: los ids 8/9 (bancos) y 4/5 (colchoneta/bosu) quedan como "other"; 6 (barra de
// dominadas) es una estación de peso corporal.
const WGER_EQUIPMENT = {
  1: "barbell", 2: "barbell", 3: "dumbbell", 10: "kettlebell", 11: "bands",
  12: "cable", 7: "bodyweight", 6: "bodyweight", 8: "other", 9: "other", 4: "other", 5: "other",
};

// ---- Utilidades ----------------------------------------------------------------------------

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

function pickMuscles(names, table) {
  const out = [];
  for (const n of names) {
    const m = table[n];
    if (m && !out.includes(m)) out.push(m);
  }
  return out;
}

function assertDomain(ex, where) {
  for (const m of [...ex.primary, ...ex.secondary]) {
    if (!MUSCLES.includes(m)) throw new Error(`Músculo fuera del dominio en ${where} (${ex.nameEn}): ${m}`);
  }
  if (!EQUIPMENT.includes(ex.equipment)) throw new Error(`Equipamiento fuera del dominio en ${where} (${ex.nameEn}): ${ex.equipment}`);
}

/**
 * Tipo de registro a partir del nombre inglés y del equipamiento ya normalizado. Antes cada
 * fuente lo decidía a su manera y 333 ejercicios de peso corporal (flexiones, dominadas,
 * fondos…) salían como `weight_reps`, que exige kilos para poder marcar la serie.
 * - Isométricos (plancha, «hold», sentadilla en pared, colgarse…) → `duration`.
 * - Equipamiento de peso corporal → `bodyweight` (salvo que el nombre diga que va lastrado).
 */
const DURATION_NAME = /\b(plank|planks|hold|holds|isometric|wall sit|dead hang|hollow body|static)\b/i;
// «L-sit» a secas es un isométrico, pero «L-sit pull-up» es una dominada por repeticiones.
const L_SIT = /\bl[- ]sit\b/i;
const REPS_MOVE = /\b(pull|chin|row|press|curl|dip)/i;
const WEIGHTED_NAME = /\b(weighted|with (a )?(dumbbell|kettlebell|plate|barbell|vest))\b/i;
function inferKind(nameEn, equipment, fallback) {
  if (fallback === "duration" || DURATION_NAME.test(nameEn) || (L_SIT.test(nameEn) && !REPS_MOVE.test(nameEn))) return "duration";
  if (equipment === "bodyweight" && !WEIGHTED_NAME.test(nameEn)) return "bodyweight";
  return fallback;
}

// ---- Normalización por fuente --------------------------------------------------------------

function fromRepdb(data) {
  const out = [];
  const BASE = "https://raw.githubusercontent.com/RepDB/exercise-dataset/main/";
  for (const e of data.exercises) {
    const primary = pickMuscles(e.primary_muscles ?? [], REPDB_MUSCLE);
    if (!primary.length) continue; // estiramientos/flexibilidad sin músculo mapeable
    const img = e.images?.flat ?? {};
    const frames = [img.start ?? img.main, img.peak].filter(Boolean).map((p) => BASE + p);
    out.push({
      src: "repdb", id: `repdb:${e.id}`, nameEn: e.name_en, nameEs: e.name_es || e.name_en,
      aliases: [e.name_en, e.name_de].filter(Boolean),
      primary, secondary: pickMuscles(e.secondary_muscles ?? [], REPDB_MUSCLE).filter((m) => !primary.includes(m)),
      equipment: REPDB_EQUIPMENT[e.equipment] ?? "other",
      kind: inferKind(
        e.name_en,
        REPDB_EQUIPMENT[e.equipment] ?? (e.equipment ? "other" : "bodyweight"),
        REPDB_DURATION.has(e.equipment) || e.category === "cardio" ? "duration" : e.equipment ? "weight_reps" : "bodyweight",
      ),
      compound: e.mechanic === "compound" ? true : e.mechanic === "isolation" ? false : undefined,
      frames: frames.length ? frames : undefined,
      instructionsEs: e.instructions_es?.length ? e.instructions_es : undefined,
    });
  }
  return out;
}

function fromHv(data) {
  const out = [];
  for (const e of data) {
    if (e.category === "cardio") continue; // el cardio vive en su propia pestaña (running)
    const primary = pickMuscles([e.target].filter(Boolean), HV_MUSCLE);
    if (!primary.length) continue;
    out.push({
      src: "hv", id: `hv:${e.id}`, nameEn: e.name, nameEs: null, // se traduce después
      aliases: [e.name],
      primary, secondary: pickMuscles(e.secondary_muscles ?? [], HV_MUSCLE).filter((m) => !primary.includes(m)),
      equipment: HV_EQUIPMENT[e.equipment] ?? "other",
      kind: inferKind(e.name, HV_EQUIPMENT[e.equipment] ?? "other", "weight_reps"),
      instructionsEs: e.instruction_steps?.es?.length ? e.instruction_steps.es : undefined,
      // GIF animado de ExerciseDB (mismo id que hasaneyldrm: `media_id` = `exerciseId`). Se enlaza,
      // no se copia: su API gratuita permite apps no comerciales con atribución a AscendAPI; los
      // GIF son © Gym visual (ver AGENTS.md → catálogo).
      gif: e.media_id ? `edb:${e.media_id}` : undefined,
    });
  }
  return out;
}

function fromWger(data) {
  const out = [];
  for (const e of data) {
    // La caché guarda los músculos/equipamiento ya reducidos a ids.
    const primary = (e.muscles ?? []).map((id) => WGER_MUSCLE[id]).filter(Boolean);
    if (!primary.length) continue;
    const en = e.translations.find((t) => t.language === 2)?.name;
    if (!en) continue; // sin nombre inglés no hay clave de dedupe
    const es = e.translations.find((t) => t.language === 4)?.name;
    const frames = (e.images ?? []).slice(0, 2);
    const equipment = e.equipment.map((id) => WGER_EQUIPMENT[id]).filter(Boolean);
    out.push({
      src: "wger", id: `wger:${e.uuid}`, nameEn: en, nameEs: es || null,
      aliases: [en, ...(es ? [es] : [])],
      primary: [...new Set(primary)],
      secondary: [...new Set((e.muscles_secondary ?? []).map((id) => WGER_MUSCLE[id]).filter(Boolean))].filter((m) => !primary.includes(m)),
      equipment: equipment[0] ?? "other",
      kind: inferKind(en, equipment[0] ?? "other", equipment.includes("bodyweight") ? "bodyweight" : "weight_reps"),
      frames: frames.length ? frames : undefined,
    });
  }
  return out;
}

function fromFed(data) {
  const out = [];
  const BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";
  for (const e of data) {
    const primary = pickMuscles(e.primaryMuscles ?? [], FED_MUSCLE);
    if (!primary.length) continue;
    // El id del ejercicio no cambia (lo usan rutinas ya guardadas), pero la carpeta de las fotos es
    // la del repositorio real (`folder`, de su `dist/exercises.json`): «3/4 Sit-Up» vive en
    // `3_4_Sit-Up/`, no en `3/4_Sit-Up/` — así 34 fichas enlazaban imágenes que daban 404.
    const id = e.name.replace(/ /g, "_");
    const folder = e.folder ?? id;
    const count = e.imageCount ?? 2;
    out.push({
      src: "fed", id: `fed:${id}`, nameEn: e.name, nameEs: null, // se traduce después
      aliases: [e.name],
      primary, secondary: pickMuscles(e.secondaryMuscles ?? [], FED_MUSCLE).filter((m) => !primary.includes(m)),
      equipment: FED_EQUIPMENT[e.equipment] ?? "other",
      kind: inferKind(e.name, FED_EQUIPMENT[e.equipment] ?? "other", e.equipment === "body only" ? "bodyweight" : "weight_reps"),
      compound: e.mechanic === "compound" ? true : e.mechanic === "isolation" ? false : undefined,
      frames: count > 0 ? Array.from({ length: Math.min(count, 2) }, (_, n) => `${BASE}/${folder}/${n}.jpg`) : undefined,
    });
  }
  return out;
}

// ---- Fusión por nombre (inglés normalizado) ------------------------------------------------

function mergeInto(index, candidates) {
  const stats = { kept: 0, merged: 0, dupSelf: 0 };
  for (const c of candidates) {
    const key = norm(c.nameEn);
    const existing = index.get(key);
    if (!existing) {
      index.set(key, c);
      stats.kept++;
      continue;
    }
    if (existing.src === c.src) { stats.dupSelf++; continue; } // duplicado dentro de la fuente
    // La que ya estaba (mayor prioridad) gana; la de abajo aporta lo que le falte.
    if (!existing.frames && c.frames) existing.frames = c.frames;
    if (!existing.gif && c.gif) existing.gif = c.gif;
    if (!existing.instructionsEs && c.instructionsEs) existing.instructionsEs = c.instructionsEs;
    if (existing.nameEs === null && c.nameEs) existing.nameEs = c.nameEs;
    for (const a of c.aliases) if (!existing.aliases.includes(a)) existing.aliases.push(a);
    if (existing.compound === undefined && c.compound !== undefined) existing.compound = c.compound;
    stats.merged++;
  }
  return stats;
}

// ---- Traducción de nombres con Gemini (caché commiteada) ------------------------------------

async function translateNames(missing) {
  const cacheFile = join(CACHE, "names-es.json");
  const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};
  const todo = missing.filter((en) => !cache[en]);
  if (!todo.length) return cache;
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    console.warn(`\n⚠ Falta GEMINI_API_KEY: ${todo.length} nombres se quedan en inglés (la caché tiene ${Object.keys(cache).length}).`);
    return cache;
  }
  for (let i = 0; i < todo.length; i += 80) {
    const batch = todo.slice(i, i + 80);
    const body = JSON.stringify({
      contents: [{
        parts: [{
          text:
            "Traduce al español (España) estos nombres de ejercicios de gimnasio. Usa el vocabulario habitual de gimnasio en España " +
            "(p. ej. press banca, curl femoral, remo, zancadas, gemelos, encogimientos). Devuelve SOLO un JSON array de strings, en el mismo orden, sin explicaciones.\n\n" +
            JSON.stringify(batch),
        }],
      }],
      generationConfig: { temperature: 0 },
    });
    let arr = null;
    for (let attempt = 1; attempt <= 4 && !arr; attempt++) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${encodeURIComponent(key)}`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body },
      );
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const m = text.match(/\[[\s\S]*\]/);
      if (m) {
        const parsed = JSON.parse(m[0]);
        if (parsed.length === batch.length) arr = parsed;
      }
      if (!arr) {
        if (attempt === 4) console.warn(`  ⚠ lote ${i}: Gemini no respondió bien tras 4 intentos — se quedan en inglés`);
        await new Promise((r) => setTimeout(r, 20_000 * attempt)); // backoff: el tier gratuito limita RPM
      }
    }
    if (arr) {
      batch.forEach((en, j) => { cache[en] = arr[j]; });
      writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
      console.log(`  traducidos ${Math.min(i + 80, todo.length)}/${todo.length}`);
    }
    await new Promise((r) => setTimeout(r, 5_000)); // ritmo prudente entre lotes
  }
  return cache;
}

// ---- Main ----------------------------------------------------------------------------------

mkdirSync(CACHE, { recursive: true });

// Los nombres EN del catálogo semilla, para no duplicar sus ejercicios.
const seedSrc = readFileSync(SEED_FILE, "utf8");
const seedEn = new Set();
// Los ids de la semilla son los de free-exercise-db: su copia en el catálogo generado se llama
// distinto («Barbell Bench Press - Medium Grip» frente al alias «Barbell Bench Press») y el
// dedupe por nombre no la cazaba — 18 ejercicios salían dos veces, con historial partido.
const seedFedIds = new Set();
for (const m of seedSrc.matchAll(/^\s*c\("([^"]+)",\s*"[^"]+",\s*"([^"]+)"/gm)) {
  seedFedIds.add(`fed:${m[1]}`);
  seedEn.add(norm(m[2]));
}

const load = (f) => JSON.parse(readFileSync(join(CACHE, f), "utf8"));
const sources = {
  repdb: fromRepdb(load("repdb.json")),
  hv: fromHv(load("hv.json")),
  wger: fromWger(load("wger.json")),
  fed: fromFed(load("fed.json")),
};

const index = new Map();
for (const src of ["repdb", "hv", "wger", "fed"]) {
  const stats = mergeInto(index, sources[src]);
  console.log(`${src}: ${sources[src].length} válidos → ${stats.kept} nuevos, ${stats.merged} fusionados, ${stats.dupSelf} dup. internos`);
}

// Descartar los que colisionan con la semilla (la semilla ya está en la app).
let seedCollisions = 0;
for (const [key, e] of [...index.entries()]) {
  if (seedEn.has(key) || seedFedIds.has(e.id) || e.aliases.some((a) => seedEn.has(norm(a)))) {
    index.delete(key);
    seedCollisions++;
  }
}
console.log(`colisiones con la semilla (descartados): ${seedCollisions}`);

// Nombres ES: los que ninguna fuente da en español se traducen (hasaneyldrm/free-exercise-db).
const all = [...index.values()];
const namesEs = await translateNames(all.filter((e) => e.nameEs === null).map((e) => e.nameEn));

// Mismo nombre en español desde dos fuentes (p. ej. «Aperturas en máquina» de wger y de RepDB):
// en el selector serían dos filas idénticas. Se queda la de mayor prioridad (orden de inserción
// del índice) y la otra aporta lo que le falte, igual que en `mergeInto`.
const esName = (e) => {
  const raw = (e.nameEs ?? namesEs[e.nameEn] ?? e.nameEn).trim().replace(/\s+/g, " ");
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};
const byEs = new Map();
let esDupes = 0;
for (const e of all) {
  const k = norm(esName(e));
  const first = byEs.get(k);
  if (!first) { byEs.set(k, e); continue; }
  esDupes++;
  if (!first.frames && e.frames) first.frames = e.frames;
  if (!first.gif && e.gif) first.gif = e.gif;
  if (!first.instructionsEs && e.instructionsEs) first.instructionsEs = e.instructionsEs;
  for (const a of e.aliases) if (!first.aliases.includes(a)) first.aliases.push(a);
}
console.log(`nombres en español repetidos (fusionados): ${esDupes}`);

// Cruce por nombre para los que siguen sin foto ni GIF: si otro ejercicio con imagen tiene el mismo
// conjunto de palabras (sin orden, sin palabras vacías, en singular) o se parece mucho (Dice ≥ 0,9)
// con el mismo equipamiento, se usa su imagen. Umbral alto a propósito: con 0,8 salían parejas
// falsas («Butterfly Sit Up» ≈ «Sit-Up»). El script imprime lo que rellena para revisarlo.
const STOP = new Set(["the", "with", "on", "a", "an", "of", "and", "to", "in", "for", "v", "pov", "version"]);
const SYN = { flye: "fly", flyes: "fly", dumbbells: "dumbbell", lever: "machine" };
const toks = (name) =>
  norm(name)
    .split(" ")
    .filter((t) => t && !STOP.has(t) && !/^\d+$/.test(t))
    .map((t) => SYN[t] ?? (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t));
const dice = (a, b) => {
  const A = new Set(a), B = new Set(b);
  let n = 0;
  for (const t of A) if (B.has(t)) n++;
  return (2 * n) / (A.size + B.size || 1);
};
const withMedia = [...byEs.values()].filter((e) => e.frames || e.gif).map((e) => ({ e, keys: e.aliases.map(toks) }));
const crossFilled = [];
for (const e of byEs.values()) {
  if (e.frames || e.gif) continue;
  const mine = e.aliases.map(toks);
  let best = null;
  for (const cand of withMedia) {
    for (const k of cand.keys) {
      for (const m of mine) {
        const exact = k.length === m.length && [...k].sort().join(" ") === [...m].sort().join(" ");
        const d = exact ? 1 : cand.e.equipment === e.equipment ? dice(k, m) : 0;
        if (d >= 0.9 && (!best || d > best.d)) best = { d, c: cand.e };
      }
    }
  }
  if (best) {
    if (best.c.frames) e.frames = best.c.frames;
    else e.gif = best.c.gif;
    crossFilled.push(`${e.nameEn}  ←  ${best.c.nameEn} (${best.d.toFixed(2)})`);
  }
}
console.log(`cruce por nombre: ${crossFilled.length} rellenados`);
writeFileSync(join(CACHE, "cross-fill-review.txt"), crossFilled.join("\n") + "\n");

// Las URLs de las fotos se guardan con un prefijo corto (`exerciseCatalog.ts` las expande):
// ~290 KB menos en el paquete.
const FRAME_PREFIXES = {
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/": "fed:",
  "https://raw.githubusercontent.com/RepDB/exercise-dataset/main/": "repdb:",
  "https://wger.de/media/exercise-images/": "wger:",
};
const shortFrame = (url) => {
  for (const [base, p] of Object.entries(FRAME_PREFIXES)) if (url.startsWith(base)) return p + url.slice(base.length);
  return url;
};

const instructions = {};
const out = [...byEs.values()].map((e) => {
  const name = esName(e);
  if (e.instructionsEs) instructions[e.id] = e.instructionsEs;
  const ex = {
    id: e.id,
    // Primera letra en mayúscula y sin espacios sobrantes (`esName`): las fuentes mezclan
    // criterios y Gemini devuelve minúscula inicial (y a veces un espacio delante).
    name,
    aliases: e.aliases,
    primary: e.primary,
    secondary: e.secondary,
    equipment: e.equipment,
    kind: e.kind,
    source: "catalog",
    ...(e.compound !== undefined ? { compound: e.compound } : {}),
    ...(e.frames ? { frames: e.frames.map(shortFrame) } : {}),
    ...(e.gif ? { gif: e.gif } : {}),
    // Sin foto ni GIF en ninguna fuente: se oculta de las listas y la búsqueda, pero sigue
    // existiendo por id para rutinas o entrenos que ya lo usaran (ver `exerciseCatalog.ts`).
    ...(!e.frames && !e.gif ? { hidden: true } : {}),
  };
  assertDomain(ex, e.src);
  return ex;
});

// Orden: nombre ES alfabético (el buscador ya filtra; un orden estable ayuda a los e2e).
out.sort((a, b) => a.name.localeCompare(b.name, "es"));

writeFileSync(OUT, JSON.stringify(out));
writeFileSync(OUT_INSTR, JSON.stringify(instructions));
const kb = Math.round(readFileSync(OUT).byteLength / 1024);
console.log(`\n✓ ${OUT.replace(ROOT + "/", "")}: ${out.length} ejercicios (${kb} KB)`);
const byEq = {};
for (const e of out) byEq[e.equipment] = (byEq[e.equipment] ?? 0) + 1;
console.log("por equipamiento:", byEq);
const withFrames = out.filter((e) => e.frames).length;
const onlyGif = out.filter((e) => !e.frames && e.gif).length;
const hiddenN = out.filter((e) => e.hidden).length;
console.log(`imagen: ${withFrames} con foto · ${onlyGif} solo con GIF · ${hiddenN} ocultos (sin imagen) → visibles ${out.length - hiddenN}, todos con imagen`);
const withInstr = Object.keys(instructions).length;
const byKind = {};
for (const e of out) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
console.log("por tipo:", byKind);
console.log(`con foto: ${withFrames} · con instrucciones ES: ${withInstr}`);
const hash = createHash("sha256").update(readFileSync(OUT)).digest("hex").slice(0, 12);
console.log(`sha256: ${hash}`);
