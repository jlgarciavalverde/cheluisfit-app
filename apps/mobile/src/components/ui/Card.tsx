import { Pressable, type PressableProps, View, type ViewProps } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { interaction, radius, space } from "@/theme/tokens";

export type CardTone = "surface" | "alt";
/** Borde de color para destacar una tarjeta (la actual, la que tiene récord…). */
export type CardAccent = "brand" | "warning" | "success" | "danger";

function useCardStyle(tone: CardTone, padded: boolean, accent?: CardAccent) {
  const { c } = useTheme();
  return {
    backgroundColor: tone === "alt" ? c.surfaceAlt : c.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: accent ? c[accent] : c.border,
    ...(padded ? { padding: space.lg } : null),
  };
}

export function Card({
  style,
  padded = true,
  tone = "surface",
  accent,
  ...rest
}: ViewProps & { padded?: boolean; tone?: CardTone; accent?: CardAccent }) {
  return <View {...rest} style={[useCardStyle(tone, padded, accent), style]} />;
}

/** Tarjeta pulsable con el mismo efecto de pulsación en toda la app. */
export function PressableCard({
  style,
  padded = true,
  tone = "surface",
  accent,
  ...rest
}: Omit<PressableProps, "style"> & { style?: ViewProps["style"]; padded?: boolean; tone?: CardTone; accent?: CardAccent }) {
  const base = useCardStyle(tone, padded, accent);
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      style={({ pressed }) => [base, { opacity: pressed ? interaction.pressedOpacity : 1 }, style]}
    />
  );
}
