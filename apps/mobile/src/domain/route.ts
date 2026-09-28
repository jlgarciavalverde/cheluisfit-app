// Utilidades de recorridos GPS, puras. Un recorrido real (Strava, Health Connect) no tiene
// límite de puntos: una actividad de varias horas da miles. Se reduce en dos momentos distintos:
// - al **guardarlo** (`STORED_ROUTE_POINTS`): va dentro del blob `cf_running_v1`, que se
//   sincroniza entero y en Android no puede pasar de ~2 MB por entrada de AsyncStorage;
// - al **publicarlo** (`SNAPSHOT_ROUTE_POINTS`): el snapshot de un post tiene un tope de 8 KB
//   en el servidor (`schemas.ts`), y 1.000 puntos sin reducir ya son ~35 KB.

export type LatLon = { lat: number; lon: number };

export const STORED_ROUTE_POINTS = 300;
export const SNAPSHOT_ROUTE_POINTS = 120;

/** Toma `max` puntos repartidos por igual y conserva siempre el primero y el último exactos. */
export function downsample<T>(points: readonly T[], max: number): T[] {
  if (points.length <= max) return [...points];
  const stride = (points.length - 1) / (max - 1);
  const out: T[] = [];
  for (let i = 0; i < max - 1; i++) out.push(points[Math.round(i * stride)]!);
  out.push(points[points.length - 1]!);
  return out;
}

/** 5 decimales ≈ 1 m: de sobra para dibujar, y cada punto ocupa la mitad en JSON. */
export function roundCoords(points: readonly LatLon[]): LatLon[] {
  return points.map((p) => ({ lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5 }));
}

/** Forma compacta de un recorrido para guardar (o `undefined` si no hay recorrido útil). */
export function compactRoute(route: readonly LatLon[] | undefined, max: number = STORED_ROUTE_POINTS): LatLon[] | undefined {
  if (!route || route.length < 2) return undefined;
  return roundCoords(downsample(route, max));
}
