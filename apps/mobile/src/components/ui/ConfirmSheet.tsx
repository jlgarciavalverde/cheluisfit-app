import { View } from "react-native";
import { space } from "@/theme/tokens";
import { BottomSheet } from "./BottomSheet";
import { Button } from "./Button";
import { Text } from "./Text";

/**
 * Confirmación antes de una acción que no se puede deshacer (vaciar datos, descartar un entreno,
 * borrar algo del servidor). Mismo pie que `BottomSheetForm`: acción principal + «Cancelar».
 * Para lo que sí se puede deshacer (quitar una comida, borrar una sesión local) mejor un toast con
 * «Deshacer», que no interrumpe.
 */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  tone = "danger",
  onConfirm,
  onClose,
  testID,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: "danger" | "default";
  onConfirm: () => void;
  onClose: () => void;
  testID?: string;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <Text variant="body" color="muted">
        {message}
      </Text>
      <View style={{ gap: space.sm }}>
        <Button
          testID={testID ? `${testID}-confirm` : "confirm-sheet-confirm"}
          label={confirmLabel}
          variant={tone === "danger" ? "danger" : "primary"}
          fullWidth
          onPress={() => {
            onClose();
            onConfirm();
          }}
        />
        <Button testID={testID ? `${testID}-cancel` : "confirm-sheet-cancel"} label="Cancelar" variant="ghost" fullWidth onPress={onClose} />
      </View>
    </BottomSheet>
  );
}
