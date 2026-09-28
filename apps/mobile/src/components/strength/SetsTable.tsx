import { useState } from "react";
import { Pressable, View } from "react-native";
import { useActiveWorkout } from "@/data/activeWorkoutStore";
import { useStrength } from "@/data/strengthStore";
import {
  canComplete,
  type ExerciseKind,
  type Ghost,
  type SetLog,
  setLabels,
  type WorkoutExercise,
} from "@/domain/strength";
import { space } from "@/theme/tokens";
import { Button } from "../ui/Button";
import { haptic } from "../ui/haptics";
import { Icon } from "../ui/Icon";
import { Overline } from "../ui/Section";
import { Text } from "../ui/Text";
import { SetRow } from "./SetRow";
import { EffortSheet, TypeSheet } from "./SetsTableSheets";

/**
 * Tabla de series de un ejercicio: cabecera de columnas + una `SetRow` por serie (con sus
 * drops como subfilas) + botones para añadir serie/drop/calentamiento + las hojas de tipo y
 * esfuerzo. La lógica de cada fila vive en `SetRow.tsx`; las hojas, en `SetsTableSheets.tsx`.
 */
export function SetsTable({
  exIdx,
  exercise,
  previous,
  ghosts,
  kind,
}: {
  exIdx: number;
  exercise: WorkoutExercise;
  previous: (SetLog | null)[];
  ghosts: (Ghost | null)[];
  kind: ExerciseKind;
}) {
  const effortMode = useStrength((s) => s.effortMode);
  const setEffortMode = useStrength((s) => s.setEffortMode);
  const patchSet = useActiveWorkout((s) => s.patchSet);
  const completeSet = useActiveWorkout((s) => s.completeSet);
  const uncompleteSet = useActiveWorkout((s) => s.uncompleteSet);
  const addSet = useActiveWorkout((s) => s.addSet);
  const addDropAfter = useActiveWorkout((s) => s.addDropAfter);
  const removeSetAt = useActiveWorkout((s) => s.removeSetAt);
  const changeType = useActiveWorkout((s) => s.changeType);

  const [typeFor, setTypeFor] = useState<string | null>(null);
  const [effortFor, setEffortFor] = useState<string | null>(null);
  const [errorId, setErrorId] = useState<string | null>(null);

  const labels = setLabels(exercise.sets);
  const firstPending = exercise.sets.findIndex((s) => !s.done);
  const hasKg = kind !== "duration";
  const typeSet = exercise.sets.find((s) => s.id === typeFor) ?? null;
  const typeIdx = typeSet ? exercise.sets.findIndex((s) => s.id === typeSet.id) : -1;
  // Regla de `normalizeSets`: un drop necesita una serie anterior que no sea calentamiento.
  const typeSetCanBeDrop = typeIdx > 0 && exercise.sets[typeIdx - 1].type !== "warmup";
  const effortSet = exercise.sets.find((s) => s.id === effortFor) ?? null;

  const complete = (s: SetLog, g: Ghost | null) => {
    if (s.done) {
      haptic.tap();
      uncompleteSet(exIdx, s.id);
      return;
    }
    if (!canComplete(s, g, kind)) {
      setErrorId(s.id);
      haptic.warn();
      return;
    }
    setErrorId(null);
    haptic.success();
    completeSet(exIdx, s.id, { kg: g?.kg ?? null, reps: g?.reps ?? null });
  };

  const colKg = kind === "bodyweight" ? "+KG" : "KG";
  const colReps = kind === "duration" ? "SEG" : "REPS";

  return (
    <View testID="sets-table" style={{ gap: space.xs }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 2 }}>
        <Overline color="faint" header={false} style={{ width: 44, textAlign: "center" }}>SERIE</Overline>
        <Overline color="faint" header={false} style={{ flex: 1, textAlign: "center" }}>ANTERIOR</Overline>
        {hasKg ? (
          <Overline color="faint" header={false} style={{ width: 62, textAlign: "center" }}>{colKg}</Overline>
        ) : null}
        <Overline color="faint" header={false} style={{ width: 56, textAlign: "center" }}>{colReps}</Overline>
        <Pressable
          testID="effort-mode"
          accessibilityRole="button"
          accessibilityLabel={`Escala de esfuerzo: ${effortMode.toUpperCase()}. Cambiar`}
          onPress={() => setEffortMode(effortMode === "rir" ? "rpe" : "rir")}
          style={{ width: 52, height: 28, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 2 }}
        >
          <Overline color="brandText" header={false}>{effortMode.toUpperCase()}</Overline>
          <Icon name="swap-horizontal" size="xs" color="brandText" />
        </Pressable>
        <View style={{ width: 48 }} />
      </View>

      {exercise.sets.map((s, i) => (
        <SetRow
          key={s.id}
          index={i}
          set={s}
          label={labels[i]}
          ghost={ghosts[i] ?? null}
          previous={previous[i] ?? null}
          isDrop={s.type === "drop"}
          isNext={i === firstPending}
          hasKg={hasKg}
          kind={kind}
          effortMode={effortMode}
          hasError={errorId === s.id}
          onTypePress={() => setTypeFor(s.id)}
          onCopyPrev={() => {
            const prev = previous[i] ?? null;
            if (prev) patchSet(exIdx, s.id, { kg: prev.kg, reps: prev.reps });
          }}
          onCommitKg={(n) => patchSet(exIdx, s.id, { kg: n })}
          onCommitReps={(n) => patchSet(exIdx, s.id, { reps: n })}
          onEffortPress={() => setEffortFor(s.id)}
          onComplete={() => complete(s, ghosts[i] ?? null)}
        />
      ))}

      {errorId ? (
        <Text variant="caption" color="danger" accessibilityLiveRegion="polite">
          Faltan datos: escribe las repeticiones{kind === "weight_reps" ? " y los kilos" : ""} antes de marcar la serie.
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, paddingTop: space.sm }}>
        <Button testID="add-set" label="Serie" icon="add" variant="secondary" size="sm" onPress={() => addSet(exIdx)} />
        <Button
          testID="add-drop"
          label="Drop"
          icon="arrow-down"
          variant="secondary"
          size="sm"
          onPress={() => {
            const parent = [...exercise.sets].reverse().find((x) => x.type !== "warmup" && x.type !== "drop");
            if (parent) addDropAfter(exIdx, parent.id);
            else addSet(exIdx);
          }}
        />
        <Button testID="add-warmup" label="Calentamiento" icon="flame-outline" variant="ghost" size="sm" onPress={() => addSet(exIdx, "warmup")} />
      </View>

      <TypeSheet
        visible={typeFor !== null}
        onClose={() => setTypeFor(null)}
        set={typeSet}
        canBeDrop={typeSetCanBeDrop}
        canDropBelow={!!typeSet && typeSet.type !== "warmup"}
        onType={(t) => {
          if (typeSet) changeType(exIdx, typeSet.id, t);
          setTypeFor(null);
        }}
        onDrop={() => {
          if (typeSet) addDropAfter(exIdx, typeSet.id);
          setTypeFor(null);
        }}
        onDelete={() => {
          if (typeSet) removeSetAt(exIdx, typeSet.id);
          setTypeFor(null);
        }}
      />
      <EffortSheet
        visible={effortFor !== null}
        onClose={() => setEffortFor(null)}
        mode={effortMode}
        onMode={setEffortMode}
        current={effortSet?.rpe ?? null}
        onPick={(rpe) => {
          if (effortSet) patchSet(exIdx, effortSet.id, { rpe });
          setEffortFor(null);
        }}
      />
    </View>
  );
}
