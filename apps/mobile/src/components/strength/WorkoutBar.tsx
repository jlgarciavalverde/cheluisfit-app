import { router, usePathname } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useActiveWorkout } from "@/data/activeWorkoutStore";
import { useStrength } from "@/data/strengthStore";
import { fmtDuration } from "@/domain/format";
import { remainingS } from "@/domain/strength";
import { useNow } from "@/lib/useNow";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { elevation, radius, space } from "@/theme/tokens";
import { FLOAT_GAP, showsWorkoutBar, useBottomChrome } from "../bottomChrome";
import { Icon } from "../ui/Icon";
import { Text } from "../ui/Text";

/** Barra flotante «Entrenamiento en curso» visible desde las demás pestañas. */
export function WorkoutBar() {
  const { c } = useTheme();
  const { isWide } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const workout = useActiveWorkout((s) => s.workout);
  const rest = useActiveWorkout((s) => s.rest);
  const clearActive = useActiveWorkout((s) => s.clearActive);
  const inHistory = useStrength((s) => !!workout && s.workouts.some((w) => w.id === workout.id));
  const pathname = usePathname();
  const chrome = useBottomChrome((s) => s.height);
  const now = useNow(1000, !!workout);
  if (!workout || !showsWorkoutBar(pathname)) return null;
  const left = rest ? remainingS(rest, now) : null;
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: isWide ? undefined : 0,
        right: isWide ? space.xl : 0,
        // Justo encima de lo fijo de la pantalla (pestañas o pie con el botón principal).
        bottom: isWide ? space.xl : insets.bottom + chrome + FLOAT_GAP,
        width: isWide ? 360 : undefined,
        paddingHorizontal: isWide ? 0 : space.md,
      }}
    >
      <Pressable
        testID="workout-bar"
        accessibilityRole="button"
        accessibilityLabel={
          inHistory ? `Entrenamiento ya guardado: ${workout.name}. Cerrar barra` : `Entrenamiento en curso: ${workout.name}. Volver`
        }
        onPress={() => (inHistory ? clearActive() : router.push({ pathname: "/entreno/[id]", params: { id: workout.id } }))}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          minHeight: 56,
          paddingHorizontal: space.lg,
          borderRadius: radius.lg,
          backgroundColor: inHistory ? c.warning : c.brand,
          opacity: pressed ? 0.9 : 1,
          ...elevation.floating,
        })}
      >
        <Icon name={inHistory ? "alert-circle-outline" : "barbell"} size="md" color="onBrand" />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong" color="onBrand" numberOfLines={1}>
            {inHistory ? "Ya está en el historial" : workout.name}
          </Text>
          <Text variant="caption" color="onBrand" tabular numberOfLines={1}>
            {inHistory
              ? workout.name
              : `${fmtDuration((now - new Date(workout.startedAt).getTime()) / 1000)}${left !== null ? (left > 0 ? ` · descanso ${fmtDuration(left)}` : " · descanso terminado") : ""}`}
          </Text>
        </View>
        <Text variant="bodyStrong" color="onBrand">
          {inHistory ? "Cerrar" : "Volver"}
        </Text>
        {!inHistory ? <Icon name="chevron-forward" size="sm" color="onBrand" /> : null}
      </Pressable>
    </View>
  );
}
