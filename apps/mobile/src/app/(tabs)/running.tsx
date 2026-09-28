import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { BarChart } from "@/components/charts/BarChart";
import { LineChart } from "@/components/charts/LineChart";
import { ActivityCard } from "@/components/running/ActivityCard";
import { PlanSheet } from "@/components/running/PlanSheet";
import { formatMinutes, TemplateCard } from "@/components/running/TemplateCard";
import { Badge, Button, Callout, Card, EmptyState, Icon, Overline, ResponsiveGrid, Section, SegmentedControl, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { checkHealthConnectStatus, openAppSettings, openHealthConnectInstall, openHealthConnectSettings, requestHealthConnectPermissions } from "@/data/healthConnect";
import { useRunning } from "@/data/runningStore";
import { connectStrava } from "@/data/stravaAuth";
import { addDays, dayLabel, shortDayLabel, todayKey } from "@/domain/dates";
import { fmtDuration, fmtKm, fmtPace } from "@/domain/format";
import { avgPace, dailyMeters, estimateTemplate, RUNNING_PR_LABEL, runningPRs, weekStart, weeklyTotals } from "@/domain/running";
import { space } from "@/theme/tokens";

type Tab = "sessions" | "templates" | "progress";
const DAYS = ["L", "M", "X", "J", "V", "S", "D"];

function syncLabel(iso: string | null): string {
  if (!iso) return "Sin sincronizar";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Sincronizado ahora";
  if (mins < 60) return `Sincronizado hace ${mins} min`;
  return `Sincronizado a las ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
}

export default function RunningScreen() {
  const [tab, setTab] = useState<Tab>("sessions");
  const [planFor, setPlanFor] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [permissionHelp, setPermissionHelp] = useState(false);
  const [stravaBusy, setStravaBusy] = useState(false);
  const token = useAuth((s) => s.token);
  const templates = useRunning((s) => s.templates);
  const activities = useRunning((s) => s.activities);
  const planned = useRunning((s) => s.planned);
  const lastSync = useRunning((s) => s.lastSync);
  const lastStravaSync = useRunning((s) => s.lastStravaSync);
  const stravaConnected = useRunning((s) => s.stravaConnected);
  const setStravaConnected = useRunning((s) => s.setStravaConnected);
  const source = useRunning((s) => s.source);
  const setSource = useRunning((s) => s.setSource);
  const planTemplate = useRunning((s) => s.planTemplate);
  const unplan = useRunning((s) => s.unplan);
  const markSynced = useRunning((s) => s.markSynced);
  const markStravaSynced = useRunning((s) => s.markStravaSynced);
  const duplicateTemplate = useRunning((s) => s.duplicateTemplate);

  // Refleja el estado real del servidor (p. ej. tras desconectar desde otro dispositivo, o en
  // el primer arranque de este) — `stravaConnected` local es solo una caché de esto.
  useEffect(() => {
    if (!token) return;
    api
      .stravaStatus(token)
      .then(({ connected }) => setStravaConnected(connected))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const connectAndSyncStrava = async () => {
    if (!token) {
      toast("Inicia sesión para conectar Strava");
      return;
    }
    setStravaBusy(true);
    try {
      if (!stravaConnected) {
        const ok = await connectStrava(token);
        if (!ok) {
          toast("No se pudo conectar con Strava");
          return;
        }
        setStravaConnected(true);
      }
      const n = await markStravaSynced(token);
      toast(n > 0 ? `${n} actividad${n === 1 ? "" : "es"} nueva${n === 1 ? "" : "s"} de Strava` : "Strava sincronizado · sin actividades nuevas");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo sincronizar con Strava. Inténtalo de nuevo.");
    } finally {
      setStravaBusy(false);
    }
  };

  const syncGarmin = async () => {
    setSyncing(true);
    setPermissionHelp(false);
    try {
      const status = await checkHealthConnectStatus();
      if (status === "not_installed") {
        toast("Necesito Health Connect instalado en el móvil", {
          actionLabel: "Instalar",
          onAction: openHealthConnectInstall,
        });
        return;
      }
      if (status === "update_required") {
        toast("Health Connect necesita actualizarse", {
          actionLabel: "Actualizar",
          onAction: openHealthConnectInstall,
        });
        return;
      }
      if (!(await requestHealthConnectPermissions())) {
        // Un toast no basta aquí: en algunos móviles/fabricantes el interruptor de salud no
        // está donde se espera, así que se deja un aviso fijo con las dos rutas posibles en
        // vez de un mensaje que desaparece solo a los pocos segundos.
        setPermissionHelp(true);
        return;
      }
      const n = await markSynced();
      toast(n > 0 ? `${n} actividad${n === 1 ? "" : "es"} nueva${n === 1 ? "" : "s"}` : "Garmin sincronizado · sin actividades nuevas");
    } catch (e) {
      // El mensaje real (de `healthConnect.ts` o de la librería nativa) llega hasta aquí en vez
      // de perderse detrás de un "no se pudo sincronizar" genérico.
      toast(e instanceof Error ? e.message : "No se pudo sincronizar con Garmin. Inténtalo de nuevo.");
    } finally {
      setSyncing(false);
    }
  };

  const today = todayKey();
  const sorted = useMemo(() => [...activities].sort((a, b) => b.date.localeCompare(a.date)), [activities]);
  const tplById = useMemo(() => new Map(templates.map((t) => [t.id, t])), [templates]);
  const week = useMemo(() => weeklyTotals(activities, today, 1)[0], [activities, today]);
  const daily = useMemo(() => dailyMeters(activities, today), [activities, today]);
  const todayIdx = (new Date().getDay() + 6) % 7;
  const nextPlanned = useMemo(
    () => planned.filter((p) => p.date >= today).sort((a, b) => a.date.localeCompare(b.date)),
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
          <View>
            <Overline color="brandText">Esta semana</Overline>
            <Text variant="display" tabular>
              {fmtKm(week.meters)}
              <Text variant="body" color="muted"> km</Text>
            </Text>
          </View>
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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" }}>
          <Text variant="caption" color="muted" style={{ flex: 1 }} testID="sync-label">
            {source === "strava" ? (stravaConnected ? syncLabel(lastStravaSync) : "Strava · no conectado") : syncLabel(lastSync)}
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
            {/* La fuente es elección de la persona, no algo que se sustituye al conectar: Strava
                trae ruta GPS; Garmin (Health Connect) no la trae pero no necesita servidor. */}
            <SegmentedControl
              testID="source-picker"
              value={source}
              onChange={setSource}
              style={{ width: 176 }}
              options={[
                { value: "garmin", label: "Garmin" },
                { value: "strava", label: "Strava" },
              ]}
            />
            {source === "garmin" ? (
              <Button
                testID="sync-garmin"
                label={syncing ? "Sincronizando…" : "Sincronizar"}
                icon="sync"
                variant="secondary"
                size="sm"
                disabled={syncing}
                onPress={syncGarmin}
              />
            ) : (
              <Button
                testID="sync-strava"
                label={stravaBusy ? "Sincronizando…" : stravaConnected ? "Sincronizar" : "Conectar"}
                icon={stravaConnected ? "sync" : "link-outline"}
                variant="secondary"
                size="sm"
                disabled={stravaBusy}
                onPress={connectAndSyncStrava}
              />
            )}
          </View>
        </View>

        {source === "strava" && !stravaConnected ? (
          <Callout
            tone="warning"
            icon="alert-circle-outline"
            testID="strava-not-connected"
            action={
              <Button testID="back-to-garmin" label="Usar Garmin" size="sm" variant="secondary" onPress={() => setSource("garmin")} />
            }
          >
            Strava no está conectado (la API exige suscripción de pago). Tu reloj escribe sus sesiones
            en Garmin — vuelve a Garmin para traerlas.
          </Callout>
        ) : null}

        {permissionHelp ? (
          <Callout tone="warning" icon="lock-closed-outline" title="Sin permiso de Health Connect" testID="permission-help">
            <Text variant="body" color="muted">
              No he podido leer tus actividades. Según el móvil, el interruptor de salud está en
              un sitio distinto — prueba estas dos rutas y vuelve a pulsar «Sincronizar»:
            </Text>
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap", marginTop: space.sm }}>
              <Button testID="open-app-settings" label="Ajustes de la app" size="sm" variant="secondary" onPress={openAppSettings} />
              <Button testID="open-hc-settings" label="Salud conectada" size="sm" variant="secondary" onPress={openHealthConnectSettings} />
            </View>
            <Text variant="caption" color="faint" style={{ marginTop: space.sm }}>
              Si en ninguna de las dos aparece CheluisFIT como opción: Ajustes → Aplicaciones →
              Salud conectada → Forzar detención, vuelve a abrir Salud conectada (para que
              actualice su lista de apps) y repite «Sincronizar».
            </Text>
          </Callout>
        ) : null}

        {sorted.length === 0 ? (
          <EmptyState icon="walk-outline" title="Aún no hay sesiones" text="Sincroniza tu Garmin/Strava o registra una carrera a mano." />
        ) : (
          <ResponsiveGrid>
            {sorted.map((a) => (
              <ActivityCard
                key={a.id}
                activity={a}
                template={a.templateId ? tplById.get(a.templateId) : undefined}
                onPress={() => router.push({ pathname: "/sesion/[id]", params: { id: a.id } })}
              />
            ))}
          </ResponsiveGrid>
        )}
      </Section>
    </View>
  );

  const tpls = (
    <View style={{ gap: space.lg }}>
      <Button
        testID="new-template"
        label="Nueva plantilla"
        icon="add"
        onPress={() => router.push({ pathname: "/plantilla/[id]", params: { id: "new" } })}
      />
      {templates.length === 0 ? (
        <EmptyState icon="list-outline" title="Sin plantillas" text="Crea una para series, tiradas largas o sprints." />
      ) : (
        <ResponsiveGrid>
          {templates.map((t) => (
            <TemplateCard
              key={t.id}
              template={t}
              onPlan={() => setPlanFor(t.id)}
              onEdit={() => router.push({ pathname: "/plantilla/[id]", params: { id: t.id } })}
              onDuplicate={() => {
                const copy = duplicateTemplate(t.id);
                if (copy) toast(`Duplicada como «${copy.name}»`);
              }}
            />
          ))}
        </ResponsiveGrid>
      )}
    </View>
  );

  const progress = useMemo(() => {
    const weeks = weeklyTotals(activities, today, 8);
    const labels = weeks.map((w) => `${Number(w.weekStart.slice(8))}/${Number(w.weekStart.slice(5, 7))}`);
    const paces = weeks.map((w) => (w.meters > 0 ? w.seconds / (w.meters / 1000) : null));
    const last4 = weeks.slice(-4);
    const km4 = last4.reduce((x, w) => x + w.meters, 0);
    const prs = runningPRs(activities);
    return { weeks, labels, paces, km4, prs };
  }, [activities, today]);

  const prog = (
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
          return <PrCard key={key} testID={`pr-${key}`} label={RUNNING_PR_LABEL[key]} tone="success" value={fmtDuration(a.durationS)} when={dayLabel(a.date, today)} />;
        })}
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
        {tab === "sessions" ? sessions : tab === "templates" ? tpls : prog}
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
