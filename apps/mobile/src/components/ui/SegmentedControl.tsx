import { Pressable, View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, touch } from "@/theme/tokens";
import { haptic } from "./haptics";
import { Text } from "./Text";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testID,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
  /** Ancho fijo recomendado cuando va en una fila con otros elementos: sin él, los segmentos
   * `flex: 1` colapsan al mínimo del contenido y las etiquetas largas se cortan (visto de verdad
   * con el selector Garmin/Strava de Running: 97 px para dos segmentos). */
  style?: StyleProp<ViewStyle>;
}) {
  const { c } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[
        {
          flexDirection: "row",
          backgroundColor: c.surfaceAlt,
          borderRadius: radius.pill,
          padding: space.xs,
        },
        style,
      ]}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              haptic.tap();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              minHeight: touch.min,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.pill,
              backgroundColor: on ? c.surface : "transparent",
              borderWidth: on ? 1 : 0,
              borderColor: c.border,
            }}
          >
            <Text variant="control" color={on ? "text" : "muted"}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
