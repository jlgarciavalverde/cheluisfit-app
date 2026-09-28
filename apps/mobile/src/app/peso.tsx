import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { LineChart } from "@/components/charts/LineChart";
import { Button, Card, Chip, EmptyState, IconButton, Overline, Section, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useNutrition, useTargets } from "@/data/store";
import { addDays, dayLabel, shortDayLabel, todayKey } from "@/domain/dates";
import { fmtInt, fmtNum, parseNum } from "@/domain/format";
import { isPlausibleWeight, latestWeight, normalizeWeights, weightChange } from "@/domain/weight";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

export default function WeightScreen() {
  const { c } = useTheme();
  const weights = useNutrition((s) => s.weights);
  const addWeight = useNutrition((s) => s.addWeight);
  const removeWeight = useNutrition((s) => s.removeWeight);
  const targets = useTargets();
  const today = todayKey();
  const [date, setDate] = useState(today);
  const [text, setText] = useState("");

  const list = normalizeWeights(weights);
  const last = latestWeight(weights);
  const change30 = weightChange(weights, today, 30);
  const kg = parseNum(text);
  const invalid = text.trim() !== "" && (kg === null || !isPlausibleWeight(kg));
  const chart = list.slice(-12);
  const existing = list.find((w) => w.date === date);

  const save = () => {
    if (kg === null || !isPlausibleWeight(kg)) return;
    const { updatedProfile } = addWeight(date, kg);
    setText("");
    toast(updatedProfile ? "Peso guardado · objetivo recalculado" : "Peso guardado");
  };

  return (
    <Screen variant="form" testID="screen-peso">
      <ScreenHeader title="Peso corporal" back />
      <View style={{ gap: space.lg }}>
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
            <View>
              <Overline color="brandText">Último peso</Overline>
              <Text variant="display" tabular testID="last-weight">
                {last ? fmtNum(last.kg) : "—"}
                <Text variant="body" color="muted"> kg</Text>
              </Text>
              {last ? (
                <Text variant="caption" color="muted">
                  {dayLabel(last.date, today)}
                </Text>
              ) : null}
            </View>
            {change30 !== null ? (
              <View style={{ alignItems: "flex-end" }}>
                <Text variant="heading" tabular color={change30 === 0 ? "text" : "text"} testID="weight-change">
                  {change30 > 0 ? "+" : change30 < 0 ? "−" : ""}
                  {fmtNum(Math.abs(change30))} kg
                </Text>
                <Text variant="caption" color="muted">
                  en 30 días
                </Text>
              </View>
            ) : null}
          </View>
          {chart.length >= 2 ? (
            <LineChart
              values={chart.map((w) => w.kg)}
              labels={chart.map((w) => `${Number(w.date.slice(8))}/${Number(w.date.slice(5, 7))}`).filter((_, i) => i % Math.ceil(chart.length / 6) === 0)}
              format={(v) => `${fmtNum(v)} kg`}
              invert
              summary={`Peso: ${chart.map((w) => `${shortDayLabel(w.date)} ${fmtNum(w.kg)} kilos`).join(", ")}`}
            />
          ) : (
            <Text variant="body" color="muted">
              Con dos medidas empieza a dibujarse la gráfica.
            </Text>
          )}
        </Card>

        <Card style={{ gap: space.md }}>
          <Text variant="heading">Anotar peso</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {Array.from({ length: 6 }, (_, i) => addDays(today, -i)).map((d) => (
              <Chip key={d} label={i0(d, today)} selected={date === d} onPress={() => setDate(d)} />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm }}>
            <TextField
              testID="weight-input"
              label="Peso"
              suffix="kg"
              keyboardType="decimal-pad"
              value={text}
              onChangeText={setText}
              placeholder={last ? fmtNum(last.kg) : "78"}
              error={invalid ? "Entre 30 y 250 kg" : undefined}
              onSubmitEditing={save}
            />
            <View style={{ paddingBottom: invalid ? 22 : 0 }}>
              <Button testID="weight-save" label={existing ? "Reemplazar" : "Registrar peso"} disabled={kg === null || invalid} onPress={save} />
            </View>
          </View>
          <Text variant="caption" color="faint">
            Si es tu peso más reciente, se actualiza tu perfil y el objetivo pasa a {fmtInt(targets.kcal)} kcal cuando sea distinto.
          </Text>
        </Card>

        <Button label="Medidas corporales" icon="body-outline" variant="secondary" size="sm" onPress={() => router.push("/medidas")} />

        {list.length > 0 ? (
          <Section kind="overline" title="Historial" gap={space.sm}>
            <Card padded={false}>
              {[...list].reverse().map((w, i) => (
                <View
                  key={w.date}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingLeft: space.lg,
                    borderTopWidth: i > 0 ? 1 : 0,
                    borderTopColor: c.border,
                  }}
                >
                  <Text variant="body" style={{ flex: 1 }}>
                    {dayLabel(w.date, today)}
                  </Text>
                  <Text variant="bodyStrong" tabular>
                    {fmtNum(w.kg)} kg
                  </Text>
                  <IconButton
                    icon="trash-outline"
                    label={`Borrar peso del ${shortDayLabel(w.date)}`}
                    color="muted"
                    size="md"
                    onPress={() => {
                      const removed = removeWeight(w.date);
                      if (removed) toast("Peso borrado", { actionLabel: "Deshacer", onAction: () => addWeight(removed.date, removed.kg) });
                    }}
                  />
                </View>
              ))}
            </Card>
          </Section>
        ) : (
          <EmptyState icon="scale-outline" title="Sin pesos todavía" text="Anota tu primer peso arriba." />
        )}
      </View>
    </Screen>
  );
}

function i0(d: string, today: string): string {
  const rel = dayLabel(d, today);
  return ["Hoy", "Ayer"].includes(rel) ? rel : shortDayLabel(d);
}

