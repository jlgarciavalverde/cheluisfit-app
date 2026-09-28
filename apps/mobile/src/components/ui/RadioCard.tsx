import { Pressable, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { interaction, radius, space } from "@/theme/tokens";
import { haptic } from "./haptics";
import { Icon } from "./Icon";
import { Text } from "./Text";

/** Opción única dentro de un grupo: nivel de actividad, objetivo… Usar dentro de `RadioGroup`. */
export function RadioCard({
  selected,
  title,
  hint,
  onPress,
  leading,
  testID,
}: {
  selected: boolean;
  title: string;
  hint?: string;
  onPress: () => void;
  leading?: React.ReactNode;
  testID?: string;
}) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      aria-checked={selected}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        minHeight: 60,
        padding: space.md,
        borderRadius: radius.md,
        borderWidth: 2,
        borderColor: selected ? c.brand : c.border,
        backgroundColor: selected ? c.brandSoft : c.surface,
        opacity: pressed ? interaction.pressedOpacity : 1,
      })}
    >
      {leading}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={selected ? "brandText" : "text"}>
          {title}
        </Text>
        {hint ? (
          <Text variant="caption" color="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      <Icon name={selected ? "radio-button-on" : "radio-button-off"} size="md" color={selected ? "brandText" : "faint"} />
    </Pressable>
  );
}

export function RadioGroup({ children, label }: { children: React.ReactNode; label?: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ gap: space.md }}>
      {children}
    </View>
  );
}
