import { Pressable, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { interaction, radius, space, touch } from "@/theme/tokens";
import { haptic } from "./haptics";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

/** Acción de un menú en una hoja inferior: icono + texto alineados a la izquierda (más ligera que un botón). */
export function ActionRow({
  icon,
  label,
  hint,
  onPress,
  tone = "default",
  disabled,
  selected,
  testID,
}: {
  icon?: IconName;
  label: string;
  hint?: string;
  onPress: () => void;
  tone?: "default" | "danger";
  disabled?: boolean;
  /** Marca la opción vigente (p. ej. el tipo de serie actual). */
  selected?: boolean;
  testID?: string;
}) {
  const { c } = useTheme();
  const danger = tone === "danger";
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        minHeight: touch.comfortable + 4,
        paddingHorizontal: space.lg,
        borderRadius: radius.md,
        backgroundColor: danger ? c.dangerSoft : selected ? c.brandSoft : c.surfaceAlt,
        opacity: disabled ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
      })}
    >
      {icon ? <Icon name={icon} size="md" color={danger ? "danger" : selected ? "brandText" : "muted"} /> : null}
      <View style={{ flex: 1, paddingVertical: space.sm }}>
        <Text variant="bodyStrong" color={danger ? "danger" : selected ? "brandText" : "text"}>
          {label}
        </Text>
        {hint ? (
          <Text variant="caption" color="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="checkmark" size="md" color="brandText" /> : null}
    </Pressable>
  );
}

export function ActionList({ children }: { children: React.ReactNode }) {
  return <View style={{ gap: space.sm }}>{children}</View>;
}
