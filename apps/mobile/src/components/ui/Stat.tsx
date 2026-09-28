import { Children, cloneElement, isValidElement } from "react";
import { View, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { type Palette, radius, space, type TextVariant } from "@/theme/tokens";
import { Text } from "./Text";

export type StatSize = "sm" | "md" | "lg" | "xl";

const VALUE: Record<StatSize, TextVariant> = { sm: "heading", md: "numeralS", lg: "display", xl: "numeralXL" };

/**
 * «Número + etiqueta»: distancia, tiempo, kcal, kg… Único componente para todas las cifras
 * de resumen (antes había seis versiones distintas).
 */
export function Stat({
  value,
  unit,
  label,
  size = "sm",
  color = "text",
  labelColor = "muted",
  align = "left",
  boxed,
  style,
  testID,
  valueTestID,
}: {
  value: string;
  unit?: string;
  label: string;
  size?: StatSize;
  color?: keyof Palette;
  labelColor?: keyof Palette;
  align?: "left" | "center";
  /** Dentro de una caja con fondo (cuadrículas de métricas). */
  boxed?: boolean;
  style?: ViewStyle;
  testID?: string;
  valueTestID?: string;
}) {
  const { c } = useTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${value}${unit ? ` ${unit}` : ""}`}
      style={[
        { gap: space.hair, alignItems: align === "center" ? "center" : "flex-start" },
        boxed && { padding: space.md, borderRadius: radius.md, backgroundColor: c.surfaceAlt },
        style,
      ]}
    >
      <Text variant={VALUE[size]} color={color} tabular testID={valueTestID}>
        {value}
        {unit ? (
          <Text variant={size === "sm" ? "caption" : "control"} color="muted">
            {" "}
            {unit}
          </Text>
        ) : null}
      </Text>
      <Text variant="caption" color={labelColor}>
        {label}
      </Text>
    </View>
  );
}

/** Cuadrícula de `Stat` con cajas de igual ancho (2 o 3 columnas). */
export function StatGrid({ children, columns = 3 }: { children: React.ReactNode; columns?: 2 | 3 }) {
  const basis = columns === 2 ? "47%" : "30%";
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {Children.map(children, (child) =>
        isValidElement<{ style?: ViewStyle; boxed?: boolean }>(child)
          ? cloneElement(child, { boxed: true, style: { flexBasis: basis, flexGrow: 1, ...(child.props.style ?? {}) } })
          : child,
      )}
    </View>
  );
}
