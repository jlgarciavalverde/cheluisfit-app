import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { LineChart } from "@/components/charts/LineChart";
import { MediaStage } from "@/components/strength/MediaStage";
import { Callout, Badge, Card, EmptyState, Section, Text } from "@/components/ui";
import { loadInstructions } from "@/data/exerciseCatalog";
import { useExerciseHistory, useLibrary } from "@/data/strengthStore";
import { shortDayLabel } from "@/domain/dates";
import { fmtKg } from "@/domain/format";
import {
  bestE1rm,
  EQUIPMENT_LABEL,
  MUSCLE_LABEL,
  recordsFrom,
  SET_TYPE_LABEL,
  type SetLog,
} from "@/domain/strength";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

function setText(s: SetLog, bodyweight: boolean): string {
  const kg = s.kg ?? 0;
  const base = bodyweight && kg === 0 ? `${s.reps} rep.` : `${fmtKg(kg)} × ${s.reps}`;
  return s.type === "normal" ? base : `${base} (${SET_TYPE_LABEL[s.type].toLowerCase()})`;
}

export default function ExerciseDetailScreen() {
  const { c } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [steps, setSteps] = useState<string[] | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    loadInstructions(id).then((s) => !cancelled && setSteps(s));
    return () => {
      cancelled = true;
    };
  }, [id]);
  const library = useLibrary();
  const ex = useMemo(() => library.find((e) => e.id === id), [library, id]);
  const history = useExerciseHistory(id);

  if (!ex) {
    return (
      <Screen>
        <ScreenHeader title="Ejercicio" back />
        <EmptyState icon="alert-circle-outline" title="No encuentro este ejercicio" />
      </Screen>
    );
  }
  const rec = recordsFrom(history);
  const bodyweight = ex.kind === "bodyweight";
  const chart = [...history].reverse().slice(-10);
  const e1 = chart.map((h) => bestE1rm(h.sets));

  return (
    <Screen testID="screen-ejercicio">
      <ScreenHeader title={ex.name} back />
      <View style={{ gap: space.lg }}>
        <MediaStage exercise={ex} height={230} />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
          {ex.primary.map((m) => (
            <Badge key={m} label={MUSCLE_LABEL[m]} tone="brand" />
          ))}
          {ex.secondary.map((m) => (
            <Badge key={m} label={MUSCLE_LABEL[m]} />
          ))}
          <Badge label={EQUIPMENT_LABEL[ex.equipment]} icon="barbell-outline" />
          {ex.video ? <Badge label="Mi vídeo" tone="brand" icon="videocam" /> : null}
        </View>

        {steps?.length ? (
          <Card style={{ gap: space.md }} testID="exercise-instructions">
            <Text variant="heading">Cómo se hace</Text>
            {steps.map((step, i) => (
              <View key={i} style={{ flexDirection: "row", gap: space.sm }}>
                <Text variant="bodyStrong" color="brandText" style={{ minWidth: 20 }} tabular>
                  {i + 1}.
                </Text>
                <Text variant="body" color="muted" style={{ flex: 1 }}>
                  {step}
                </Text>
              </View>
            ))}
          </Card>
        ) : null}

        {rec ? (
          <Card style={{ gap: space.md }} testID="records">
            <Text variant="heading">Tus récords</Text>
            <View style={{ flexDirection: "row", gap: space.lg, flexWrap: "wrap" }}>
              {!bodyweight ? (
                <>
                  <View>
                    <Text variant="display" tabular>
                      {fmtKg(rec.maxKg)}
                      <Text variant="caption" color="muted"> kg</Text>
                    </Text>
                    <Text variant="caption" color="muted">
                      Peso máximo
                    </Text>
                  </View>
                  <View>
                    <Text variant="display" tabular>
                      {fmtKg(rec.bestE1rm)}
                      <Text variant="caption" color="muted"> kg</Text>
                    </Text>
                    <Text variant="caption" color="muted">
                      1RM estimado
                    </Text>
                  </View>
                </>
              ) : (
                <View>
                  <Text variant="display" tabular>
                    {Math.max(...Object.values(rec.repsAtKg))}
                    <Text variant="caption" color="muted"> reps</Text>
                  </Text>
                  <Text variant="caption" color="muted">
                    Mejor serie
                  </Text>
                </View>
              )}
            </View>
          </Card>
        ) : (
          <Callout icon="information-circle-outline">
            Aún no has hecho este ejercicio. Cuando lo hagas verás aquí tus récords y tu evolución.
          </Callout>
        )}

        {!bodyweight && chart.length >= 2 ? (
          <Card style={{ gap: space.md }} testID="e1rm-chart">
            <Text variant="heading">1RM estimado por sesión</Text>
            <LineChart
              values={e1}
              labels={chart.map((h) => shortDayLabel(h.date).split(" ")[1] ?? "")}
              format={(v) => `${fmtKg(v)} kg`}
              summary={`1RM estimado por sesión: ${chart.map((h, i) => `${h.date} ${fmtKg(e1[i])}`).join(", ")}`}
            />
            <Text variant="caption" color="faint">
              Estimación con la fórmula de Epley; solo es fiable hasta ~12 repeticiones.
            </Text>
          </Card>
        ) : null}

        {history.length > 0 ? (
          <Section kind="overline" title="Historial" gap={space.sm}>
            <Card padded={false}>
              {history.map((h, i) => (
                <View
                  key={h.date}
                  style={{ padding: space.lg, gap: 4, borderTopWidth: i > 0 ? 1 : 0, borderTopColor: c.border }}
                >
                  <Text variant="bodyStrong">{shortDayLabel(h.date)}</Text>
                  <Text variant="body" color="muted" tabular>
                    {h.sets.filter((s) => s.done && s.type !== "warmup").map((s) => setText(s, bodyweight)).join("  ·  ")}
                  </Text>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}
        <Text variant="caption" color="faint">
          Catálogo de ejercicios: Exercise data by RepDB (repdb.co), wger (CC-BY-SA) y free-exercise-db.
        </Text>
      </View>
    </Screen>
  );
}
