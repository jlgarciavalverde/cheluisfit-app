import { type TextStyle, View } from "react-native";
import { type Palette, space } from "@/theme/tokens";
import { Button } from "./Button";
import { Text } from "./Text";

/**
 * Rótulo pequeño en mayúsculas: grupos de una lista, etiqueta dentro de una tarjeta o cabecera
 * de columna de una tabla (`header={false}`).
 */
export function Overline({
  children,
  color = "muted",
  header = true,
  style,
}: {
  children: React.ReactNode;
  color?: keyof Palette;
  header?: boolean;
  style?: TextStyle;
}) {
  return (
    <Text variant="label" color={color} accessibilityRole={header ? "header" : undefined} style={style}>
      {children}
    </Text>
  );
}

/**
 * Grupo de controles de un formulario con su etiqueta (mismo aspecto que la etiqueta de un
 * `TextField`): chips, segmentos, selectores de día…
 */
export function FieldGroup({
  label,
  hint,
  gap = space.sm,
  children,
  testID,
}: {
  label: string;
  hint?: string;
  gap?: number;
  children: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={{ gap }} testID={testID}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      {children}
      {hint ? (
        <Text variant="caption" color="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Sección de una pantalla. Regla: `content` (título grande) para bloques de contenido y formularios;
 * `overline` (mayúsculas pequeñas) para agrupar listas.
 */
export function Section({
  title,
  kind = "content",
  subtitle,
  action,
  gap = space.md,
  children,
  testID,
}: {
  title: string;
  kind?: "content" | "overline";
  subtitle?: string;
  action?: { label: string; onPress: () => void } | React.ReactNode;
  gap?: number;
  children?: React.ReactNode;
  testID?: string;
}) {
  const actionNode =
    action && typeof action === "object" && "label" in (action as object) && "onPress" in (action as object) ? (
      <Button label={(action as { label: string }).label} variant="ghost" size="sm" onPress={(action as { onPress: () => void }).onPress} />
    ) : (
      (action as React.ReactNode)
    );
  return (
    <View style={{ gap }} testID={testID}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <View style={{ flex: 1, gap: space.hair }}>
          {kind === "overline" ? (
            <Overline>{title}</Overline>
          ) : (
            <Text variant="heading" accessibilityRole="header">
              {title}
            </Text>
          )}
          {subtitle ? (
            <Text variant="caption" color="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {actionNode}
      </View>
      {children}
    </View>
  );
}
