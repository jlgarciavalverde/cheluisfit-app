import { View } from "react-native";
import { addDays, dayLabel, shortDayLabel, todayKey } from "@/domain/dates";
import { space } from "@/theme/tokens";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";

/** Hoja inferior para elegir el día en que se planifica una plantilla. */
export function PlanSheet({
  visible,
  title,
  onClose,
  onPick,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  onPick: (date: string) => void;
}) {
  const today = todayKey();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Planificar" subtitle={title}>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        {days.map((d) => {
          const rel = dayLabel(d, today);
          const label = ["Hoy", "Mañana"].includes(rel) ? rel : shortDayLabel(d);
          return <Chip key={d} testID={`day-${d}`} label={label} onPress={() => onPick(d)} />;
        })}
      </View>
      <Button label="Cancelar" variant="ghost" fullWidth onPress={onClose} />
    </BottomSheet>
  );
}
