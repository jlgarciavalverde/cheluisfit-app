import { Pressable, View } from "react-native";
import { fmtKg } from "@/domain/format";
import {
  type EffortMode,
  formatEffort,
  type PR,
  PR_LABEL,
  setLabels,
  type SetLog,
  supersetLabel,
  type Workout,
  type WorkoutExercise,
} from "@/domain/strength";
import { useTheme } from "@/theme/ThemeProvider";
import { interaction, space } from "@/theme/tokens";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { Text } from "../ui/Text";

export function setValueText(s: SetLog, kind: WorkoutExercise["kind"]): string {
  if (kind === "duration") return `${s.reps ?? 0} s`;
  const kg = s.kg ?? 0;
  return kind === "bodyweight" && kg === 0 ? `${s.reps ?? 0} reps` : `${fmtKg(kg)} kg × ${s.reps ?? 0}`;
}

export function PRBadges({ prs }: { prs: PR[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
      {prs.map((p) => (
        <Badge key={p.type} label={`🏆 ${PR_LABEL[p.type]}`} tone="warning" />
      ))}
    </View>
  );
}

/** Ejercicios de un entreno con sus series (solo lectura; cada serie es tocable para editarla). */
export function WorkoutSets({
  workout,
  effortMode,
  prs,
  onEditSet,
}: {
  workout: Workout;
  effortMode: EffortMode;
  prs?: Record<string, PR[]>;
  onEditSet?: (exIdx: number, set: SetLog) => void;
}) {
  const { c } = useTheme();
  return (
    <View style={{ gap: space.md }}>
      {workout.exercises.map((e, exIdx) => {
        const labels = setLabels(e.sets);
        const ss = supersetLabel(workout.exercises, exIdx);
        return (
          <Card key={e.id} padded={false} testID={`wex-${exIdx}`}>
            <View style={{ padding: space.lg, gap: space.xs }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" }}>
                {ss ? <Badge label={ss} tone="brand" icon="link" /> : null}
                <Text variant="heading" style={{ flexShrink: 1 }}>
                  {e.name}
                </Text>
              </View>
              {prs?.[e.exerciseId] ? <PRBadges prs={prs[e.exerciseId]} /> : null}
              {e.note ? (
                <Text variant="caption" color="muted">
                  {e.note}
                </Text>
              ) : null}
            </View>
            {e.sets.map((s, i) => {
              const l = labels[i];
              const inner = (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: space.md,
                    paddingVertical: space.sm,
                    paddingLeft: s.type === "drop" ? space.xl : space.lg,
                    paddingRight: space.lg,
                    borderTopWidth: 1,
                    borderTopColor: c.border,
                  }}
                >
                  <View style={{ minWidth: 30, alignItems: "center" }}>
                    {l.badge ? <Badge label={`${l.badge}${l.dropIndex > 1 ? l.dropIndex : ""}`} tone={l.badge === "C" ? "warning" : l.badge === "F" ? "danger" : "neutral"} /> : (
                      <Text variant="bodyStrong" color="muted" tabular>
                        {l.label}
                      </Text>
                    )}
                  </View>
                  <Text variant="bodyStrong" tabular style={{ flex: 1 }}>
                    {setValueText(s, e.kind)}
                  </Text>
                  <Text variant="caption" color="muted" tabular>
                    {s.rpe !== null ? `${effortMode.toUpperCase()} ${formatEffort(s.rpe, effortMode)}` : ""}
                  </Text>
                  <Text variant="caption" color="faint" tabular style={{ width: 44, textAlign: "right" }}>
                    {s.restS ? `${Math.floor(s.restS / 60)}:${String(s.restS % 60).padStart(2, "0")}` : ""}
                  </Text>
                </View>
              );
              return onEditSet ? (
                // `Pressable`, no `<Text onPress>`: dentro de un Text la fila se maqueta en línea y
                // los anchos/`flex` de sus columnas no se respetan.
                <Pressable
                  key={s.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar serie ${l.label}`}
                  onPress={() => onEditSet(exIdx, s)}
                  testID={`edit-set-${exIdx}-${i}`}
                  style={({ pressed }) => ({ opacity: pressed ? interaction.pressedOpacity : 1 })}
                >
                  {inner}
                </Pressable>
              ) : (
                <View key={s.id}>{inner}</View>
              );
            })}
          </Card>
        );
      })}
    </View>
  );
}
