import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { Button, Callout, IconButton, Text } from "@/components/ui";
import { fmtDuration } from "@/domain/format";
import { useNow } from "@/lib/useNow";
import { space } from "@/theme/tokens";

function Elapsed({ startedAt, doneSets }: { startedAt: string; doneSets: number }) {
  const now = useNow(1000);
  return (
    <Text variant="caption" color="muted" tabular testID="workout-elapsed" numberOfLines={1}>
      {fmtDuration((now - new Date(startedAt).getTime()) / 1000)} · {doneSets} {doneSets === 1 ? "serie" : "series"}
    </Text>
  );
}

export function WorkoutHeader({
  name,
  startedAt,
  doneSets,
  inHistory,
  onMinimize,
  onRename,
  onFinish,
  onClearActive,
}: {
  name: string;
  startedAt: string;
  doneSets: number;
  inHistory: boolean;
  onMinimize: () => void;
  onRename: () => void;
  onFinish: () => void;
  onClearActive: () => void;
}) {
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, minHeight: 60 }}>
        <IconButton testID="minimize" icon="chevron-down" label="Minimizar: el entrenamiento sigue abierto" onPress={onMinimize} />
        <Pressable accessibilityRole="button" accessibilityLabel={`${name}. Cambiar nombre`} onPress={onRename} style={{ flex: 1, minHeight: 48, justifyContent: "center" }}>
          <Text variant="heading" numberOfLines={1} testID="workout-name">
            {name}
          </Text>
          <Elapsed startedAt={startedAt} doneSets={doneSets} />
        </Pressable>
        <Button testID="finish" label="Terminar" size="sm" onPress={onFinish} />
      </View>

      {inHistory ? (
        <View style={{ paddingHorizontal: space.lg, paddingBottom: space.sm }}>
          <Callout
            tone="warning"
            icon="alert-circle-outline"
            testID="active-in-history"
            action={<Button testID="clear-active-bar" label="Cerrar barra" size="sm" variant="secondary" onPress={onClearActive} />}
          >
            Este entreno ya está en el historial
          </Callout>
        </View>
      ) : null}
    </>
  );
}
