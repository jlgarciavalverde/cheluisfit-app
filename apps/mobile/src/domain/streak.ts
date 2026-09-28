// Racha de constancia: días seguidos con algo registrado (comida, entreno de fuerza o carrera),
// sin puntos ni gamificación — solo hacer visible algo que ya está en los datos. Puro, agnóstico
// de qué tienda aporta cada fecha (la pantalla que lo usa junta `entries`/`activities`/`workouts`
// en un único conjunto de fechas antes de llamar aquí).
import { addDays } from "./dates";

/**
 * Cuenta los días consecutivos hasta `today` (inclusive) que aparecen en `activeDates`. Si hoy
 * todavía no tiene nada, no rompe la racha por sí solo — se cuenta desde ayer, para no enseñar
 * un 0 a media mañana solo porque todavía no ha dado tiempo a registrar nada hoy.
 */
export function activeDayStreak(activeDates: readonly string[], today: string): number {
  const set = new Set(activeDates);
  let count = 0;
  let cursor = set.has(today) ? today : addDays(today, -1);
  while (set.has(cursor)) {
    count++;
    cursor = addDays(cursor, -1);
  }
  return count;
}
