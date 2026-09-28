import { View } from "react-native";
import { space } from "@/theme/tokens";
import { ActionRow } from "../ui/ActionRow";
import { BottomSheet } from "../ui/BottomSheet";

/** Hoja «⋯» del ejercicio en curso: sustituir, calentamiento, discos, superserie, nota, mover, quitar. */
export function WorkoutExerciseMenu({
  visible,
  onClose,
  exerciseName,
  hasNote,
  canWarmup,
  canPlates,
  hasSuperset,
  canLink,
  onReplace,
  onWarmup,
  onPlates,
  onUnlink,
  onLink,
  onNote,
  onMoveBack,
  onMoveForward,
  onHistory,
  onRemove,
}: {
  visible: boolean;
  onClose: () => void;
  exerciseName: string;
  hasNote: boolean;
  canWarmup: boolean;
  canPlates: boolean;
  hasSuperset: boolean;
  canLink: boolean;
  onReplace: () => void;
  onWarmup: () => void;
  onPlates: () => void;
  onUnlink: () => void;
  onLink: () => void;
  onNote: () => void;
  onMoveBack: () => void;
  onMoveForward: () => void;
  onHistory: () => void;
  onRemove: () => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title={exerciseName} subtitle="Opciones">
      <View style={{ gap: space.sm }}>
        <ActionRow testID="menu-replace" label="Sustituir por otro del mismo músculo" icon="swap-horizontal" onPress={onReplace} />
        {canWarmup ? <ActionRow testID="menu-warmup" label="Generar calentamiento" icon="flame-outline" onPress={onWarmup} /> : null}
        {canPlates ? <ActionRow testID="menu-plates" label="Calculadora de discos" icon="calculator-outline" onPress={onPlates} /> : null}
        {hasSuperset ? (
          <ActionRow testID="menu-unlink" label="Quitar de la superserie" icon="unlink-outline" onPress={onUnlink} />
        ) : canLink ? (
          <ActionRow testID="menu-link" label="Enlazar en superserie…" icon="link-outline" onPress={onLink} />
        ) : null}
        <ActionRow label={hasNote ? "Editar nota" : "Añadir nota"} icon="create-outline" onPress={onNote} />
        <ActionRow label="Mover antes" icon="arrow-back" onPress={onMoveBack} />
        <ActionRow label="Mover después" icon="arrow-forward" onPress={onMoveForward} />
        <ActionRow label="Ver historial y récords" icon="stats-chart-outline" onPress={onHistory} />
        <ActionRow testID="menu-remove" label="Quitar del entrenamiento" icon="trash-outline" tone="danger" onPress={onRemove} />
      </View>
    </BottomSheet>
  );
}
