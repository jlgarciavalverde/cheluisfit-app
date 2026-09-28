const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY-MM-DD en hora local. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export function todayKey(): string {
  return toDateKey(new Date());
}

const dayFmt = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "short" });
const shortFmt = new Intl.DateTimeFormat("es-ES", { weekday: "short", day: "numeric" });

/** «Hoy», «Ayer», «Mañana» o «lunes, 21 sept». */
export function dayLabel(key: string, now: string = todayKey()): string {
  if (key === now) return "Hoy";
  if (key === addDays(now, -1)) return "Ayer";
  if (key === addDays(now, 1)) return "Mañana";
  const s = dayFmt.format(fromDateKey(key)).replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shortDayLabel(key: string): string {
  return shortFmt.format(fromDateKey(key)).replace(".", "");
}

/** Lunes a domingo de la semana que contiene `key`. */
export function weekDates(key: string): string[] {
  const dow = (fromDateKey(key).getDay() + 6) % 7; // lunes = 0
  const monday = addDays(key, -dow);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
