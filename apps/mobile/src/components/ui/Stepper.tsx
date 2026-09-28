import { View } from "react-native";
import { space } from "@/theme/tokens";
import { IconButton } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

/** Selector numérico con − y +: series, repeticiones… */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 99,
  step = 1,
  layout = "stacked",
  format = (n: number) => String(n),
  icon,
  decLabel,
  incLabel,
  valueLabel,
  minValueWidth = 32,
  testID,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** `stacked`: etiqueta encima; `inline`: etiqueta a la izquierda. */
  layout?: "stacked" | "inline";
  format?: (n: number) => string;
  /** Icono a la izquierda de la etiqueta (solo `inline`). */
  icon?: IconName;
  /** Etiquetas accesibles de los botones y del valor (por defecto «Menos/Más {etiqueta}»). */
  decLabel?: string;
  incLabel?: string;
  valueLabel?: string;
  minValueWidth?: number;
  testID?: string;
}) {
  const lower = label.toLowerCase();
  const controls = (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      <IconButton icon="remove-circle-outline" label={decLabel ?? `Menos ${lower}`} color="muted" onPress={() => onChange(Math.max(min, value - step))} />
      <Text variant="heading" tabular testID={testID} accessibilityLabel={valueLabel ?? `${format(value)} ${lower}`} style={{ minWidth: minValueWidth, textAlign: "center" }}>
        {format(value)}
      </Text>
      <IconButton icon="add-circle-outline" label={incLabel ?? `Más ${lower}`} color="brandText" onPress={() => onChange(Math.min(max, value + step))} />
    </View>
  );
  if (layout === "inline") {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        {icon ? <Icon name={icon} size="md" color="brandText" /> : null}
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {label}
        </Text>
        {controls}
      </View>
    );
  }
  return (
    <View style={{ flex: 1, gap: space.hair }}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      {controls}
    </View>
  );
}
