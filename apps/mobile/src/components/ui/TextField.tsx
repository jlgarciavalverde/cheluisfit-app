import { useState } from "react";
import { TextInput, type TextInputProps, View } from "react-native";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, typeScale } from "@/theme/tokens";
import { Text } from "./Text";

export function TextField({
  label,
  suffix,
  hint,
  error,
  style,
  ...rest
}: TextInputProps & { label: string; suffix?: string; hint?: string; error?: string }) {
  const { c } = useTheme();
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: space.xs, flex: 1 }}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          minHeight: 52,
          paddingHorizontal: space.lg,
          borderRadius: radius.md,
          backgroundColor: c.surface,
          borderWidth: 2,
          borderColor: error ? c.danger : focus ? c.brand : c.border,
        }}
      >
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={c.faint}
          {...rest}
          onFocus={(e) => {
            setFocus(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            rest.onBlur?.(e);
          }}
          style={[
            {
              flex: 1,
              minWidth: 0,
              color: c.text,
              ...typeScale.input,
              paddingVertical: 12,
              outlineStyle: "none",
            } as object,
            style,
          ]}
        />
        {suffix ? (
          <Text variant="body" color="muted">
            {suffix}
          </Text>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
