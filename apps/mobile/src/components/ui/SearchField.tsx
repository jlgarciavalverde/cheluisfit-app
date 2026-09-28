import { Pressable, TextInput, type TextInputProps, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, typeScale } from "@/theme/tokens";
import { Icon } from "./Icon";

export function SearchField({
  value,
  onChangeText,
  placeholder,
  autoFocus,
  ...rest
}: TextInputProps & { value: string; onChangeText: (t: string) => void }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: space.sm,
        minHeight: 52,
        paddingLeft: space.lg,
        paddingRight: space.sm,
        borderRadius: radius.pill,
        backgroundColor: c.surface,
        borderWidth: 2,
        borderColor: c.border,
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
        style={
          {
            flex: 1,
            color: c.text,
            ...typeScale.input,
            paddingVertical: 10,
            outlineStyle: "none",
          } as object
        }
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Borrar búsqueda"
          onPress={() => onChangeText("")}
          style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="close-circle" size="md" color="faint" />
        </Pressable>
      ) : null}
    </View>
  );
}
