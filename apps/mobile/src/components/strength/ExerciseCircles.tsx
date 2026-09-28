import { useEffect, useRef } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { supersetLabel, type WorkoutExercise } from "@/domain/strength";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { haptic } from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { Text } from "../ui/Text";

const SIZE = 42;
const GAP = 10;

export type CircleState = "done" | "current" | "started" | "pending";

export function circleState(e: WorkoutExercise, isCurrent: boolean): CircleState {
  const total = e.sets.length;
  const done = e.sets.filter((s) => s.done).length;
  if (total > 0 && done === total) return "done";
  if (isCurrent) return "current";
  return done > 0 ? "started" : "pending";
}

const STATE_TEXT: Record<CircleState, string> = {
  done: "hecho",
  current: "en curso",
  started: "empezado",
  pending: "pendiente",
};

/** Pequeños círculos con los ejercicios: hechos (✓), el actual (relleno) y los pendientes (vacíos). */
export function ExerciseCircles({
  exercises,
  current,
  onSelect,
  onAdd,
}: {
  exercises: readonly WorkoutExercise[];
  current: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
}) {
  const { c } = useTheme();
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    ref.current?.scrollTo({ x: Math.max(0, current * (SIZE + GAP) - 120), animated: true });
  }, [current]);

  return (
    <ScrollView
      ref={ref}
      horizontal
      // Un ScrollView crece por defecto: sin esto se estira en vertical y deja un hueco enorme.
      style={{ flexGrow: 0 }}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: space.lg, paddingVertical: space.sm, alignItems: "flex-start" }}
      testID="circles"
    >
      {exercises.map((e, i) => {
        const state = circleState(e, i === current);
        const ss = supersetLabel(exercises, i);
        const linkedNext = !!e.supersetId && exercises[i + 1]?.supersetId === e.supersetId;
        const bg = state === "done" ? c.success : state === "current" ? c.brand : state === "started" ? c.brandSoft : "transparent";
        const border = state === "done" ? c.success : state === "pending" ? c.border : c.brand;
        const fg = state === "done" ? "bg" : state === "current" ? "onBrand" : "text";
        return (
          <View key={e.id} style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View style={{ alignItems: "center", gap: 3 }}>
              <Pressable
                testID={`circle-${i}`}
                accessibilityRole="button"
                accessibilityLabel={`Ejercicio ${i + 1}: ${e.name}, ${STATE_TEXT[state]}${ss ? `, superserie ${ss}` : ""}`}
                onPress={() => {
                  haptic.tap();
                  onSelect(i);
                }}
                hitSlop={4}
                style={{
                  width: SIZE,
                  height: SIZE,
                  borderRadius: SIZE / 2,
                  borderWidth: state === "current" ? 3 : 2,
                  borderColor: border,
                  backgroundColor: bg,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {state === "done" ? (
                  <Icon name="checkmark" size="md" color="bg" />
                ) : (
                  <Text variant="bodyStrong" color={fg} tabular>
                    {i + 1}
                  </Text>
                )}
              </Pressable>
              <Text variant="micro" color={ss ? "brandText" : "faint"} style={{ minHeight: 13 }}>
                {ss ?? ""}
              </Text>
            </View>
            {/* Unión de superserie: un puente entre círculos vecinos */}
            <View style={{ width: GAP, height: SIZE, justifyContent: "center" }}>
              {linkedNext ? <View style={{ height: 4, backgroundColor: c.brand, borderRadius: radius.pill }} /> : null}
            </View>
          </View>
        );
      })}
      <View style={{ alignItems: "center", gap: 3 }}>
        <Pressable
          testID="circle-add"
          accessibilityRole="button"
          accessibilityLabel="Añadir un ejercicio"
          onPress={onAdd}
          hitSlop={4}
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: SIZE / 2,
            borderWidth: 2,
            borderStyle: "dashed",
            borderColor: c.faint,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="add" size="md" color="muted" />
        </Pressable>
      </View>
    </ScrollView>
  );
}
