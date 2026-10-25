// Pestaña «Progreso» de Running: km y ritmo por semana y marcas (`runningPRs`).
import { useMemo } from "react";
import { View } from "react-native";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import { Badge, Card, Section, Text } from "@/components/ui";
import { dayLabel } from "@/domain/dates";
import { fmtDuration, fmtKm, fmtPace } from "@/domain/format";
import { avgPace, prTimeS, RUNNING_PR_LABEL, runningPRs, weekStart, weeklyTotals, type Activity } from "@/domain/running";
import { space } from "@/theme/tokens";

export function RunningProgress({ activities, today }: { activities: readonly Activity[]; today: string }) {
  const progress = useMemo(() => {
    const weeks = weeklyTotals(activities, today, 8);
    const labels = weeks.map((w) => `${Number(w.weekStart.slice(8))}/${Number(w.weekStart.slice(5, 7))}`);
    const paces = weeks.map((w) => (w.meters > 0 ? w.pacedSeconds / (w.meters / 1000) : null));
    const last4 = weeks.slice(-4);
    const km4 = last4.reduce((x, w) => x + w.meters, 0);
    const prs = runningPRs(activities);
    return { weeks, labels, paces, km4, prs };
  }, [activities, today]);

  return (
    <View style={{ gap: space.lg }}>
      <Card style={{ gap: space.md }}>
        <Text variant="heading">Kilómetros por semana</Text>
        <BarChart
          data={progress.weeks.map((w, i) => ({
            label: progress.labels[i],
            value: w.meters / 1000,
            highlight: w.weekStart === weekStart(today),
          }))}
          format={(v) => v.toFixed(0)}
          height={130}
          showValues="all"
          summary={`Kilómetros por semana: ${progress.weeks.map((w, i) => `${progress.labels[i]} ${fmtKm(w.meters)}`).join(", ")}`}
        />
        <Text variant="caption" color="muted">
          Últimas 4 semanas: {fmtKm(progress.km4)} km
        </Text>
      </Card>
      <Card style={{ gap: space.md }}>
        <Text variant="heading">Ritmo medio semanal</Text>
        <LineChart
          values={progress.paces}
          labels={progress.labels}
          invert
          format={(v) => `${fmtPace(v)}/km`}
          summary={`Ritmo medio por semana: ${progress.paces.map((p, i) => (p ? `${progress.labels[i]} ${fmtPace(p)}` : null)).filter(Boolean).join(", ")}`}
        />
        <Text variant="caption" color="faint">
          Más arriba = más rápido.
        </Text>
      </Card>
      <Section kind="overline" title="Marcas" gap={space.sm}>
        {progress.prs.longest ? (
          <PrCard testID="pr-longest" label={RUNNING_PR_LABEL.longest} tone="brand" value={`${fmtKm(progress.prs.longest.distanceM)} km`} when={dayLabel(progress.prs.longest.date, today)} />
        ) : null}
        {progress.prs.fastest_pace ? (
          <PrCard testID="pr-fastest-pace" label={RUNNING_PR_LABEL.fastest_pace} tone="success" value={`${fmtPace(avgPace(progress.prs.fastest_pace))}/km`} when={dayLabel(progress.prs.fastest_pace.date, today)} />
        ) : null}
        {(["5k", "10k", "half_marathon"] as const).map((key) => {
          const a = progress.prs[key];
          if (!a) return null;
          return <PrCard key={key} testID={`pr-${key}`} label={RUNNING_PR_LABEL[key]} tone="success" value={fmtDuration(prTimeS(a, key))} when={dayLabel(a.date, today)} />;
        })}
      </Section>
    </View>
  );
}

/**
 * Tarjeta de una marca: la etiqueta arriba y, debajo, el valor y la fecha en una sola línea cada
 * uno. Antes iban los tres en fila y con «Mejor media maratón» + una fecha larga el tiempo se
 * quedaba en ~22 dp y se partía letra a letra.
 */
function PrCard({ label, tone, value, when, testID }: { label: string; tone: "brand" | "success"; value: string; when: string; testID?: string }) {
  return (
    <Card testID={testID} style={{ gap: space.xs }}>
      <Badge label={label} tone={tone} />
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.md }}>
        <Text variant="bodyStrong" tabular numberOfLines={1} style={{ flex: 1 }}>
          {value}
        </Text>
        <Text variant="caption" color="muted" numberOfLines={1} style={{ flexShrink: 1 }}>
          {when}
        </Text>
      </View>
    </Card>
  );
}
