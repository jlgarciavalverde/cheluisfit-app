import { useEffect, useRef } from "react";
import { View } from "react-native";
import { useActiveWorkout } from "@/data/activeWorkoutStore";
import { fmtDuration } from "@/domain/format";
import { isRestOver, remainingS, restText } from "@/domain/strength";
import { useNow } from "@/lib/useNow";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { ProgressBar } from "../ui/ProgressBar";
import { Text } from "../ui/Text";

/** Barra fija de descanso: cuenta atrás, ±15 s, saltar, y aviso al terminar. */
export function RestBar({ defaultRestS }: { defaultRestS: number }) {
  const { c } = useTheme();
  const rest = useActiveWorkout((s) => s.rest);
  const adjust = useActiveWorkout((s) => s.adjustRestBy);
  const skip = useActiveWorkout((s) => s.skipRest);
  const startManual = useActiveWorkout((s) => s.startRestManually);
  const now = useNow(250, !!rest);
  const alerted = useRef<number | null>(null);

  const over = rest ? isRestOver(rest, now) : false;
  useEffect(() => {
    if (rest && over && alerted.current !== rest.endsAt) {
      alerted.current = rest.endsAt;
      haptic.success();
    }
  }, [rest, over]);

  if (!rest) {
    return (
      <View
        testID="rest-idle"
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: space.md,
          padding: space.md,
          backgroundColor: c.surface,
          borderTopWidth: 1,
          borderTopColor: c.border,
        }}
      >
        <Text variant="caption" color="muted" style={{ flex: 1 }}>
          El descanso arranca solo al marcar una serie.
        </Text>
        <Button testID="rest-start" label={`Descanso ${restText(defaultRestS)}`} icon="timer-outline" variant="secondary" size="sm" onPress={() => startManual(defaultRestS)} />
      </View>
    );
  }

  const left = remainingS(rest, now);
  const overtime = Math.max(0, Math.round((now - rest.endsAt) / 1000));
  return (
    <View
      testID="rest-bar"
      style={{
        backgroundColor: over ? c.successSoft : c.surface,
        borderTopWidth: 1,
        borderTopColor: over ? c.success : c.border,
      }}
    >
      <ProgressBar
        value={over ? rest.totalS : rest.totalS - left}
        max={Math.max(1, rest.totalS)}
        color={over ? "success" : "brand"}
        height={4}
        label={`Descanso: quedan ${left} segundos`}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm }}>
        <View style={{ minWidth: 92 }} accessibilityLiveRegion="polite">
          <Text variant="numeralS" tabular color={over ? "success" : "text"} testID="rest-left">
            {over ? `+${fmtDuration(overtime)}` : fmtDuration(left)}
          </Text>
          <Text variant="micro" color={over ? "success" : "muted"} tabular>
            {over ? "terminado" : `descanso · de ${restText(rest.totalS)}`}
          </Text>
        </View>
        <Button testID="rest-minus" label="−15" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => adjust(-15)} />
        <Button testID="rest-plus" label="+15" variant="secondary" size="sm" style={{ flex: 1 }} onPress={() => adjust(15)} />
        <Button testID="rest-skip" label={over ? "Cerrar" : "Saltar"} variant={over ? "primary" : "ghost"} size="sm" style={{ flex: 1.2 }} onPress={skip} />
      </View>
    </View>
  );
}
