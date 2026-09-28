import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, type Palette } from "@/theme/tokens";
import { Text } from "../ui/Text";

export interface Bar {
  label: string;
  value: number;
  /** Resalta la barra (p. ej. la semana o el día actual). */
  highlight?: boolean;
  color?: keyof Palette;
}

/** Gráfico de barras verticales sencillo; accesible mediante un resumen en texto. */
export function BarChart({
  data,
  height = 110,
  format = (v: number) => String(Math.round(v)),
  summary,
  showValues = "highlight",
  target,
}: {
  data: Bar[];
  height?: number;
  format?: (v: number) => string;
  /** Texto para lectores de pantalla (el gráfico en sí no es navegable). */
  summary: string;
  showValues?: "all" | "highlight" | "none";
  /** Línea horizontal discontinua (p. ej. el objetivo de kcal). */
  target?: number;
}) {
  const { c } = useTheme();
  const max = Math.max(...data.map((d) => d.value), target ?? 0, 1);
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={summary} style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height, gap: 6 }}>
        {target ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: (target / max) * (height - 18),
              borderTopWidth: 1.5,
              borderStyle: "dashed",
              borderColor: c.faint,
            }}
          />
        ) : null}
        {data.map((d) => {
          const h = Math.max(d.value > 0 ? 4 : 2, (d.value / max) * (height - 18));
          const show = showValues === "all" || (showValues === "highlight" && d.highlight);
          return (
            <View key={d.label} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              {show && d.value > 0 ? (
                <Text variant="micro" color="muted" tabular>
                  {format(d.value)}
                </Text>
              ) : null}
              <View
                style={{
                  width: "100%",
                  maxWidth: 34,
                  height: h,
                  borderRadius: radius.xs,
                  backgroundColor: d.value === 0 ? c.surfaceAlt : d.highlight ? c[d.color ?? "brand"] : c.brandSoft,
                  borderWidth: d.highlight || d.value === 0 ? 0 : 1,
                  borderColor: c.brand,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {data.map((d) => (
          <Text
            key={d.label}
            variant="micro"
            color={d.highlight ? "text" : "faint"}
            align="center"
            style={{ flex: 1 }}
          >
            {d.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
