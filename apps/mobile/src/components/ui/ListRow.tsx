import { Children, cloneElement, isValidElement } from "react";
import { Pressable, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";
import { Card } from "./Card";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

/**
 * Fila estándar de lista: icono o miniatura, título, subtítulo, extremo derecho y chevron.
 * `trailing` va FUERA de la zona pulsable (así puede llevar botones sin anidar botones).
 */
export function ListRow({
  title,
  subtitle,
  meta,
  value,
  leading,
  icon,
  trailing,
  chevron,
  onPress,
  divider,
  titleLines = 2,
  minHeight = 60,
  testID,
  accessibilityLabel,
}: {
  title: string;
  subtitle?: string;
  /** Insignias u otra línea bajo el subtítulo. */
  meta?: React.ReactNode;
  /** Cifra a la derecha, dentro de la zona pulsable (p. ej. kcal). */
  value?: React.ReactNode;
  leading?: React.ReactNode;
  icon?: IconName;
  trailing?: React.ReactNode;
  chevron?: boolean;
  onPress?: () => void;
  /** Línea separadora encima (la pone `ListGroup`). */
  divider?: boolean;
  titleLines?: number;
  minHeight?: number;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const body = (
    <>
      {leading ?? (icon ? <Icon name={icon} size="md" color="brandText" /> : null)}
      <View style={{ flex: 1, gap: space.hair }}>
        <Text variant="bodyStrong" numberOfLines={titleLines}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" color="muted" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
        {meta}
      </View>
      {value}
      {chevron ? <Icon name="chevron-forward" size="sm" color="faint" /> : null}
    </>
  );
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: c.border,
      }}
    >
      {onPress ? (
        <Pressable
          testID={testID}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={onPress}
          style={({ pressed }) => ({
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            gap: space.md,
            minHeight,
            paddingVertical: space.sm,
            backgroundColor: pressed ? c.surfaceAlt : "transparent",
          })}
        >
          {body}
        </Pressable>
      ) : (
        <View
          testID={testID}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, minHeight, paddingVertical: space.sm }}
        >
          {body}
        </View>
      )}
      {trailing}
    </View>
  );
}

/** Lista dentro de una tarjeta, con separadores automáticos entre filas. */
export function ListGroup({ children, testID }: { children: React.ReactNode; testID?: string }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <Card padded={false} testID={testID}>
      <View style={{ paddingHorizontal: space.lg }}>
        {rows.map((row, i) => cloneElement(row as React.ReactElement<{ divider?: boolean }>, { divider: i > 0 }))}
      </View>
    </Card>
  );
}

export function Divider() {
  const { c } = useTheme();
  return <View style={{ height: 1, backgroundColor: c.border }} />;
}
