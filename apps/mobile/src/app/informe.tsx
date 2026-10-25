import { useMemo, useState } from "react";
import { View } from "react-native";
import { AnalysisCard } from "@/components/ai/AnalysisCard";
import { BarChart } from "@/components/charts/BarChart";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Card, IconButton, Section, Stat, StatGrid, Text } from "@/components/ui";
import { useRunning } from "@/data/runningStore";
import { useNutrition, useTargets } from "@/data/store";
import { useStrength } from "@/data/strengthStore";
import { weekAnalysisData, weekKey, weeklyGroupSets, zoneMinutes } from "@/domain/analysis";
import { addDays, fromDateKey, todayKey, weekDates } from "@/domain/dates";
import { fmtKm } from "@/domain/format";
import { defaultMaxHr } from "@/domain/running";
import { GROUP_LABEL, GROUP_ORDER, workoutTotals, type MuscleGroup } from "@/domain/strength";
import { space } from "@/theme/tokens";

/** Etiquetas cortas para que quepan 7 barras en un móvil de 360 dp. */
const SHORT_GROUP: Record<MuscleGroup, string> = { chest: "Pecho", back: "Esp.", shoulders: "Homb.", biceps: "Bíc.", triceps: "Tríc.", legs: "Pierna", core: "Core", other: "Otros" };

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const shortDate = (key: string) => {
  const d = fromDateKey(key);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/**
 * Informe semanal: fuerza, running y nutrición de una semana (lunes a domingo) con gráficos y el
 * análisis de la IA (`kind: "week"`, guardado en `useStrength().weekAnalyses` por lunes).
 */
export default function ReportScreen() {
  const [offset, setOffset] = useState(0);
  const monday = weekKey(addDays(todayKey(), -7 * offset));
  const dates = useMemo(() => weekDates(monday), [monday]);
  const workouts = useStrength((s) => s.workouts);
  const weekAnalyses = useStrength((s) => s.weekAnalyses);
  const activities = useRunning((s) => s.activities);
  const entries = useNutrition((s) => s.entries);
  const profile = useNutrition((s) => s.profile);
  const targets = useTargets();
  const maxHr = profile.maxHr ?? defaultMaxHr(profile.age);

  const ws = workouts.filter((w) => dates.includes(w.date));
  const runs = activities.filter((a) => dates.includes(a.date) && a.type === "run");
  const km = runs.reduce((s, a) => s + a.distanceM, 0);
  const activeDays = new Set([...ws.map((w) => w.date), ...activities.filter((a) => dates.includes(a.date)).map((a) => a.date)]).size;
  const loggedDays = dates.filter((d) => entries.some((e) => e.date === d));
  const avgKcal = loggedDays.length
    ? Math.round(loggedDays.reduce((s, d) => s + entries.filter((e) => e.date === d).reduce((x, e) => x + e.nutrients.kcal, 0), 0) / loggedDays.length)
    : null;
  const groups = weeklyGroupSets(workouts, dates);
  const shown = GROUP_ORDER.filter((g) => g !== "other");
  const groupBars = shown.map((g) => ({ label: SHORT_GROUP[g], value: groups[g], highlight: groups[g] >= 10 }));
  const zones = zoneMinutes(activities, dates, maxHr);
  const volume = ws.reduce((s, w) => s + workoutTotals(w).volume, 0);
  const title = offset === 0 ? "Esta semana" : offset === 1 ? "La semana pasada" : `Semana del ${shortDate(dates[0])}`;

  return (
    <Screen testID="screen-informe">
      <ScreenHeader title="Informe semanal" subtitle="Fuerza, running y comida de un vistazo" back />
      <View style={{ gap: space.xl }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <IconButton testID="week-prev" icon="chevron-back" label="Semana anterior" disabled={offset >= 11} onPress={() => setOffset((o) => o + 1)} />
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text variant="heading" testID="week-title">
              {title}
            </Text>
            <Text variant="caption" color="muted">
              {shortDate(dates[0])} – {shortDate(dates[6])}
            </Text>
          </View>
          <IconButton testID="week-next" icon="chevron-forward" label="Semana siguiente" disabled={offset === 0} onPress={() => setOffset((o) => o - 1)} />
        </View>

        <StatGrid columns={2}>
          <Stat label="Días activos" value={String(activeDays)} unit="de 7" />
          <Stat label="Entrenos de fuerza" value={String(ws.length)} unit={volume ? `${Math.round(volume / 100) / 10} t` : undefined} />
          <Stat label="Running" value={fmtKm(km)} unit="km" />
          <Stat label="Media de kcal" value={avgKcal != null ? String(avgKcal) : "—"} unit={avgKcal != null ? `de ${targets.kcal}` : undefined} />
        </StatGrid>

        <AnalysisCard
          kind="week"
          analysisKey={monday}
          title="Análisis de la semana"
          testID="week-analysis"
          stored={weekAnalyses[monday]}
          data={() =>
            weekAnalysisData(monday, {
              workouts: useStrength.getState().workouts,
              activities: useRunning.getState().activities,
              entries: useNutrition.getState().entries,
              targetKcal: targets.kcal,
              targetProtein: targets.protein,
            })
          }
          onSave={(a) => useStrength.getState().setWeekAnalysis(monday, a)}
        />

        <Section title="Series por grupo muscular" subtitle="Referencia: 10–20 series por semana (las secundarias cuentan media)">
          <Card>
            {ws.length ? (
              <BarChart
                data={groupBars}
                summary={`Series esta semana: ${shown.map((g) => `${GROUP_LABEL[g]} ${groups[g]}`).join(", ")}`}
                showValues="all"
                target={10}
              />
            ) : (
              <Text variant="body" color="muted">
                Sin entrenos de fuerza esta semana.
              </Text>
            )}
          </Card>
        </Section>

        <Section title="Minutos por zona de pulso" subtitle={`Aproximado con la FC media de cada sesión (FC máx. ${maxHr})`}>
          <Card>
            {zones.some((z) => z > 0) ? (
              <BarChart
                data={zones.map((v, i) => ({ label: `Z${i + 1}`, value: v, color: i >= 3 ? "danger" : i === 2 ? "warning" : "success" }))}
                summary={`Minutos por zona: ${zones.map((v, i) => `zona ${i + 1} ${v}`).join(", ")}`}
                showValues="all"
              />
            ) : (
              <Text variant="body" color="muted">
                Sin sesiones con pulsómetro esta semana.
              </Text>
            )}
          </Card>
        </Section>
      </View>
    </Screen>
  );
}
