import { router } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { BarChart } from "@/components/charts/BarChart";
import { ActivityCard } from "@/components/running/ActivityCard";
import { PlanSheet } from "@/components/running/PlanSheet";
import { RunningProgress } from "@/components/running/RunningProgress";
import { RunningTemplates } from "@/components/running/RunningTemplates";
import { SyncPanel } from "@/components/running/SyncPanel";
import { formatMinutes } from "@/components/running/TemplateCard";
import { Button, Card, EmptyState, Icon, ResponsiveGrid, Section, SegmentedControl, Stat, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useRunning } from "@/data/runningStore";
import { addDays, dayLabel, shortDayLabel, todayKey } from "@/domain/dates";
import { fmtKm } from "@/domain/format";
import { dailyMeters, estimateTemplate, weeklyTotals } from "@/domain/running";
import { space } from "@/theme/tokens";

type Tab = "sessions" | "templates" | "progress";
const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

const PAGE = 30;

export default function RunningScreen() {
  const [tab, setTab] = useState<Tab>("sessions");
  const [planFor, setPlanFor] = useState<string | null>(null);
  const templates = useRunning((s) => s.templates);
  const activities = useRunning((s) => s.activities);
  const planned = useRunning((s) => s.planned);
  const planTemplate = useRunning((s) => s.planTemplate);
  const unplan = useRunning((s) => s.unplan);

  const today = todayKey();
  const sorted = useMemo(() => [...activities].sort((a, b) => b.date.localeCompare(a.date)), [activities]);
  const [shown, setShown] = useState(PAGE);
  const tplById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const week = useMemo(() => weeklyTotals(activities, today, 1)[0], [activities, today]);
  const daily = useMemo(() => dailyMeters(activities, today), [activities, today]);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const nextPlanned = useMemo(
    () => planned.filter((p) => p.date >= today && !p.activityId).sort((a, b) => a.date.localeCompare(b.date)),
    [planned, today],
  );
  const recentPlans = useMemo(
    () =>
      planned
        .filter((p) => p.date < today && p.date >= addDays(today, -7))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [planned, today],
  );
  const planTitle = planFor ? (tplById.get(planFor)?.name ?? "") : "";


  const sessions = (
    <View style={{ gap: space.lg }}>
      <Card style={{ gap: space.lg }} testID="week-summary">
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
          <Stat size="xl" value={fmtKm(week.meters)} unit="km" label="Esta semana" />
          <View style={{ alignItems: "flex-end" }}>
            <Text variant="bodyStrong" tabular>
              {week.sessions} {week.sessions === 1 ? "sesión" : "sesiones"}
            </Text>
            <Text variant="caption" color="muted">
              {formatMinutes(week.seconds)}
            </Text>
          </View>
        </View>
        <BarChart
          data={daily.map((m, i) => ({ label: DAYS[i], value: m / 1000, highlight: i === todayIdx }))}
          format={(v) => v.toFixed(1).replace(".", ",")}
          height={90}
          showValues="all"
          summary={`Kilómetros por día esta semana: ${daily.map((m, i) => `${DAYS[i]} ${fmtKm(m)}`).join(", ")}`}
        />
      </Card>

      <Button
        testID="new-session"
        label="Registrar carrera a mano"
        icon="add"
        variant="secondary"
        onPress={() => router.push("/sesion/nueva")}
      />

      {nextPlanned.length > 0 ? (
        <Section kind="overline" title="Próximos entrenamientos" gap={space.sm}>
          {nextPlanned.slice(0, 3).map((p) => {
            const t = tplById.get(p.templateId);
            if (!t) return null;
            const est = estimateTemplate(t);
            return (
              <Card key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md }} testID={`planned-${p.id}`}>
                <View style={{ width: 56, alignItems: "center" }}>
                  <Text variant="caption" color="brandText">
                    {dayLabel(p.date, today) === "Mañana" ? "Mañana" : shortDayLabel(p.date).split(" ")[0]}
                  </Text>
                  <Text variant="numeralS">
                    {Number(p.date.slice(8))}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text variant="subheading" numberOfLines={1}>
                    {t.name}
                  </Text>
                  <Text variant="caption" color="muted" tabular>
                    {est.meters > 0 ? `≈ ${fmtKm(est.meters)} km · ${formatMinutes(est.seconds)}` : "Sin distancia definida"}
                  </Text>
                </View>
                <Button
                  label="Quitar"
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    const removed = unplan(p.id);
                    if (removed) toast("Entrenamiento quitado", { actionLabel: "Deshacer", onAction: () => useRunning.getState().restorePlanned(removed) });
                  }}
                />
              </Card>
            );
          })}
        </Section>
      ) : null}

      {recentPlans.length > 0 ? (
        <Section kind="overline" title="Plan de los últimos días" gap={space.sm}>
          {recentPlans.map((p) => {
            const t = tplById.get(p.templateId);
            if (!t) return null;
            const done = !!p.activityId && activities.some((a) => a.id === p.activityId);
            return (
              <Card key={p.id} testID={`recent-${p.id}`} style={{ gap: space.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                  <Icon name={done ? "checkmark-circle" : "alert-circle-outline"} size="lg" color={done ? "success" : "warning"} />
                  <View style={{ flex: 1 }}>
                    <Text variant="subheading" numberOfLines={1}>
                      {t.name}
                    </Text>
                    <Text variant="caption" color="muted">
                      {dayLabel(p.date, today)} · {done ? "Hecho" : "Sin registrar"}
                    </Text>
                  </View>
                  {done ? (
                    <Button
                      label="Ver"
                      variant="ghost"
                      size="sm"
                      onPress={() => router.push({ pathname: "/sesion/[id]", params: { id: p.activityId as string } })}
                    />
                  ) : null}
                </View>
                {!done ? (
                  <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                    <Button
                      testID={`register-${p.id}`}
                      label="Registrar a mano"
                      icon="create-outline"
                      variant="secondary"
                      size="sm"
                      onPress={() => router.push({ pathname: "/sesion/nueva", params: { date: p.date, templateId: p.templateId } })}
                    />
                    <Button
                      label="Quitar del plan"
                      variant="ghost"
                      size="sm"
                      onPress={() => {
                        const removed = unplan(p.id);
                        if (removed) toast("Entrenamiento quitado", { actionLabel: "Deshacer", onAction: () => useRunning.getState().restorePlanned(removed) });
                      }}
                    />
                  </View>
                ) : null}
              </Card>
            );
          })}
        </Section>
      ) : null}

      <Section kind="overline" title="Sesiones" gap={space.sm}>
        <SyncPanel />


        {sorted.length === 0 ? (
          <EmptyState icon="walk-outline" title="Aún no hay sesiones" text="Sincroniza tu Garmin/Strava o registra una carrera a mano." />
        ) : (
          <>
            {/* De 30 en 30: con años de historial de Health Connect se pintaban cientos de tarjetas de golpe. */}
            <ResponsiveGrid>
              {sorted.slice(0, shown).map((a) => (
                <ActivityCard
                  key={a.id}
                  activity={a}
                  template={a.templateId ? tplById.get(a.templateId) : undefined}
                  onPress={() => router.push({ pathname: "/sesion/[id]", params: { id: a.id } })}
                />
              ))}
            </ResponsiveGrid>
            {sorted.length > shown ? (
              <Button testID="more-sessions" label={`Ver más (${sorted.length - shown})`} variant="secondary" onPress={() => setShown((n) => n + PAGE)} />
            ) : null}
          </>
        )}
      </Section>
    </View>
  );

  return (
    <Screen variant="tab" testID="screen-running">
      <ScreenHeader title="Running" />
      <View style={{ gap: space.lg }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: "sessions", label: "Sesiones" },
            { value: "templates", label: "Plantillas" },
            { value: "progress", label: "Progreso" },
          ]}
        />
        {tab === "sessions" ? sessions : tab === "templates" ? <RunningTemplates onPlan={setPlanFor} /> : <RunningProgress activities={activities} today={today} />}
      </View>
      <PlanSheet
        visible={planFor !== null}
        title={planTitle}
        onClose={() => setPlanFor(null)}
        onPick={(date) => {
          if (!planFor) return;
          const id = planTemplate(planFor, date);
          setPlanFor(null);
          toast(`Planificada para ${dayLabel(date, today).toLowerCase()}`, {
            actionLabel: "Deshacer",
            onAction: () => unplan(id),
          });
        }}
      />
    </Screen>
  );
}
