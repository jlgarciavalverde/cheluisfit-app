import { Pressable } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { interaction, radius, space, touch } from "@/theme/tokens";
import { haptic } from "./haptics";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export function Chip({
  label,
  selected,
  onPress,
  icon,
  testID,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  testID?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      style={({ pressed }) => ({
        minHeight: touch.min,
        // En filas que saltan de línea (flexWrap) Android encogía el texto y lo partía.
        flexShrink: 0,
        maxWidth: "100%",
        paddingHorizontal: space.lg,
        borderRadius: radius.pill,
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        backgroundColor: selected ? c.brandSoft : c.surfaceAlt,
        borderWidth: 1,
        borderColor: selected ? c.brand : c.border,
        opacity: pressed ? interaction.pressedOpacity : 1,
      })}
    >
      {icon && <Icon name={icon} size="xs" color={selected ? "brandText" : "muted"} />}
      <Text variant="control" numberOfLines={1} color={selected ? "brandText" : "muted"} style={{ flexShrink: 1 }}>
        {label}
      </Text>
    </Pressable>
  );
}
