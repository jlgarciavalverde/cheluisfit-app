import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { BarChart } from "@/components/charts/BarChart";
import { RouteMap } from "@/components/running/RouteMap";
import { Callout, Badge, BottomSheet, Button, Card, Chip, EmptyState, Icon, Overline, Stat, StatGrid, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { fetchExerciseRoute } from "@/data/healthConnect";
import { useRunning } from "@/data/runningStore";
import { useNutrition } from "@/data/store";
import { dayLabel, fromDateKey } from "@/domain/dates";
import { fmtDuration, fmtKm, fmtPace } from "@/domain/format";
import { type Activity, avgPace, defaultMaxHr, hrZoneOf, planVsActual, STEP_LABEL, type StepKind } from "@/domain/running";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";
import type { Palette } from "@/theme/tokens";
import type { IconName } from "@/components/ui";

const KIND_COLOR: Record<StepKind, keyof Palette> = {
  warmup: "muted",
  work: "brandText",
  recovery: "fat",
  cooldown: "muted",
  free: "text",
};

const SOURCE_BADGE: Record<Activity["source"], { label: string; icon: IconName }> = {
  garmin: { label: "Reloj · Health Connect", icon: "watch-outline" },
  strava: { label: "Strava", icon: "navigate-outline" },
  manual: { label: "Registro manual", icon: "create-outline" },
};

const longDate = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" });

export default function SessionScreen() {
  const { c } = useTheme();
  const { isWide } = useBreakpoint();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activity = useRunning((s) => s.activities.find((a) => a.id === id));
  const templates = useRunning((s) => s.templates);
  const update = useRunning((s) => s.updateActivity);
  const linkTemplate = useRunning((s) => s.linkTemplate);
  const deleteActivity = useRunning((s) => s.deleteActivity);
  const restoreActivity = useRunning((s) => s.restoreActivity);
  const profile = useNutrition((s) => s.profile);
  const [notes, setNotes] = useState(activity?.notes ?? "");
  const [linking, setLinking] = useState(false);
  const [routeStatus, setRouteStatus] = useState<"idle" | "loading" | "none">("idle");

  const fetchRoute = async () => {
    if (!activity?.externalId) return;
    setRouteStatus("loading");
    const route = await fetchExerciseRoute(activity.externalId);
    // Un único punto no es un recorrido dibujable (`RouteMap` exige >1) — tratarlo como "sin
    // ruta" en vez de guardarlo, o el botón "Ver recorrido" volvería a aparecer sin parar.
    if (route && route.length > 1) {
      update(activity.id, { route });
      setRouteStatus("idle");
    } else {
      setRouteStatus("none");
    }
  };
  const maxHr = profile.maxHr ?? defaultMaxHr(profile.age);

  if (!activity) {
    return (
      <Screen>
        <ScreenHeader title="Sesión" back />
        <EmptyState icon="alert-circle-outline" title="No encuentro esta sesión" />
      </Screen>
    );
  }
  const tpl = activity.templateId ? templates.find((t) => t.id === activity.templateId) : undefined;
  const planned = activity.plan ?? tpl;
  const pv = planned ? planVsActual(planned, activity) : null;
  const rel = dayLabel(activity.date);
  const date = longDate.format(fromDateKey(activity.date));
  const hasLaps = !!activity.laps && activity.laps.length > 0;

  return (
    <Screen testID="screen-sesion">
      <ScreenHeader title={activity.title} subtitle={["Hoy", "Ayer"].includes(rel) ? `${rel} · ${date}` : date} back />
      <View style={{ gap: space.lg }}>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Badge label={SOURCE_BADGE[activity.source].label} icon={SOURCE_BADGE[activity.source].icon} />
          {tpl ? <Badge label={tpl.name} tone="brand" icon="list-outline" /> : null}
        </View>

        <StatGrid>
          <Stat label="Distancia" value={fmtKm(activity.distanceM)} unit="km" />
          <Stat label="Tiempo" value={fmtDuration(activity.durationS)} />
          <Stat label="Ritmo medio" value={fmtPace(avgPace(activity))} unit="/km" />
          {activity.avgHr ? (
            <Stat label={`FC media${hrZoneOf(activity.avgHr, maxHr) ? ` · Zona ${hrZoneOf(activity.avgHr, maxHr)}` : ""}`} value={String(activity.avgHr)} unit="ppm" />
          ) : null}
          {activity.maxHr ? <Stat label="FC máxima" value={String(activity.maxHr)} unit="ppm" /> : null}
          {activity.ascentM !== undefined ? <Stat label="Desnivel +" value={String(activity.ascentM)} unit="m" /> : null}
          {activity.kcal ? <Stat label="Calorías" value={String(activity.kcal)} unit="kcal" /> : null}
        </StatGrid>

        {(() => {
          const planInfo = (
            <>
              <Card tone="alt" style={{ gap: space.sm }} testID="plan-link">
                <Overline color="muted">Plantilla</Overline>
                {planned ? (
                  // El nombre en su línea y los botones debajo: con `flex: 1` junto a dos botones, un
                  // nombre largo se quedaba en ~75 dp y ocupaba 5 o 6 líneas.
                  <View style={{ gap: space.sm }}>
                    <Text variant="bodyStrong" numberOfLines={2}>
                      {planned.name}
                    </Text>
                    <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                      <Button label="Cambiar" variant="secondary" size="sm" onPress={() => setLinking(true)} />
                      <Button label="Desvincular" variant="ghost" size="sm" onPress={() => linkTemplate(activity.id, null)} />
                    </View>
                  </View>
                ) : (
                  <View style={{ gap: space.sm }}>
                    <Text variant="body" color="muted">
                      Vincúlala con una plantilla para comparar lo planificado con lo que hiciste.
                    </Text>
                    <Button testID="link-template" label="Vincular con una plantilla" icon="link-outline" variant="secondary" size="sm" onPress={() => setLinking(true)} />
                  </View>
                )}
              </Card>

              {pv ? (
                <Card tone="alt" style={{ gap: space.sm }} testID="plan-vs-real">
                  <Overline color="brandText">Plan vs. real</Overline>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <Icon name={pv.doneReps >= pv.plannedReps ? "checkmark-circle" : "alert-circle"} size="md" color={pv.doneReps >= pv.plannedReps ? "success" : "warning"} />
                    <Text variant="bodyStrong">
                      {pv.doneReps} de {pv.plannedReps} series hechas
                    </Text>
                  </View>
                  {pv.avgWorkPace ? (
                    <Text variant="body" color="muted">
                      Ritmo medio en las series: <Text variant="bodyStrong">{fmtPace(pv.avgWorkPace)}/km</Text>
                    </Text>
                  ) : null}
                </Card>
              ) : null}
            </>
          );

          const feelings = (
            <>
              <View style={{ gap: space.sm }}>
                <Text variant="heading">¿Cómo te has sentido?</Text>
                <Text variant="caption" color="muted">
                  Esfuerzo percibido (1 = paseo, 10 = máximo)
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <Chip key={n} label={String(n)} selected={activity.rpe === n} onPress={() => update(activity.id, { rpe: activity.rpe === n ? undefined : n })} />
                  ))}
                </View>
              </View>

              <TextField
                label="Notas"
                value={notes}
                onChangeText={(t) => {
                  setNotes(t);
                  update(activity.id, { notes: t });
                }}
                placeholder="Sensaciones, clima, calzado…"
                multiline
                style={{ minHeight: 84, textAlignVertical: "top" }}
              />
            </>
          );

          const routeLaps = (
            <View style={{ gap: space.lg }}>
              {activity.route && activity.route.length > 1 ? (
                <View style={{ gap: space.sm }}>
                  <Text variant="heading">Recorrido</Text>
                  <RouteMap route={activity.route} />
                </View>
              ) : activity.source === "garmin" && activity.externalId && routeStatus !== "none" ? (
                <Button
                  testID="fetch-route"
                  label={routeStatus === "loading" ? "Buscando recorrido…" : "Ver recorrido"}
                  icon="map-outline"
                  variant="secondary"
                  disabled={routeStatus === "loading"}
                  onPress={fetchRoute}
                />
              ) : activity.source === "garmin" ? (
                <Callout icon="map-outline">Esta sesión no trae ruta GPS.</Callout>
              ) : null}

              {hasLaps && activity.laps!.length >= 3 ? (
                <Card style={{ gap: space.md }} testID="lap-chart">
                  <Text variant="heading">Ritmo por vuelta</Text>
                  <BarChart
                    data={activity.laps!.map((l) => ({
                      label: String(l.index),
                      value: (l.distanceM / l.durationS) * 3.6,
                      highlight: l.kind === "work",
                    }))}
                    format={(v) => fmtPace(3600 / v)}
                    height={120}
                    showValues="highlight"
                    summary={`Ritmo por vuelta: ${activity.laps!.map((l) => `${l.index}: ${(l.distanceM > 0 ? fmtPace(avgPace(l)) : "—")}`).join(", ")}`}
                  />
                  <Text variant="caption" color="faint">
                    Barras más altas = más rápido. En color, las series.
                  </Text>
                </Card>
              ) : null}

              {hasLaps ? (
                <View style={{ gap: space.sm }}>
                  <Text variant="heading">Vueltas</Text>
                  <Card padded={false} testID="laps">
                    <View style={{ flexDirection: "row", paddingHorizontal: space.lg, paddingVertical: space.sm }}>
                      {["#", "Tipo", "Dist.", "Ritmo", "FC"].map((h, i) => (
                        <Overline key={h} header={false} color="faint" style={{ flex: i === 1 ? 2 : 1, textAlign: i > 1 ? "right" : "left" }}>
                          {h}
                        </Overline>
                      ))}
                    </View>
                    {activity.laps!.map((l) => (
                      <View
                        key={l.index}
                        style={{ flexDirection: "row", paddingHorizontal: space.lg, paddingVertical: space.sm, borderTopWidth: 1, borderTopColor: c.border }}
                      >
                        <Text variant="body" color="faint" tabular style={{ flex: 1 }}>
                          {l.index}
                        </Text>
                        <Text variant="bodyStrong" color={l.kind ? KIND_COLOR[l.kind] : "text"} style={{ flex: 2 }} numberOfLines={1}>
                          {l.kind ? STEP_LABEL[l.kind] : "—"}
                        </Text>
                        <Text variant="body" tabular style={{ flex: 1, textAlign: "right" }}>
                          {l.distanceM >= 1000 ? `${fmtKm(l.distanceM)} km` : `${l.distanceM} m`}
                        </Text>
                        <Text variant="bodyStrong" tabular style={{ flex: 1, textAlign: "right" }}>
                          {(l.distanceM > 0 ? fmtPace(avgPace(l)) : "—")}
                        </Text>
                        <Text variant="body" color="muted" tabular style={{ flex: 1, textAlign: "right" }}>
                          {l.avgHr ?? "—"}
                        </Text>
                      </View>
                    ))}
                  </Card>
                </View>
              ) : tpl ? (
                <Callout icon="information-circle-outline">
                  El reloj no ha enviado las vueltas de esta sesión, así que no se puede comparar con el plan.
                </Callout>
              ) : null}
            </View>
          );

          return isWide ? (
            <View style={{ flexDirection: "row", gap: space.xl, alignItems: "flex-start" }}>
              <View style={{ width: 380, gap: space.lg }}>
                {planInfo}
                {feelings}
              </View>
              <View style={{ flex: 1 }}>{routeLaps}</View>
            </View>
          ) : (
            <View style={{ gap: space.lg }}>
              {planInfo}
              {routeLaps}
              {feelings}
            </View>
          );
        })()}

        {activity.source === "manual" ? (
          <Button
            testID="delete-session"
            label="Eliminar carrera"
            icon="trash-outline"
            variant="danger"
            fullWidth
            onPress={() => {
              const removed = deleteActivity(activity.id);
              router.back();
              if (removed) toast("Carrera eliminada", { actionLabel: "Deshacer", onAction: () => restoreActivity(removed) });
            }}
          />
        ) : null}
        <Button label="Cerrar" variant="secondary" fullWidth onPress={() => router.back()} />
      </View>

      <BottomSheet visible={linking} onClose={() => setLinking(false)} title="Vincular con una plantilla" subtitle="Se guarda una copia de la plantilla tal como está hoy">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {templates.map((t) => (
            <Chip
              key={t.id}
              testID={`link-${t.id}`}
              label={t.name}
              selected={activity.templateId === t.id}
              onPress={() => {
                linkTemplate(activity.id, t.id);
                setLinking(false);
                toast(`Vinculada con «${t.name}»`);
              }}
            />
          ))}
        </View>
        <Button label="Cancelar" variant="ghost" fullWidth onPress={() => setLinking(false)} />
      </BottomSheet>
    </Screen>
  );
}
