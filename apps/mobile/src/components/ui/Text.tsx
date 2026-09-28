import { Text as RNText, type TextProps as RNTextProps } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { type Palette, type TextVariant, typeScale } from "@/theme/tokens";

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: keyof Palette;
  /** Cifras de ancho fijo (para que los números no «bailen»). */
  tabular?: boolean;
  align?: "left" | "center" | "right";
}

/**
 * Tope por defecto al tamaño de letra del sistema (Android permite subirlo mucho): sin él, con la
 * letra al 130 % o más las filas con etiquetas y botones se desbordaban. Se puede bajar por
 * elemento (números grandes, celdas de tabla) pasando `maxFontSizeMultiplier`.
 */
const DEFAULT_MAX_FONT_SCALE = 1.3;

export function Text({
  variant = "body",
  color = "text",
  tabular,
  align,
  style,
  maxFontSizeMultiplier = DEFAULT_MAX_FONT_SCALE,
  ...rest
}: TextProps) {
  const { c } = useTheme();
  return (
    <RNText
      {...rest}
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={[
        typeScale[variant],
        { color: c[color] },
        tabular && { fontVariant: ["tabular-nums"] },
        align && { textAlign: align },
        style,
      ]}
    />
  );
}
