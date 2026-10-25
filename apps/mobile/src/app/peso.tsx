import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { LineChart } from "@/components/charts/LineChart";
import { Button, Card, Chip, EmptyState, IconButton, ListGroup, ListRow, Section, Stat, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useNutrition, useTargets } from "@/data/store";
import { addDays, dayLabel, shortDayLabel, todayKey } from "@/domain/dates";
import { fmtInt, fmtNum, parseNum } from "@/domain/format";
import { isPlausibleWeight, latestWeight, normalizeWeights, weightChange } from "@/domain/weight";
import { space } from "@/theme/tokens";

export default function WeightScreen() {
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
            <Stat size="xl" value={last ? fmtNum(last.kg) : "—"} unit="kg" label={last ? `Último peso · ${dayLabel(last.date, today)}` : "Último peso"} valueTestID="last-weight" />
            {change30 !== null ? (
              <Stat
                size="md"
                align="center"
                value={`${change30 > 0 ? "+" : change30 < 0 ? "−" : ""}${fmtNum(Math.abs(change30))}`}
                unit="kg"
                label="en 30 días"
                valueTestID="weight-change"
              />
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
            <ListGroup>
              {[...list].reverse().map((w) => (
                <ListRow
                  key={w.date}
                  title={dayLabel(w.date, today)}
                  minHeight={52}
                  value={<Text variant="bodyStrong" tabular>{fmtNum(w.kg)} kg</Text>}
                  trailing={
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
                  }
                />
              ))}
            </ListGroup>
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

