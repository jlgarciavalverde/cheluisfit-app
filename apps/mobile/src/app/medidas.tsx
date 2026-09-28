import { useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { LineChart } from "@/components/charts/LineChart";
import { Button, Card, Chip, EmptyState, IconButton, Overline, Section, Text, TextField, ChipRow } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useNutrition } from "@/data/store";
import { addDays, dayLabel, shortDayLabel, todayKey } from "@/domain/dates";
import { fmtNum, parseNum } from "@/domain/format";
import { isPlausibleMeasurement, latestMeasurement, MEASUREMENT_KINDS, MEASUREMENT_LABEL, normalizeMeasurements } from "@/domain/measurements";
import type { MeasurementKind } from "@/domain/types";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

const i0 = (d: string, today: string) => {
  const rel = dayLabel(d, today);
  return ["Hoy", "Ayer"].includes(rel) ? rel : shortDayLabel(d);
};

export default function MeasurementsScreen() {
  const { c } = useTheme();
  const measurements = useNutrition((s) => s.measurements);
  const addMeasurement = useNutrition((s) => s.addMeasurement);
  const removeMeasurement = useNutrition((s) => s.removeMeasurement);
  const today = todayKey();
  const [kind, setKind] = useState<MeasurementKind>("waist");
  const [date, setDate] = useState(today);
  const [text, setText] = useState("");

  const list = normalizeMeasurements(measurements, kind);
  const last = latestMeasurement(measurements, kind);
  const cm = parseNum(text);
  const invalid = text.trim() !== "" && (cm === null || !isPlausibleMeasurement(cm));
  const chart = list.slice(-12);
  const existing = list.find((m) => m.date === date);

  const save = () => {
    if (cm === null || !isPlausibleMeasurement(cm)) return;
    addMeasurement(date, kind, cm);
    setText("");
    toast(`${MEASUREMENT_LABEL[kind]} guardada`);
  };

  return (
    <Screen variant="form" testID="screen-medidas">
      <ScreenHeader title="Medidas corporales" back />
      <View style={{ gap: space.lg }}>
        {/* Filtro de zona: misma fila de chips que el resto de filtros (desplazable en el móvil). */}
        <ChipRow>
          {MEASUREMENT_KINDS.map((k) => (
            <Chip key={k} testID={`kind-${k}`} label={MEASUREMENT_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} />
          ))}
        </ChipRow>

        <Card style={{ gap: space.md }}>
          <View>
            <Overline color="brandText">Última medida</Overline>
            <Text variant="display" tabular testID="last-measurement">
              {last ? fmtNum(last.cm) : "—"}
              <Text variant="body" color="muted"> cm</Text>
            </Text>
            {last ? (
              <Text variant="caption" color="muted">
                {dayLabel(last.date, today)}
              </Text>
            ) : null}
          </View>
          {chart.length >= 2 ? (
            <LineChart
              values={chart.map((m) => m.cm)}
              labels={chart.map((m) => `${Number(m.date.slice(8))}/${Number(m.date.slice(5, 7))}`).filter((_, i) => i % Math.ceil(chart.length / 6) === 0)}
              format={(v) => `${fmtNum(v)} cm`}
              invert
              summary={`${MEASUREMENT_LABEL[kind]}: ${chart.map((m) => `${shortDayLabel(m.date)} ${fmtNum(m.cm)} centímetros`).join(", ")}`}
            />
          ) : (
            <Text variant="body" color="muted">
              Con dos medidas empieza a dibujarse la gráfica.
            </Text>
          )}
        </Card>

        <Card style={{ gap: space.md }}>
          <Text variant="heading">Anotar {MEASUREMENT_LABEL[kind].toLowerCase()}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {Array.from({ length: 6 }, (_, i) => addDays(today, -i)).map((d) => (
              <Chip key={d} label={i0(d, today)} selected={date === d} onPress={() => setDate(d)} />
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm }}>
            <TextField
              testID="measurement-input"
              label={MEASUREMENT_LABEL[kind]}
              suffix="cm"
              keyboardType="decimal-pad"
              value={text}
              onChangeText={setText}
              placeholder={last ? fmtNum(last.cm) : "90"}
              error={invalid ? "Entre 10 y 200 cm" : undefined}
              onSubmitEditing={save}
            />
            <View style={{ paddingBottom: invalid ? 22 : 0 }}>
              <Button testID="measurement-save" label={existing ? "Reemplazar" : "Registrar"} disabled={cm === null || invalid} onPress={save} />
            </View>
          </View>
        </Card>

        {list.length > 0 ? (
          <Section kind="overline" title="Historial" gap={space.sm}>
            <Card padded={false} testID="measurement-history">
              {[...list].reverse().map((m, i) => (
                <View
                  key={m.date}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingLeft: space.lg,
                    borderTopWidth: i > 0 ? 1 : 0,
                    borderTopColor: c.border,
                  }}
                >
                  <Text variant="body" style={{ flex: 1 }}>
                    {dayLabel(m.date, today)}
                  </Text>
                  <Text variant="bodyStrong" tabular>
                    {fmtNum(m.cm)} cm
                  </Text>
                  <IconButton
                    icon="trash-outline"
                    label={`Borrar ${MEASUREMENT_LABEL[kind].toLowerCase()} del ${shortDayLabel(m.date)}`}
                    color="muted"
                    size="md"
                    onPress={() => {
                      const removed = removeMeasurement(m.date, kind);
                      if (removed) toast(`${MEASUREMENT_LABEL[kind]} borrada`, { actionLabel: "Deshacer", onAction: () => addMeasurement(removed.date, removed.kind, removed.cm) });
                    }}
                  />
                </View>
              ))}
            </Card>
          </Section>
        ) : (
          <EmptyState icon="body-outline" title={`Sin medidas de ${MEASUREMENT_LABEL[kind].toLowerCase()} todavía`} text="Anota tu primera medida arriba." />
        )}
      </View>
    </Screen>
  );
}
