import { View } from "react-native";
import { space } from "@/theme/tokens";
import { ActionRow } from "../ui/ActionRow";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";

/** Hoja para elegir con qué otro ejercicio del entreno enlazar una superserie. */
export function LinkSupersetSheet({
  visible,
  onClose,
  exercises,
  excludeIndex,
  onLink,
}: {
  visible: boolean;
  onClose: () => void;
  exercises: { id: string; name: string }[];
  /** Índice del ejercicio actual: no se ofrece como opción. */
  excludeIndex: number;
  onLink: (index: number) => void;
}) {
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Enlazar en superserie" subtitle="Elige el ejercicio que harás justo después">
      <View style={{ gap: space.sm }}>
        {exercises.map((e, i) =>
          i === excludeIndex ? null : (
            <ActionRow key={e.id} testID={`link-with-${i}`} label={e.name} icon="link-outline" onPress={() => onLink(i)} />
          ),
        )}
        <Button label="Cancelar" variant="ghost" fullWidth onPress={onClose} />
      </View>
    </BottomSheet>
  );
}
