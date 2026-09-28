import {
  type Equipment,
  type Exercise,
  GROUP_LABEL,
  groupOf,
  MUSCLE_LABEL,
  type MuscleGroup,
} from "@/domain/strength";
import { normalizeText } from "@/domain/text";

export interface ExerciseFilter {
  query?: string;
  group?: MuscleGroup | "all";
  equipment?: Equipment | "all";
  /** Solo los que tienen vídeo propio. */
  withVideo?: boolean;
}

const stem = (t: string) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t);

// Collator reutilizado: `localeCompare(..., "es")` por llamada es muy lento y se invoca en
// cada comparación de la ordenación — con ~3.000 ejercicios congelaba la primera apertura de
// Fuerza (visto de verdad en el móvil tras ampliar el catálogo).
const collator = new Intl.Collator("es");

// Caché de «aguja» por ejercicio: los objetos del catálogo son estables entre búsquedas, así
// que no hace falta recomponer las palabras en cada pulsación del buscador.
const haystackCache = new WeakMap<Exercise, string[]>();

/** Nombre, alias y músculos principales (para que «pecho» o «bíceps» también encuentren ejercicios). */
function haystack(e: Exercise): string[] {
  let h = haystackCache.get(e);
  if (!h) {
    const muscles = e.primary.flatMap((m) => [MUSCLE_LABEL[m], GROUP_LABEL[groupOf(m)]]);
    h = normalizeText([e.name, ...e.aliases, ...muscles].join(" ")).split(" ").map(stem);
    haystackCache.set(e, h);
  }
  return h;
}

/** Busca por nombre o alias (español e inglés, sin tildes ni plurales) y filtra por grupo/equipo. */
export function filterExercises(list: readonly Exercise[], f: ExerciseFilter): Exercise[] {
  const tokens = normalizeText(f.query ?? "").split(" ").filter(Boolean).map(stem);
  const filtered = list
    .filter((e) => (f.group && f.group !== "all" ? e.primary.some((m) => groupOf(m) === f.group) : true))
    .filter((e) => (f.equipment && f.equipment !== "all" ? e.equipment === f.equipment : true))
    .filter((e) => (f.withVideo ? !!e.video : true));
  // Sin consulta no hay nada que puntuar ni ordenar: la lista ya viene en orden estable.
  // Antes se ordenaba siempre con localeCompare «es» y era eso lo que pillaba la pantalla.
  if (tokens.length === 0) return filtered;
  return filtered
    .map((e) => {
      const words = haystack(e);
      let s = 0;
      for (const t of tokens) {
        if (words.some((w) => w === t)) s += 3;
        else if (words.some((w) => w.startsWith(t))) s += 2;
        else if (words.join(" ").includes(t)) s += 1;
        else return { e, s: 0 };
      }
      return { e, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || (a.e.source === "custom" ? -1 : 0) - (b.e.source === "custom" ? -1 : 0) || collator.compare(a.e.name, b.e.name))
    .map((x) => x.e);
}

/** Emparejado de nombres de archivo de vídeo («press-banca-con-barra.mp4») con el catálogo. */
export function matchVideoName(fileName: string, list: readonly Exercise[]): Exercise | null {
  const base = normalizeText(fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " "));
  if (!base) return null;
  const exact = list.find((e) => normalizeText(e.name) === base || e.aliases.some((a) => normalizeText(a) === base));
  if (exact) return exact;
  const tokens = base.split(" ").map(stem);
  const scored = list
    .map((e) => {
      const words = haystack(e);
      const hit = tokens.filter((t) => words.includes(t)).length;
      return { e, hit, cover: hit / Math.max(words.length, tokens.length) };
    })
    .filter((x) => x.hit === tokens.length)
    .sort((a, b) => b.cover - a.cover);
  // Solo si es inequívoco: un único mejor candidato.
  if (scored.length === 1 || (scored.length > 1 && scored[0].cover > scored[1].cover + 0.15)) return scored[0].e;
  return null;
}
