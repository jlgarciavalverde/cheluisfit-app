import { View } from "react-native";
import { space } from "@/theme/tokens";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";

/** Hoja para terminar el entrenamiento: resumen de series hechas/pendientes, guardar o descartar. */
export function FinishWorkoutSheet({
  visible,
  onClose,
  workoutName,
  elapsedLabel,
  doneSets,
  pendingSets,
  onSave,
  onDiscard,
}: {
  visible: boolean;
  onClose: () => void;
  workoutName: string;
  elapsedLabel: string;
  doneSets: number;
  pendingSets: number;
  onSave: () => void;
  onDiscard: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Terminar entrenamiento" subtitle={`${workoutName} · ${elapsedLabel}`}>
      <View style={{ gap: space.md }}>
        <View style={{ flexDirection: "row", gap: space.lg }}>
          <View>
            <Text variant="display" tabular>
              {doneSets}
            </Text>
            <Text variant="caption" color="muted">
              series hechas
            </Text>
          </View>
          <View>
            <Text variant="display" tabular color={pendingSets > 0 ? "warning" : "text"}>
              {pendingSets}
            </Text>
            <Text variant="caption" color="muted">
              sin marcar
            </Text>
          </View>
        </View>
        {pendingSets > 0 ? (
          <Text variant="caption" color="warning" testID="finish-warning">
            Las series sin marcar se descartarán (y los ejercicios que se queden vacíos).
          </Text>
        ) : null}
        <Button testID="finish-save" label="Terminar y guardar" icon="checkmark" size="lg" fullWidth disabled={doneSets === 0} onPress={onSave} />
        <Button label="Seguir entrenando" variant="secondary" fullWidth onPress={onClose} />
        <Button testID="finish-discard" label="Descartar entrenamiento" icon="trash-outline" variant="danger" fullWidth onPress={onDiscard} />
      </View>
    </BottomSheet>
  );
}
