import { useState } from "react";
import { Pressable, TextInput, type TextInputProps, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, typeScale } from "@/theme/tokens";
import { Icon } from "./Icon";

/** Alto fijo: la caja mide siempre lo mismo, escribas lo que escribas (vacía, llena, con emojis). */
const HEIGHT = 52;

/**
 * Buscador único de la app. Mide siempre lo mismo:
 * - **alto fijo** (antes `minHeight` + `flex: 1`: en una columna con altura acotada —el selector de
 *   ejercicios, el buscador de personas— crecía en vertical cuanto menos resultados había);
 * - el hueco del botón × está **siempre reservado** (invisible si no hay texto), así que el
 *   área de escritura no cambia de ancho al aparecer;
 * - letra con tope de tamaño (`maxFontSizeMultiplier`) para que la letra grande del sistema no
 *   desborde la caja.
 * Ocupa el ancho de su contenedor; en una fila junto a botones, envolverlo en `<View style={{ flex: 1 }}>`.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  autoFocus,
  onFocus,
  onBlur,
  ...rest
}: TextInputProps & { value: string; onChangeText: (t: string) => void }) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        alignSelf: "stretch",
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        height: HEIGHT,
        paddingLeft: space.lg,
        paddingRight: space.xs,
        borderRadius: radius.pill,
        backgroundColor: c.surface,
        borderWidth: 2,
        borderColor: focused ? c.brand : c.border,
      }}
    >
      <Icon name="search" size="md" color="muted" />
      <TextInput
        {...rest}
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        autoFocus={autoFocus}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        style={
          {
            flex: 1,
            minWidth: 0,
            height: HEIGHT - 4,
            color: c.text,
            ...typeScale.input,
            paddingVertical: 0,
            outlineStyle: "none",
          } as object
        }
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Borrar búsqueda"
        accessibilityElementsHidden={!value}
        importantForAccessibility={value ? "auto" : "no-hide-descendants"}
        disabled={!value}
        onPress={() => onChangeText("")}
        style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", opacity: value ? 1 : 0 }}
      >
        <Icon name="close-circle" size="md" color="faint" />
      </Pressable>
    </View>
  );
}
