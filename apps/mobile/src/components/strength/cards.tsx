import { Pressable, View } from "react-native";
import { dayLabel, shortDayLabel } from "@/domain/dates";
import { fmtDuration, fmtInt } from "@/domain/format";
import {
  GROUP_LABEL,
  groupOf,
  type Exercise,
  type Muscle,
  type MuscleGroup,
  MUSCLE_LABEL,
  type Routine,
  type Workout,
  workoutTotals,
} from "@/domain/strength";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { ProgressBar } from "../ui/ProgressBar";
import { Text } from "../ui/Text";

/** Grupos musculares que trabaja una rutina, del más al menos frecuente. */
export function routineGroups(r: Routine, byId: ReadonlyMap<string, Exercise>): MuscleGroup[] {
  const count = new Map<MuscleGroup, number>();
  for (const re of r.exercises) {
    for (const m of byId.get(re.exerciseId)?.primary ?? []) count.set(groupOf(m), (count.get(groupOf(m)) ?? 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
}

export function RoutineCard({
  routine,
  byId,
  lastDate,
  suggested,
  onStart,
  onEdit,
  onDuplicate,
}: {
  routine: Routine;
  byId: ReadonlyMap<string, Exercise>;
  lastDate?: string;
  suggested?: boolean;
  onStart: () => void;
  onEdit?: () => void;
  onDuplicate?: () => void;
}) {
  const groups = routineGroups(routine, byId);
  const sets = routine.exercises.reduce((n, e) => n + e.sets.length, 0);
  return (
    <Card testID={`routine-${routine.id}`} style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="heading" numberOfLines={2}>
            {routine.name}
          </Text>
          <Text variant="caption" color="muted" tabular>
            {routine.exercises.length} ejercicios · {sets} series
            {lastDate ? ` · última vez ${dayLabel(lastDate).toLowerCase()}` : " · sin hacer aún"}
          </Text>
        </View>
        {suggested ? <Badge label="Hoy toca" tone="brand" icon="flame" /> : null}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
        {groups.slice(0, 3).map((g) => (
          <Badge key={g} label={GROUP_LABEL[g]} />
        ))}
      </View>
      <Text variant="caption" color="faint" numberOfLines={2}>
        {routine.exercises
          .map((e) => byId.get(e.exerciseId)?.name)
          .filter(Boolean)
          .join(" · ")}
      </Text>
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button testID={`start-${routine.id}`} label="Empezar" icon="play" size="sm" onPress={onStart} />
        {onEdit ? <Button testID={`edit-${routine.id}`} label="Editar" icon="create-outline" variant="secondary" size="sm" onPress={onEdit} /> : null}
        {onDuplicate ? <Button testID={`dup-${routine.id}`} label="Duplicar" icon="copy-outline" variant="ghost" size="sm" onPress={onDuplicate} /> : null}
      </View>
    </Card>
  );
}

export function WorkoutCard({ workout, onPress }: { workout: Workout; onPress: () => void }) {
  const t = workoutTotals(workout);
  const rel = dayLabel(workout.date);
  return (
    <Pressable
      testID={`workout-${workout.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${workout.name}, ${rel}, ${fmtInt(t.volume)} kilos de volumen`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={{ gap: space.sm }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
          <Text variant="heading" numberOfLines={1} style={{ flex: 1 }}>
            {workout.name}
          </Text>
          <Text variant="caption" color="muted">
            {["Hoy", "Ayer"].includes(rel) ? `${rel} · ${shortDayLabel(workout.date)}` : rel}
          </Text>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.lg, rowGap: space.xs }}>
          <Text variant="caption" color="muted" tabular>
            <Text variant="bodyStrong" tabular>
              {fmtDuration(t.durationS)}
            </Text>{" "}
            duración
          </Text>
          <Text variant="caption" color="muted" tabular>
            <Text variant="bodyStrong" tabular>
              {fmtInt(t.volume)}
            </Text>{" "}
            kg
          </Text>
          <Text variant="caption" color="muted" tabular>
            <Text variant="bodyStrong" tabular>
              {t.workingSets}
            </Text>{" "}
            series
          </Text>
        </View>
        <Text variant="caption" color="faint" numberOfLines={2}>
          {workout.exercises.map((e) => e.name).join(" · ")}
        </Text>
      </Card>
    </Pressable>
  );
}

/** Series por músculo esta semana; referencia habitual 10–20 series por músculo y semana. */
export function MuscleVolumeCard({ sets }: { sets: Partial<Record<Muscle, number>> }) {
  const { c } = useTheme();
  const rows = (Object.entries(sets) as [Muscle, number][]).sort((a, b) => b[1] - a[1]).slice(0, 8);
  return (
    <Card style={{ gap: space.md }} testID="muscle-volume">
      <View style={{ gap: 2 }}>
        <Text variant="heading">Series por músculo · esta semana</Text>
        <Text variant="caption" color="muted">
          Referencia habitual: 10–20 series semanales por músculo. Las secundarias cuentan la mitad.
        </Text>
      </View>
      {rows.length === 0 ? (
        <Text variant="body" color="faint">
          Aún no hay series esta semana.
        </Text>
      ) : (
        rows.map(([m, n]) => (
          <View key={m} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text variant="bodyStrong">{MUSCLE_LABEL[m]}</Text>
              <Text variant="caption" color={n > 20 ? "warning" : n >= 10 ? "success" : "muted"} tabular>
                {Number.isInteger(n) ? n : n.toFixed(1).replace(".", ",")} series
              </Text>
            </View>
            <ProgressBar
              value={n}
              max={20}
              color={n > 20 ? "warning" : n >= 10 ? "success" : "brand"}
              label={`${MUSCLE_LABEL[m]}: ${n} series esta semana de 20`}
            />
          </View>
        ))
      )}
      <View style={{ height: 1, backgroundColor: c.border }} />
      <Text variant="caption" color="faint">
        Verde = dentro de 10–20. Naranja = más de 20.
      </Text>
    </Card>
  );
}
