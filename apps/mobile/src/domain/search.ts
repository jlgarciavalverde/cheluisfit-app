// Reglas comunes de todos los buscadores de la app (alimentos, ejercicios, personas): antes cada
// uno esperaba distinto, pedía un mínimo de letras distinto y avisaba (o no) de forma distinta.

/** Con menos letras no se busca: una sola letra da cientos de resultados sin sentido. */
export const SEARCH_MIN_CHARS = 2;
/** Espera tras la última tecla antes de buscar en red (alimentos, personas). Lo local es inmediato. */
export const SEARCH_DEBOUNCE_MS = 250;

/** Texto de la línea de estado bajo el buscador; `null` = no enseñar nada (buscador vacío). */
export function searchStatusText(query: string, loading: boolean, count: number | null, noun: readonly [string, string]): string | null {
  const q = query.trim();
  if (q.length === 0) return null;
  if (q.length < SEARCH_MIN_CHARS) return `Escribe al menos ${SEARCH_MIN_CHARS} letras`;
  if (loading || count === null) return "Buscando…";
  return countLabel(count, noun);
}

/** «1 ejercicio», «3 ejercicios». */
export function countLabel(n: number, noun: readonly [string, string]): string {
  return `${n} ${n === 1 ? noun[0] : noun[1]}`;
}

/** Texto que de verdad se usa para filtrar: con menos de `SEARCH_MIN_CHARS` letras, ninguno. */
export function effectiveQuery(query: string): string {
  const q = query.trim();
  return q.length >= SEARCH_MIN_CHARS ? q : "";
}
