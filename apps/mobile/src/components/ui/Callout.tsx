import { View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { type Palette, radius, space } from "@/theme/tokens";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export type CalloutTone = "neutral" | "brand" | "success" | "warning" | "danger";

/**
 * Aviso o nota con icono, título y texto: advertencias, sugerencias, «plan vs. real»…
 * Un solo aspecto para todos (antes cada pantalla montaba el suyo con hex sueltos).
 */
export function Callout({
  tone = "neutral",
  icon,
  title,
  children,
  action,
  dense,
  testID,
}: {
  tone?: CalloutTone;
  icon?: IconName;
  title?: string;
  /** Texto (o contenido libre). */
  children?: React.ReactNode;
  /** Botones u otros controles bajo el texto. */
  action?: React.ReactNode;
  /** Texto pequeño (para notas largas o secundarias). */
  dense?: boolean;
  testID?: string;
}) {
  const { c } = useTheme();
  const map: Record<CalloutTone, { bg: keyof Palette; border: keyof Palette; fg: keyof Palette }> = {
    neutral: { bg: "surfaceAlt", border: "border", fg: "brandText" },
    brand: { bg: "brandSoft", border: "brand", fg: "brandText" },
    success: { bg: "successSoft", border: "success", fg: "success" },
    warning: { bg: "warningSoft", border: "warning", fg: "warning" },
    danger: { bg: "dangerSoft", border: "danger", fg: "danger" },
  };
  const t = map[tone];
  return (
    <View
      testID={testID}
      style={{
        gap: space.sm,
        padding: space.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        backgroundColor: c[t.bg],
        borderColor: c[t.border],
      }}
    >
      {title || icon ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          {icon ? <Icon name={icon} size="md" color={t.fg} /> : null}
          {title ? (
            <Text variant="bodyStrong" color={tone === "neutral" ? "text" : t.fg} style={{ flex: 1 }}>
              {title}
            </Text>
          ) : null}
        </View>
      ) : null}
      {typeof children === "string" ? (
        <Text variant={dense ? "caption" : "body"} color="muted">
          {children}
        </Text>
      ) : (
        children
      )}
      {action}
    </View>
  );
}
