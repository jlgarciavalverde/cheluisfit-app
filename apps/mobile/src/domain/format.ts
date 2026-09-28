const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 });

/** Entero con separador de miles solo desde 5 cifras (es-ES no lo pone en 4). */
export function fmtInt(n: number): string {
  const r = Math.round(n);
  return Math.abs(r) >= 1000 ? nf0.format(r).replace(/^(-?\d)(\d{3})$/, "$1.$2") : String(r);
}

/** Un decimal con coma, sin decimal si es entero. */
export function fmtNum(n: number): string {
  return nf1.format(n);
}

export function fmtGrams(n: number): string {
  return `${fmtNum(n)} g`;
}

/** «1:40:22» o «48:10» a partir de segundos. */
export function fmtDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Ritmo en min/km a partir de segundos por km: «5:14». */
export function fmtPace(secPerKm: number): string {
  const s = Math.round(secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Kilómetros con coma: «9,2». */
export function fmtKm(meters: number): string {
  return nf1.format(meters / 1000);
}

/** Número desde texto con coma o punto decimal; `null` si no es válido o está vacío. */
export function parseNum(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Kilos con hasta 2 decimales («1,25», «62,5», «60»): los discos pequeños no caben en un decimal. */
export function fmtKg(n: number): string {
  return nf2.format(n);
}

const relDayFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" });

/** «ahora», «hace 5 min», «hace 3 h», «hace 2 d»… a partir de un timestamp en ms (posts sociales). */
export function fmtRelativeTime(ms: number, now: number = Date.now()): string {
  const diffS = Math.max(0, Math.round((now - ms) / 1000));
  if (diffS < 60) return "ahora";
  const diffM = Math.round(diffS / 60);
  if (diffM < 60) return `hace ${diffM} min`;
  const diffH = Math.round(diffM / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  if (diffD < 7) return `hace ${diffD} d`;
  const diffW = Math.round(diffD / 7);
  if (diffW < 5) return `hace ${diffW} sem`;
  return relDayFmt.format(new Date(ms));
}
