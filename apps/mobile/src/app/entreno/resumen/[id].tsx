import { AnalysisCard } from "@/components/ai/AnalysisCard";
import { workoutAnalysisData } from "@/domain/analysis";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { PRBadges, WorkoutSets } from "@/components/strength/WorkoutSets";
import { Callout, Button, Card, EmptyState, Icon, Text, Stat, StatGrid } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useStrength } from "@/data/strengthStore";
import { fmtDuration, fmtInt } from "@/domain/format";
import { workoutPRs, workoutTotals } from "@/domain/strength";
import { space } from "@/theme/tokens";

export default function WorkoutSummaryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workouts = useStrength((s) => s.workouts);
  const routines = useStrength((s) => s.routines);
  const saveRoutine = useStrength((s) => s.saveRoutine);
  const effortMode = useStrength((s) => s.effortMode);
  const workout = workouts.find((w) => w.id === id);
  const [handled, setHandled] = useState(false);

  const prs = useMemo(() => (workout ? workoutPRs(workout, workouts) : []), [workout, workouts]);
  const prMap = useMemo(() => Object.fromEntries(prs.map((p) => [p.exerciseId, p.prs])), [prs]);

  if (!workout) {
    return (
      <Screen>
        <ScreenHeader title="Resumen" back />
        <EmptyState icon="alert-circle-outline" title="No encuentro este entrenamiento" actionLabel="Ir a Fuerza" onAction={() => router.dismissTo("/fuerza")} />
      </Screen>
    );
  }
  const t = workoutTotals(workout);
  const update = workout.routineUpdate;
  const changes = update?.changes;
  const routine = workout.routineId ? routines.find((r) => r.id === workout.routineId) : undefined;
  const offerUpdate = !!update && !!routine && !handled;

  return (
    <Screen
      testID="screen-resumen"
      footer={<Button testID="summary-done" label="Listo" size="lg" fullWidth onPress={() => router.dismissTo("/fuerza")} />}
    >
      <ScreenHeader title="¡Entrenamiento guardado!" subtitle={workout.name} />
      <View style={{ gap: space.lg }}>
        <Card style={{ gap: space.md }}>
          <StatGrid>
            <Stat size="lg" valueTestID="sum-duration" value={fmtDuration(t.durationS)} label="Duración" />
            <Stat size="lg" valueTestID="sum-volume" value={fmtInt(t.volume)} unit="kg" label="Volumen" />
            <Stat size="lg" value={String(t.workingSets)} label="Series" />
          </StatGrid>
        </Card>

        {prs.length > 0 ? (
          <Card testID="summary-prs" accent="warning" style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <Icon name="trophy" size="md" color="warning" />
              <Text variant="heading">{prs.length === 1 ? "1 ejercicio con récord" : `${prs.length} ejercicios con récord`}</Text>
            </View>
            {prs.map((p) => (
              <View key={p.exerciseId} style={{ gap: space.xs }}>
                <Text variant="bodyStrong">{p.name}</Text>
                <PRBadges prs={p.prs} />
              </View>
            ))}
          </Card>
        ) : null}

        {offerUpdate && routine && update && changes ? (
          <Callout
            tone="brand"
            icon="refresh-circle-outline"
            title={`¿Actualizar la rutina «${routine.name}»?`}
            testID="update-routine"
            action={
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              <Button
                testID="update-routine-yes"
                label="Actualizar rutina"
                icon="checkmark"
                onPress={() => {
                  saveRoutine({ ...update.proposed, id: routine.id, name: routine.name, folder: routine.folder, notes: routine.notes });
                  setHandled(true);
                  toast("Rutina actualizada");
                }}
              />
              <Button testID="update-routine-no" label="Dejarla como está" variant="secondary" onPress={() => setHandled(true)} />
            </View>
            }
          >
            <Text variant="body" color="muted">
              Has hecho cambios respecto a la rutina:
              {changes.replaced ? ` ${changes.replaced} ejercicio${changes.replaced > 1 ? "s" : ""} sustituido${changes.replaced > 1 ? "s" : ""}.` : ""}
              {changes.added ? ` ${changes.added} añadido${changes.added > 1 ? "s" : ""}.` : ""}
              {changes.removed ? ` ${changes.removed} quitado${changes.removed > 1 ? "s" : ""}.` : ""}
              {changes.reordered ? " Distinto orden." : ""}
            </Text>
          </Callout>
        ) : null}

        <AnalysisCard
          kind="workout"
          analysisKey={workout.id}
          auto
          stored={workout.analysis}
          data={() => workoutAnalysisData(workout, useStrength.getState().workouts, effortMode)}
          onSave={(analysis) => {
            const cur = useStrength.getState().workouts.find((w) => w.id === workout.id);
            if (cur) useStrength.getState().updateWorkout({ ...cur, analysis });
          }}
        />
        <WorkoutSets workout={workout} effortMode={effortMode} prs={prMap} />
        <Button label="Ver en el historial" variant="ghost" onPress={() => router.replace({ pathname: "/entreno/detalle/[id]", params: { id: workout.id } })} />
      </View>
    </Screen>
  );
}
