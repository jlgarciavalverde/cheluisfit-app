import { Pressable, View } from "react-native";
import { addDays, dayLabel, fromDateKey, todayKey, weekDates } from "@/domain/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { IconButton } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { Text } from "../ui/Text";

const full = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" });
const LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

/** Flechas de día + tira de la semana con un punto en los días que tienen registros. */
export function DateNavigator({
  date,
  onChange,
  logged,
}: {
  date: string;
  onChange: (d: string) => void;
  logged?: ReadonlySet<string>;
}) {
  const { c } = useTheme();
  const today = todayKey();
  const label = dayLabel(date);
  const sub = ["Hoy", "Ayer", "Mañana"].includes(label) ? full.format(fromDateKey(date)) : undefined;
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
        <IconButton icon="chevron-back" label="Día anterior" onPress={() => onChange(addDays(date, -1))} filled />
        <View style={{ flex: 1, alignItems: "center" }} accessibilityLiveRegion="polite">
          <Text variant="heading" testID="day-label">
            {label}
          </Text>
          {sub ? (
            <Text variant="caption" color="muted">
              {sub}
            </Text>
          ) : null}
        </View>
        <IconButton icon="chevron-forward" label="Día siguiente" onPress={() => onChange(addDays(date, 1))} filled />
      </View>
      <View style={{ flexDirection: "row", gap: 6 }} accessibilityRole="tablist">
        {weekDates(date).map((d, i) => {
          const selected = d === date;
          const isToday = d === today;
          return (
            <Pressable
              key={d}
              testID={`strip-${d}`}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`${dayLabel(d)}${logged?.has(d) ? ", con registros" : ""}`}
              onPress={() => {
                haptic.tap();
                onChange(d);
              }}
              style={{
                flex: 1,
                minHeight: 60,
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                borderRadius: radius.md,
                backgroundColor: selected ? c.brand : c.surface,
                borderWidth: 1,
                borderColor: selected ? c.brand : isToday ? c.brandText : c.border,
              }}
            >
              <Text variant="tiny" color={selected ? "onBrand" : "muted"}>
                {LETTERS[i]}
              </Text>
              <Text variant="bodyStrong" color={selected ? "onBrand" : "text"} tabular>
                {Number(d.slice(8))}
              </Text>
              <View
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: radius.pill,
                  backgroundColor: logged?.has(d) ? (selected ? c.onBrand : c.brandText) : "transparent",
                }}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
