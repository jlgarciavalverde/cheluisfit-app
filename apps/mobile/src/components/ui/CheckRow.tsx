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
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  kind?: "checkbox" | "switch";
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole={kind}
      aria-checked={checked}
      onPress={() => {
        haptic.tap();
        onChange(!checked);
      }}
      style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52 }}
    >
      <Icon name={checked ? "checkbox" : "square-outline"} size="lg" color={checked ? "brandText" : "muted"} />
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
