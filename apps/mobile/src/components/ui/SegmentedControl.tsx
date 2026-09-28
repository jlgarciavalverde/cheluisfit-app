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
  role = "tabs",
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  testID?: string;
  /** Ancho fijo recomendado cuando va en una fila con otros elementos: sin él, los segmentos
   * `flex: 1` colapsan al mínimo del contenido y las etiquetas largas se cortan (visto de verdad
   * con el selector Garmin/Strava de Running: 97 px para dos segmentos). */
  style?: StyleProp<ViewStyle>;
  /**
   * `tabs` (por defecto) cuando cambia lo que se ve debajo (Sesiones/Plantillas/Progreso);
   * `radio` cuando es elegir un valor de un formulario (sexo, escala de esfuerzo, tema…): así el
   * lector de pantalla anuncia «opción, seleccionada» en vez de «pestaña».
   */
  role?: "tabs" | "radio";
  /** Nombre del grupo para el lector de pantalla (recomendado con `role="radio"`). */
  label?: string;
}) {
  const { c } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole={role === "radio" ? "radiogroup" : "tablist"}
      accessibilityLabel={label}
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
            accessibilityRole={role === "radio" ? "radio" : "tab"}
            accessibilityState={role === "radio" ? { checked: on } : { selected: on }}
            aria-checked={role === "radio" ? on : undefined}
            onPress={() => {
              haptic.tap();
              onChange(o.value);
            }}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: touch.min,
              paddingHorizontal: space.sm,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.pill,
              backgroundColor: on ? c.surface : "transparent",
              // Borde siempre presente (transparente si no está elegido): antes aparecía solo en
              // el elegido y movía su contenido 1 px.
              borderWidth: 1,
              borderColor: on ? c.border : "transparent",
            }}
          >
            {/* Una línea: una etiqueta larga se encoge (nativo) o se corta, sin hacer más alto el control. */}
            <Text variant="control" color={on ? "text" : "muted"} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
