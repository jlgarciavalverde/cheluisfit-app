import { View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";
import { downsample } from "@/domain/route";
import { radius } from "@/theme/tokens";

/** Límite de puntos al dibujar (ver `domain/route.ts`): por rendimiento del SVG y porque
 * `Math.min(...array)` revienta con `RangeError` en Hermes con recorridos largos. */
const MAX_POINTS = 200;

/** Vista simplificada de la ruta (sin teselas). El mapa real llegará con MapLibre. */
export function RouteMap({ route, height = 190 }: { route: { lat: number; lon: number }[]; height?: number }) {
  const { c } = useTheme();
  const W = 340;
  const H = height;
  const points = downsample(route, MAX_POINTS);
  const { minLat, maxLat, minLon, maxLon } = points.reduce(
    (b, p) => ({
      minLat: Math.min(b.minLat, p.lat),
      maxLat: Math.max(b.maxLat, p.lat),
      minLon: Math.min(b.minLon, p.lon),
      maxLon: Math.max(b.maxLon, p.lon),
    }),
    { minLat: points[0].lat, maxLat: points[0].lat, minLon: points[0].lon, maxLon: points[0].lon },
  );
  const k = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180)); // corrige la deformación en longitud
  const spanX = (maxLon - minLon) * k || 1e-6;
  const spanY = maxLat - minLat || 1e-6;
  const pad = 18;
  const scale = Math.min((W - pad * 2) / spanX, (H - pad * 2) / spanY);
  const ox = (W - spanX * scale) / 2;
  const oy = (H - spanY * scale) / 2;
  const pts = points.map((p) => ({
    x: ox + (p.lon - minLon) * k * scale,
    y: oy + (maxLat - p.lat) * scale,
  }));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Recorrido de la sesión"
      style={{ height, borderRadius: radius.md, backgroundColor: c.surfaceAlt, overflow: "hidden" }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet">
        <Polyline points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={c.brand} strokeWidth={4} strokeLinejoin="round" strokeLinecap="round" />
        <Circle cx={pts[0].x} cy={pts[0].y} r={7} fill={c.success} stroke={c.bg} strokeWidth={2} />
        <Circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r={7} fill={c.text} stroke={c.bg} strokeWidth={2} />
      </Svg>
    </View>
  );
}
