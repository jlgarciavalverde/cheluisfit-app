import { View } from "react-native";
import { addDays, dayLabel, shortDayLabel, todayKey } from "@/domain/dates";
import { space } from "@/theme/tokens";
import { Chip } from "../ui/Chip";

/** Chips con los últimos `days` días (Hoy, Ayer, «lun 15»…). */
export function DayPicker({ value, onChange, days = 14 }: { value: string; onChange: (d: string) => void; days?: number }) {
  const today = todayKey();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {Array.from({ length: days }, (_, i) => addDays(today, -i)).map((d) => {
        const rel = dayLabel(d, today);
        return (
          <Chip
            key={d}
            testID={`pick-${d}`}
            label={["Hoy", "Ayer"].includes(rel) ? rel : shortDayLabel(d)}
            selected={value === d}
            onPress={() => onChange(d)}
          />
        );
      })}
    </View>
  );
}
