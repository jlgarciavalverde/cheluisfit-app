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

export function Text({
  variant = "body",
  color = "text",
  tabular,
  align,
  style,
  ...rest
}: TextProps) {
  const { c } = useTheme();
  return (
    <RNText
      {...rest}
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
