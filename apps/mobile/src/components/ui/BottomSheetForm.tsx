import { useEffect, useState } from "react";
import { View } from "react-native";
import { space } from "@/theme/tokens";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { TextField } from "./TextField";

/** Hoja con un único campo de texto y botones Cancelar/Guardar. */
export function BottomSheetForm({
  visible,
  title,
  subtitle,
  label,
  placeholder,
  initialValue,
  confirmLabel,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  label: string;
  placeholder?: string;
  initialValue: string;
  confirmLabel: string;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);
  const ok = value.trim().length > 0;
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <View style={{ flexDirection: "row" }}>
        <TextField
          testID="sheet-input"
          label={label}
          value={value}
          onChangeText={setValue}
          placeholder={placeholder}
          autoFocus
          maxLength={60}
          onSubmitEditing={() => ok && onSubmit(value)}
        />
      </View>
      <View style={{ gap: space.sm }}>
        <Button testID="sheet-confirm" label={confirmLabel} fullWidth disabled={!ok} onPress={() => onSubmit(value)} />
        <Button label="Cancelar" variant="ghost" fullWidth onPress={onClose} />
      </View>
    </BottomSheet>
  );
}
