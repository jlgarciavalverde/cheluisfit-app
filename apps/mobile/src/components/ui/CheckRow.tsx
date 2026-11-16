import { Pressable, View } from "react-native";
import { space } from "@/theme/tokens";
import { haptic } from "./haptics";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** Casilla o interruptor con texto y ayuda. */
export function CheckRow({
  label,
  hint,
  checked,
  onChange,
  kind = "checkbox",
  testID,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  kind?: "checkbox" | "switch";
  testID?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={kind}
      accessibilityLabel={label}
      aria-checked={checked}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        if (disabled) return;
        haptic.tap();
        onChange(!checked);
      }}
      style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, opacity: disabled ? 0.55 : 1 }}
    >
      <Icon name={checked ? "checkbox" : "square-outline"} size="lg" color={disabled ? "muted" : checked ? "brandText" : "muted"} />
      <View style={{ flex: 1, gap: space.hair }}>
        <Text variant="bodyStrong">{label}</Text>
        {hint ? (
          <Text variant="caption" color="muted">
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
