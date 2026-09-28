import { useState } from "react";
import { Pressable, View } from "react-native";
import { space, touch } from "@/theme/tokens";
import { haptic } from "./haptics";
import { Icon } from "./Icon";
import { Overline } from "./Section";
import { Text } from "./Text";

/**
 * Subsección plegable dentro de una pantalla: cabecera pulsable (título + subtítulo opcional +
 * chevron) que muestra/oculta su contenido. Para pantallas con demasiado contenido plano.
 */
export function CollapsibleSection({
  title,
  subtitle,
  badge,
  kind = "overline",
  defaultOpen = false,
  gap = space.sm,
  children,
  testID,
}: {
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  /** `overline` (mayúsculas pequeñas, grupos de listas) o `content` (título grande). */
  kind?: "content" | "overline";
  defaultOpen?: boolean;
  gap?: number;
  children: React.ReactNode;
  testID?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={{ gap }} testID={testID}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${open ? "Contraer" : "Expandir"}`}
        onPress={() => {
          haptic.tap();
          setOpen((v) => !v);
        }}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: space.sm,
          minHeight: touch.min,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <View style={{ flex: 1, gap: space.hair }}>
          {kind === "overline" ? (
            <Overline header={false}>{title}</Overline>
          ) : (
            <Text variant="heading">{title}</Text>
          )}
          {subtitle ? (
            <Text variant="caption" color="muted">
              {subtitle}
            </Text>
          ) : null}
        </View>
        {badge}
        <Icon name={open ? "chevron-up" : "chevron-down"} size="sm" color="muted" />
      </Pressable>
      {open ? <View style={{ gap: space.sm }}>{children}</View> : null}
    </View>
  );
}
