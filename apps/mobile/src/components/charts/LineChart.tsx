import { useState } from "react";
import { View } from "react-native";
import Svg, { Circle, Line, Polyline } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";
import type { Palette } from "@/theme/tokens";
import { Text } from "../ui/Text";

/**
 * Línea de una serie con puntos. `invert` dibuja los valores menores arriba
 * (útil para el ritmo: menos segundos por km = más rápido).
 */
export function LineChart({
  values,
  labels,
  format,
  invert,
  color = "brand",
  height = 120,
  summary,
}: {
  values: (number | null)[];
  labels: string[];
  format: (v: number) => string;
  invert?: boolean;
  color?: keyof Palette;
  height?: number;
  summary: string;
}) {
  const { c } = useTheme();
  const [w, setW] = useState(0);
  const nums = values.filter((v): v is number => v !== null && v > 0);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const pad = 14;
  const xs = (i: number) => (values.length <= 1 ? w / 2 : pad + (i * (w - pad * 2)) / (values.length - 1));
  const ys = (v: number) => {
    const t = max === min ? 0.5 : (v - min) / (max - min);
    const k = invert ? t : 1 - t;
    return pad + k * (height - pad * 2);
  };
  const pts = values.map((v, i) => (v ? { x: xs(i), y: ys(v), v, i } : null));
  const line = pts.filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={{ gap: 6 }}>
      <View onLayout={(e) => setW(e.nativeEvent.layout.width)} style={{ height }}>
        {w > 0 && line.length > 0 ? (
          <Svg width={w} height={height}>
            {[0.25, 0.5, 0.75].map((t) => (
              <Line key={t} x1={0} x2={w} y1={pad + t * (height - pad * 2)} y2={pad + t * (height - pad * 2)} stroke={c.border} strokeWidth={1} strokeDasharray="3 5" />
            ))}
            <Polyline points={line.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke={c[color]} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />
            {line.map((p) => (
              <Circle key={p.i} cx={p.x} cy={p.y} r={p.i === line[line.length - 1].i ? 6 : 4} fill={p.i === line[line.length - 1].i ? c[color] : c.bg} stroke={c[color]} strokeWidth={2} />
            ))}
          </Svg>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {labels.map((l, i) => (
          <Text key={`${l}-${i}`} variant="micro" color="faint" align="center">
            {l}
          </Text>
        ))}
      </View>
      {nums.length > 0 ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text variant="caption" color="muted" tabular>
            {invert ? "Mejor" : "Mínimo"}: {format(invert ? min : min)}
          </Text>
          <Text variant="caption" color="muted" tabular>
            Última: {format(line[line.length - 1].v)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
