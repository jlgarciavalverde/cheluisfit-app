import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { WorkoutSets } from "@/components/strength/WorkoutSets";
import { BottomSheet, BottomSheetForm, Button, Card, Chip, EmptyState, FieldGroup, IconButton, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useActiveWorkout } from "@/data/activeWorkoutStore";
import { useLibrary, useStrength } from "@/data/strengthStore";
import { dayLabel } from "@/domain/dates";
import { fmtDuration, fmtInt, fmtKg, parseNum } from "@/domain/format";
import {
  formatEffort,
  RIR_OPTIONS,
  rirToRpe,
  RPE_OPTIONS,
  routineFromWorkout,
  type SetLog,
  workoutPRs,
  workoutTotals,
} from "@/domain/strength";
import { space } from "@/theme/tokens";

export default function WorkoutDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workouts = useStrength((s) => s.workouts);
  const updateWorkout = useStrength((s) => s.updateWorkout);
  const deleteWorkout = useStrength((s) => s.deleteWorkout);
  const restoreWorkout = useStrength((s) => s.restoreWorkout);
  const effortMode = useStrength((s) => s.effortMode);
  const library = useLibrary();
  const start = useActiveWorkout((s) => s.start);
  const active = useActiveWorkout((s) => s.workout);
  const workout = workouts.find((w) => w.id === id);
  const [editing, setEditing] = useState<{ exIdx: number; set: SetLog } | null>(null);
  const [kgText, setKgText] = useState("");
  const [repsText, setRepsText] = useState("");
  const [rename, setRename] = useState(false);
  const [confirmRepeat, setConfirmRepeat] = useState(false);

  const prs = useMemo(() => (workout ? workoutPRs(workout, workouts) : []), [workout, workouts]);
  const prMap = useMemo(() => Object.fromEntries(prs.map((p) => [p.exerciseId, p.prs])), [prs]);

  if (!workout) {
    return (
      <Screen>
        <ScreenHeader title="Entrenamiento" back />
        <EmptyState icon="alert-circle-outline" title="No encuentro este entrenamiento" />
      </Screen>
    );
  }
  const t = workoutTotals(workout);
  const rel = dayLabel(workout.date);

  const openEdit = (exIdx: number, set: SetLog) => {
    setEditing({ exIdx, set });
    setKgText(set.kg === null ? "" : fmtKg(set.kg));
    setRepsText(set.reps === null ? "" : String(set.reps));
  };
  const patch = (p: Partial<SetLog>) => {
    if (!editing) return;
    updateWorkout({
      ...workout,
      exercises: workout.exercises.map((e, i) => (i === editing.exIdx ? { ...e, sets: e.sets.map((s) => (s.id === editing.set.id ? { ...s, ...p } : s)) } : e)),
    });
    setEditing((cur) => (cur ? { ...cur, set: { ...cur.set, ...p } } : cur));
  };

  const begin = () => {
    start(routineFromWorkout(workout), library);
    const nid = useActiveWorkout.getState().workout?.id;
    if (nid) router.replace({ pathname: "/entreno/[id]", params: { id: nid } });
  };

  const options = effortMode === "rir" ? RIR_OPTIONS : RPE_OPTIONS;

  return (
    <Screen testID="screen-detalle">
      <ScreenHeader
        title={workout.name}
        subtitle={`${rel} · ${workout.date}`}
        back
        right={<IconButton icon="create-outline" label="Cambiar nombre" filled onPress={() => setRename(true)} />}
      />
      <View style={{ gap: space.lg }}>
        <Card>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xl }}>
            <View>
              <Text variant="display" tabular>
                {fmtDuration(t.durationS)}
              </Text>
              <Text variant="caption" color="muted">
                duración
              </Text>
            </View>
            <View>
              <Text variant="display" tabular>
                {fmtInt(t.volume)}
                <Text variant="caption" color="muted"> kg</Text>
              </Text>
              <Text variant="caption" color="muted">
                volumen
              </Text>
            </View>
            <View>
              <Text variant="display" tabular>
                {t.workingSets}
              </Text>
              <Text variant="caption" color="muted">
                series
              </Text>
            </View>
          </View>
        </Card>
        <Text variant="caption" color="faint">
          Toca una serie para corregirla.
        </Text>
        <WorkoutSets workout={workout} effortMode={effortMode} prs={prMap} onEditSet={openEdit} />
        <View style={{ gap: space.sm }}>
          <Button testID="repeat-workout" label="Repetir este entrenamiento" icon="repeat" variant="secondary" fullWidth onPress={() => (active ? setConfirmRepeat(true) : begin())} />
          <Button
            testID="delete-workout"
            label="Eliminar entrenamiento"
            icon="trash-outline"
            variant="danger"
            fullWidth
            onPress={() => {
              const removed = deleteWorkout(workout.id);
              router.back();
              if (removed) toast("Entrenamiento eliminado", { actionLabel: "Deshacer", onAction: () => restoreWorkout(removed) });
            }}
          />
        </View>
      </View>

      <BottomSheet visible={editing !== null} onClose={() => setEditing(null)} title="Corregir serie" subtitle={editing ? workout.exercises[editing.exIdx]?.name : undefined}>
        <View style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <TextField
              testID="edit-kg"
              label="Kilos"
              suffix="kg"
              keyboardType="decimal-pad"
              value={kgText}
              onChangeText={(t) => {
                setKgText(t);
                const n = parseNum(t);
                if (n !== null && n >= 0) patch({ kg: n });
              }}
            />
            <TextField
              testID="edit-reps"
              label="Repeticiones"
              keyboardType="number-pad"
              value={repsText}
              onChangeText={(t) => {
                setRepsText(t);
                const n = parseNum(t);
                if (n !== null && n >= 0) patch({ reps: Math.round(n) });
              }}
            />
          </View>
          <FieldGroup label={`Esfuerzo (${effortMode.toUpperCase()})`} hint={`Ahora: ${editing ? formatEffort(editing.set.rpe, effortMode) : ""}`}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {options.map((o) => {
                const rpe = effortMode === "rir" ? rirToRpe(o) : o;
                return <Chip key={o} label={fmtKg(o)} selected={editing?.set.rpe === rpe} onPress={() => patch({ rpe })} />;
              })}
              <Chip label="Sin dato" selected={editing?.set.rpe === null} onPress={() => patch({ rpe: null })} />
            </View>
          </FieldGroup>
          <Button label="Listo" fullWidth onPress={() => setEditing(null)} />
        </View>
      </BottomSheet>

      <BottomSheet visible={confirmRepeat} onClose={() => setConfirmRepeat(false)} title="Ya tienes uno en curso" subtitle="Solo puede haber un entrenamiento abierto">
        <View style={{ gap: space.sm }}>
          <Button label="Descartarlo y empezar este" variant="danger" fullWidth onPress={() => { useActiveWorkout.getState().discard(); setConfirmRepeat(false); begin(); }} />
          <Button label="Cancelar" variant="ghost" fullWidth onPress={() => setConfirmRepeat(false)} />
        </View>
      </BottomSheet>

      <BottomSheetForm visible={rename} title="Nombre del entrenamiento" label="Nombre" initialValue={workout.name} confirmLabel="Guardar" onClose={() => setRename(false)} onSubmit={(v) => { updateWorkout({ ...workout, name: v.trim() }); setRename(false); }} />
    </Screen>
  );
}
