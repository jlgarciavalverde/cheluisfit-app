// Catálogo base de ejercicios: estructura y fotos de free-exercise-db
// (https://github.com/yuhonas/free-exercise-db, dataset abierto). Nombres en español
// escritos aquí; el nombre original va como alias para buscar en ambos idiomas.
// AVISO: el autor no aclara la licencia de las imágenes → se cargan desde su URL en la
// fase de diseño y, para uso privado, se servirán desde el servidor propio.
import type { Equipment, Exercise, ExerciseKind, Muscle } from "@/domain/strength";
import catalogGen from "./catalogGen.json";

export const FED_BASE = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

type M = Muscle;

function c(
  fedId: string,
  name: string,
  alias: string,
  primary: M[],
  secondary: M[],
  equipment: Equipment,
  opts: { kind?: ExerciseKind; compound?: boolean } = {},
): Exercise {
  return {
    id: fedId,
    name,
    aliases: [alias],
    primary,
    secondary,
    equipment,
    kind: opts.kind ?? "weight_reps",
    frames: [`${FED_BASE}/${fedId}/0.jpg`, `${FED_BASE}/${fedId}/1.jpg`],
    source: "catalog",
    compound: opts.compound ?? false,
  };
}

const C = { compound: true };
const BW = { kind: "bodyweight" as const, compound: true };

export const CATALOG_SEED: Exercise[] = [
  // ---- Pecho
  c("Barbell_Bench_Press_-_Medium_Grip", "Press banca con barra", "Barbell Bench Press", ["chest"], ["shoulders", "triceps"], "barbell", C),
  c("Barbell_Incline_Bench_Press_-_Medium_Grip", "Press inclinado con barra", "Incline Barbell Bench Press", ["chest"], ["shoulders", "triceps"], "barbell", C),
  c("Dumbbell_Bench_Press", "Press banca con mancuernas", "Dumbbell Bench Press", ["chest"], ["shoulders", "triceps"], "dumbbell", C),
  c("Incline_Dumbbell_Press", "Press inclinado con mancuernas", "Incline Dumbbell Press", ["chest"], ["shoulders", "triceps"], "dumbbell", C),
  c("Leverage_Chest_Press", "Press de pecho en máquina", "Machine Chest Press", ["chest"], ["shoulders", "triceps"], "machine", C),
  c("Dumbbell_Flyes", "Aperturas con mancuernas", "Dumbbell Flyes", ["chest"], [], "dumbbell"),
  c("Cable_Crossover", "Cruce de poleas", "Cable Crossover", ["chest"], ["shoulders"], "cable"),
  c("Butterfly", "Aperturas en máquina (pec deck)", "Pec Deck Butterfly", ["chest"], [], "machine"),
  c("Dips_-_Chest_Version", "Fondos en paralelas (pecho)", "Chest Dips", ["chest"], ["shoulders", "triceps"], "bodyweight", BW),
  c("Pushups", "Flexiones", "Push-ups", ["chest"], ["shoulders", "triceps"], "bodyweight", BW),
  c("Incline_Push-Up", "Flexiones inclinadas", "Incline Push-Up", ["chest"], ["shoulders", "triceps"], "bodyweight", BW),

  // ---- Espalda
  c("Pullups", "Dominadas", "Pull-ups", ["lats"], ["biceps", "middleBack"], "bodyweight", BW),
  c("Chin-Up", "Dominadas supinas", "Chin-ups", ["lats"], ["biceps", "forearms", "middleBack"], "bodyweight", BW),
  c("Wide-Grip_Lat_Pulldown", "Jalón al pecho agarre ancho", "Wide-Grip Lat Pulldown", ["lats"], ["biceps", "middleBack", "shoulders"], "cable", C),
  c("Close-Grip_Front_Lat_Pulldown", "Jalón agarre cerrado", "Close-Grip Lat Pulldown", ["lats"], ["biceps", "middleBack", "shoulders"], "cable", C),
  c("Straight-Arm_Pulldown", "Pullover en polea (brazos rectos)", "Straight-Arm Pulldown", ["lats"], [], "cable"),
  c("Bent_Over_Barbell_Row", "Remo con barra", "Bent Over Barbell Row", ["middleBack"], ["biceps", "lats", "shoulders"], "barbell", C),
  c("One-Arm_Dumbbell_Row", "Remo con mancuerna a una mano", "One-Arm Dumbbell Row", ["middleBack"], ["biceps", "lats", "shoulders"], "dumbbell", C),
  c("Seated_Cable_Rows", "Remo sentado en polea", "Seated Cable Row", ["middleBack"], ["biceps", "lats", "shoulders"], "cable", C),
  c("Lying_T-Bar_Row", "Remo en T en máquina", "T-Bar Row", ["middleBack"], ["biceps", "lats"], "machine", C),
  c("Barbell_Deadlift", "Peso muerto", "Deadlift", ["lowerBack"], ["glutes", "hamstrings", "traps", "lats", "quads", "forearms"], "barbell", C),
  c("Hyperextensions_Back_Extensions", "Hiperextensiones", "Back Extensions", ["lowerBack"], ["glutes", "hamstrings"], "other"),
  c("Face_Pull", "Face pull", "Face Pull", ["shoulders"], ["middleBack"], "cable"),
  c("Barbell_Shrug", "Encogimientos con barra", "Barbell Shrug", ["traps"], [], "barbell"),
  c("Dumbbell_Shrug", "Encogimientos con mancuernas", "Dumbbell Shrug", ["traps"], [], "dumbbell"),

  // ---- Hombros
  c("Barbell_Shoulder_Press", "Press militar con barra", "Barbell Shoulder Press", ["shoulders"], ["chest", "triceps"], "barbell", C),
  c("Dumbbell_Shoulder_Press", "Press de hombro con mancuernas", "Dumbbell Shoulder Press", ["shoulders"], ["triceps"], "dumbbell", C),
  c("Machine_Shoulder_Military_Press", "Press de hombro en máquina", "Machine Shoulder Press", ["shoulders"], ["triceps"], "machine", C),
  c("Side_Lateral_Raise", "Elevaciones laterales con mancuernas", "Side Lateral Raise", ["shoulders"], [], "dumbbell"),
  c("Cable_Seated_Lateral_Raise", "Elevaciones laterales en polea", "Cable Lateral Raise", ["shoulders"], ["traps"], "cable"),
  c("Front_Dumbbell_Raise", "Elevaciones frontales con mancuernas", "Front Dumbbell Raise", ["shoulders"], [], "dumbbell"),
  c("Reverse_Flyes", "Pájaros con mancuernas", "Reverse Flyes", ["shoulders"], [], "dumbbell"),
  c("Cable_Rear_Delt_Fly", "Pájaros en polea", "Cable Rear Delt Fly", ["shoulders"], [], "cable"),
  c("Standing_Dumbbell_Upright_Row", "Remo al mentón con mancuernas", "Upright Row", ["traps"], ["biceps", "shoulders"], "dumbbell", C),

  // ---- Bíceps
  c("Barbell_Curl", "Curl con barra", "Barbell Curl", ["biceps"], ["forearms"], "barbell"),
  c("Close-Grip_EZ_Bar_Curl", "Curl con barra Z", "EZ Bar Curl", ["biceps"], ["forearms"], "barbell"),
  c("Dumbbell_Bicep_Curl", "Curl con mancuernas", "Dumbbell Curl", ["biceps"], ["forearms"], "dumbbell"),
  c("Dumbbell_Alternate_Bicep_Curl", "Curl alterno con mancuernas", "Alternate Dumbbell Curl", ["biceps"], ["forearms"], "dumbbell"),
  c("Hammer_Curls", "Curl martillo", "Hammer Curl", ["biceps"], [], "dumbbell"),
  c("Incline_Dumbbell_Curl", "Curl inclinado con mancuernas", "Incline Dumbbell Curl", ["biceps"], [], "dumbbell"),
  c("Preacher_Curl", "Curl en banco Scott", "Preacher Curl", ["biceps"], [], "barbell"),
  c("Concentration_Curls", "Curl concentrado", "Concentration Curl", ["biceps"], ["forearms"], "dumbbell"),
  c("Standing_Biceps_Cable_Curl", "Curl en polea", "Cable Curl", ["biceps"], [], "cable"),

  // ---- Tríceps
  c("Triceps_Pushdown", "Extensión de tríceps en polea (barra)", "Triceps Pushdown", ["triceps"], [], "cable"),
  c("Triceps_Pushdown_-_Rope_Attachment", "Extensión de tríceps en polea (cuerda)", "Rope Pushdown", ["triceps"], [], "cable"),
  c("Cable_Rope_Overhead_Triceps_Extension", "Extensión de tríceps sobre la cabeza en polea", "Overhead Triceps Extension", ["triceps"], [], "cable"),
  c("EZ-Bar_Skullcrusher", "Press francés con barra Z", "Skullcrusher", ["triceps"], ["forearms"], "barbell"),
  c("Close-Grip_Barbell_Bench_Press", "Press banca agarre cerrado", "Close-Grip Bench Press", ["triceps"], ["chest", "shoulders"], "barbell", C),
  c("Dips_-_Triceps_Version", "Fondos en paralelas (tríceps)", "Triceps Dips", ["triceps"], ["chest", "shoulders"], "bodyweight", BW),
  c("Bench_Dips", "Fondos en banco", "Bench Dips", ["triceps"], ["chest", "shoulders"], "bodyweight", BW),
  c("Tricep_Dumbbell_Kickback", "Patada de tríceps con mancuerna", "Triceps Kickback", ["triceps"], [], "dumbbell"),

  // ---- Pierna
  c("Barbell_Squat", "Sentadilla trasera con barra", "Barbell Squat", ["quads"], ["glutes", "hamstrings", "calves", "lowerBack"], "barbell", C),
  c("Goblet_Squat", "Sentadilla goblet", "Goblet Squat", ["quads"], ["glutes", "hamstrings", "calves", "shoulders"], "kettlebell", C),
  c("Hack_Squat", "Sentadilla hack en máquina", "Hack Squat", ["quads"], ["glutes", "hamstrings", "calves"], "machine", C),
  c("Leg_Press", "Prensa de piernas", "Leg Press", ["quads"], ["glutes", "hamstrings", "calves"], "machine", C),
  c("Split_Squat_with_Dumbbells", "Sentadilla búlgara con mancuernas", "Bulgarian Split Squat", ["quads"], ["glutes", "hamstrings"], "dumbbell", C),
  c("Dumbbell_Lunges", "Zancadas con mancuernas", "Dumbbell Lunges", ["quads"], ["glutes", "hamstrings", "calves"], "dumbbell", C),
  c("Barbell_Walking_Lunge", "Zancadas caminando con barra", "Walking Lunge", ["quads"], ["glutes", "hamstrings", "calves"], "barbell", C),
  c("Leg_Extensions", "Extensión de cuádriceps", "Leg Extension", ["quads"], [], "machine"),
  c("Lying_Leg_Curls", "Curl femoral tumbado", "Lying Leg Curl", ["hamstrings"], [], "machine"),
  c("Seated_Leg_Curl", "Curl femoral sentado", "Seated Leg Curl", ["hamstrings"], [], "machine"),
  c("Romanian_Deadlift", "Peso muerto rumano", "Romanian Deadlift", ["hamstrings"], ["glutes", "lowerBack", "calves"], "barbell", C),
  c("Barbell_Hip_Thrust", "Hip thrust con barra", "Barbell Hip Thrust", ["glutes"], ["hamstrings", "calves"], "barbell", C),
  c("Standing_Calf_Raises", "Gemelo de pie en máquina", "Standing Calf Raise", ["calves"], [], "machine"),
  c("Seated_Calf_Raise", "Gemelo sentado en máquina", "Seated Calf Raise", ["calves"], [], "machine"),
  c("Thigh_Adductor", "Máquina de aductores", "Thigh Adductor", ["adductors"], ["glutes", "hamstrings"], "machine"),
  c("Thigh_Abductor", "Máquina de abductores", "Thigh Abductor", ["abductors"], ["glutes"], "machine"),

  // ---- Core
  c("Cable_Crunch", "Crunch en polea", "Cable Crunch", ["abs"], [], "cable"),
  c("Crunches", "Crunch abdominal", "Crunches", ["abs"], [], "bodyweight", { kind: "bodyweight" }),
  c("Ab_Crunch_Machine", "Crunch en máquina", "Ab Crunch Machine", ["abs"], [], "machine"),
  c("Hanging_Leg_Raise", "Elevación de piernas colgado", "Hanging Leg Raise", ["abs"], [], "bodyweight", { kind: "bodyweight" }),
  c("Flat_Bench_Lying_Leg_Raise", "Elevación de piernas en banco", "Lying Leg Raise", ["abs"], [], "bodyweight", { kind: "bodyweight" }),
  c("Russian_Twist", "Giro ruso", "Russian Twist", ["abs"], ["lowerBack"], "bodyweight", { kind: "bodyweight" }),
  c("Ab_Roller", "Rueda abdominal", "Ab Roller", ["abs"], ["shoulders"], "other", BW),
  c("Plank", "Plancha", "Plank", ["abs"], [], "bodyweight", { kind: "duration" }),
];

// ---- Catálogo generado (tools/build-catalog.mjs) --------------------------------------------
// ~2.900 ejercicios más desde fuentes abiertas (RepDB, hasaneyldrm MIT, wger CC-BY-SA,
// free-exercise-db). La semilla de arriba gana cualquier colisión por nombre (normalizado):
// sus 75 entradas son las que el usuario ya conoce, con sus fotos y nombres propios.
const normKey = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const seedKeys = new Set<string>();
const seedIds = new Set<string>();
for (const e of CATALOG_SEED) {
  seedIds.add(`fed:${e.id}`); // la copia de free-exercise-db de un ejercicio de la semilla
  seedKeys.add(normKey(e.name));
  for (const a of e.aliases) seedKeys.add(normKey(a));
}

// `build-catalog.mjs` guarda las URLs de las fotos con un prefijo corto para que el JSON pese menos.
const FRAME_PREFIXES: [string, string][] = [
  ["fed:", `${FED_BASE}/`],
  ["repdb:", "https://raw.githubusercontent.com/RepDB/exercise-dataset/main/"],
  ["wger:", "https://wger.de/media/exercise-images/"],
];
const expandFrame = (f: string) => {
  for (const [p, base] of FRAME_PREFIXES) if (f.startsWith(p)) return base + f.slice(p.length);
  return f;
};

const generated = (catalogGen as Exercise[])
  .filter((e) => !seedIds.has(e.id) && [e.name, ...e.aliases].every((n) => !seedKeys.has(normKey(n))))
  .map((e) => (e.frames ? { ...e, frames: e.frames.map(expandFrame) } : e));

export const CATALOG: Exercise[] = [...CATALOG_SEED, ...generated];

export const CATALOG_BY_ID = new Map(CATALOG.map((e) => [e.id, e]));

/**
 * Instrucciones en español del catálogo generado, **bajo demanda**: son ~860 KB de texto que solo
 * hacen falta al abrir la ficha de un ejercicio, así que no van en el paquete inicial (en web se
 * cargan como un trozo aparte; en nativo, el JSON no se interpreta hasta que se pide).
 */
let instructions: Promise<Record<string, string[]>> | null = null;
export function loadInstructions(id: string): Promise<string[] | undefined> {
  instructions ??= import("./catalogInstructions.json").then((m) => (m.default ?? m) as Record<string, string[]>);
  return instructions.then((all) => all[id]).catch(() => undefined);
}
