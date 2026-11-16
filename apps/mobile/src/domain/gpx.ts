// Importación de carreras desde ficheros GPX (sin red).
import { toDateKey } from "./dates";
import { compactRoute, type LatLon } from "./route";
import { avgPace, type Activity } from "./running";

const TRKPT_RE = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/gi;
const TIME_RE = /<time>([^<]+)<\/time>/i;
const WALK_PACE_S_PER_KM = 900; // 15:00/km — por debajo, cuenta como caminata

function haversineM(a: LatLon, b: LatLon): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export type GpxParseResult =
  | { ok: true; activity: Omit<Activity, "id"> }
  | { ok: false; message: string };

/** Extrae puntos de la pista y devuelve una actividad lista para `addActivity`. */
export function parseGpx(xml: string, title = "Importado GPX"): GpxParseResult {
  const trimmed = xml.trim();
  if (!trimmed) return { ok: false, message: "El fichero está vacío" };
  if (!/<gpx[\s>]/i.test(trimmed)) return { ok: false, message: "No parece un fichero GPX válido" };

  const points: { lat: number; lon: number; time?: string }[] = [];
  for (const m of trimmed.matchAll(TRKPT_RE)) {
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const body = m[3] ?? "";
    const t = TIME_RE.exec(body)?.[1];
    points.push({ lat, lon, time: t });
  }
  if (points.length < 2) return { ok: false, message: "No he encontrado una ruta con al menos dos puntos" };

  let distanceM = 0;
  for (let i = 1; i < points.length; i++) distanceM += haversineM(points[i - 1]!, points[i]!);
  distanceM = Math.round(distanceM);

  const timed = points.filter((p) => p.time);
  let durationS = 0;
  let startedAt: string | undefined;
  let date = toDateKey(new Date());
  if (timed.length >= 2) {
    const start = new Date(timed[0]!.time!);
    const end = new Date(timed[timed.length - 1]!.time!);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) {
      return { ok: false, message: "Las marcas de tiempo del GPX no son válidas" };
    }
    durationS = Math.max(1, Math.round((end.getTime() - start.getTime()) / 1000));
    startedAt = start.toISOString();
    date = toDateKey(start);
  } else if (timed.length === 1) {
    const start = new Date(timed[0]!.time!);
    if (!Number.isFinite(start.getTime())) return { ok: false, message: "La marca de tiempo del GPX no es válida" };
    startedAt = start.toISOString();
    date = toDateKey(start);
    durationS = Math.max(60, Math.round(distanceM > 0 ? (distanceM / 1000) * 360 : 0));
  } else {
    durationS = Math.max(60, Math.round(distanceM > 0 ? (distanceM / 1000) * 360 : 0));
  }

  const route = compactRoute(points.map((p) => ({ lat: p.lat, lon: p.lon })));
  const type: Activity["type"] =
    distanceM > 0 && avgPace({ distanceM, durationS }) > WALK_PACE_S_PER_KM ? "walk" : "run";

  return {
    ok: true,
    activity: {
      date,
      startedAt,
      type,
      source: "manual",
      title: title.trim() || "Importado GPX",
      distanceM,
      durationS,
      route,
    },
  };
}
