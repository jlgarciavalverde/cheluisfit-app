import { View } from "react-native";
import { weekDates } from "@/domain/dates";
import { fmtInt } from "@/domain/format";
import { weekSummary } from "@/domain/nutrition";
import type { Entry, Targets } from "@/domain/types";
import { space } from "@/theme/tokens";
import { BarChart } from "../charts/BarChart";
import { Card } from "../ui/Card";
import { EmptyState } from "../ui/EmptyState";
import { Text } from "../ui/Text";
import { MacroBars } from "./DaySummary";
import { Overline } from "../ui/Section";

const LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

/** Resumen de la semana del día seleccionado: kcal por día, media y días en objetivo. */
export function WeekView({
  date,
  entries,
  targets,
}: {
  date: string;
  entries: readonly Entry[];
  targets: Targets;
}) {
  const dates = weekDates(date);
  const s = weekSummary(entries, dates, targets.kcal);

  if (s.loggedDays === 0) {
    return (
      <EmptyState
        icon="calendar-outline"
        title="Sin registros esta semana"
        text="Cuando anotes lo que comes, aquí verás cómo va la semana."
      />
    );
  }

  return (
    <View style={{ gap: space.lg }} testID="week-view">
      <Card style={{ gap: space.lg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
          <View>
            <Overline color="brandText">Media diaria</Overline>
            <Text variant="display" tabular testID="week-avg">
              {fmtInt(s.average.kcal)}
              <Text variant="body" color="muted"> kcal</Text>
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text variant="bodyStrong" tabular testID="week-ontarget">
              {s.onTargetDays} de {s.loggedDays}
            </Text>
            <Text variant="caption" color="muted">
              días en objetivo (±10 %)
            </Text>
          </View>
        </View>
        <BarChart
          data={s.days.map((d, i) => ({ label: LETTERS[i], value: d.totals.kcal, highlight: d.date === date }))}
          format={(v) => fmtInt(v)}
          height={130}
          target={targets.kcal}
          showValues="highlight"
          summary={`Calorías por día: ${s.days.map((d, i) => `${LETTERS[i]} ${fmtInt(d.totals.kcal)}`).join(", ")}. Objetivo ${fmtInt(targets.kcal)}.`}
        />
        <Text variant="caption" color="faint">
          La línea discontinua marca tu objetivo de {fmtInt(targets.kcal)} kcal.
        </Text>
      </Card>
      <Card style={{ gap: space.md }}>
        <Text variant="heading">Media de macros</Text>
        <MacroBars totals={s.average} targets={targets} />
        <Text variant="caption" color="faint">
          Solo cuentan los días con registros.
        </Text>
      </Card>
    </View>
  );
}
