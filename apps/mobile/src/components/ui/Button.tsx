import { ActivityIndicator, Pressable, type StyleProp, View, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { type IconSize, interaction, radius, space, touch } from "@/theme/tokens";
import { haptic } from "./haptics";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const HEIGHT = { sm: touch.min, md: touch.comfortable, lg: 56 } as const;

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  icon,
  loading,
  disabled,
  fullWidth,
  style,
  testID,
}: ButtonProps) {
  const { c } = useTheme();
  const solid = variant === "primary" || variant === "danger";
  // Deshabilitado: los botones rellenos pasan a un gris neutro (no una marca «apagada»).
  const neutral = !!disabled && solid;
  const bg = neutral
    ? c.surfaceAlt
    : variant === "primary"
      ? c.brand
      : variant === "secondary"
        ? c.surfaceAlt
        : variant === "danger"
          ? c.dangerSoft
          : "transparent";
  const fg = neutral
    ? "faint"
    : variant === "primary"
      ? "onBrand"
      : variant === "ghost"
        ? "brandText"
        : variant === "danger"
          ? "danger"
          : "text";
  const off = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      accessibilityLabel={label}
      disabled={off}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      style={({ pressed }) => [
        {
          minHeight: HEIGHT[size],
          paddingHorizontal: size === "sm" ? space.md : space.xl,
          borderRadius: radius.pill,
          backgroundColor: bg,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: space.sm,
          opacity: disabled && !neutral ? interaction.disabledOpacity : pressed ? interaction.pressedOpacity : 1,
        },
        fullWidth && { alignSelf: "stretch" },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={c[fg]} />
      ) : (
        <>
          {icon && <Icon name={icon} size={size === "sm" ? "sm" : "md"} color={fg} />}
          <Text variant={size === "sm" ? "control" : "bodyStrong"} color={fg} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  color = "text",
  filled,
  size = "lg",
  testID,
}: {
  icon: IconName;
  /** Obligatorio: el botón no tiene texto visible. */
  label: string;
  onPress?: () => void;
  color?: "text" | "muted" | "brandText" | "danger" | "onBrand";
  filled?: boolean | "brand";
  size?: IconSize;
  testID?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        onPress?.();
      }}
      hitSlop={4}
      style={({ pressed }) => ({
        width: touch.comfortable,
        height: touch.comfortable,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: filled === "brand" ? c.brand : filled ? c.surfaceAlt : "transparent",
        opacity: pressed ? interaction.pressedOpacity : 1,
      })}
    >
      <View>
        <Icon name={icon} size={size} color={color} />
      </View>
    </Pressable>
  );
}
