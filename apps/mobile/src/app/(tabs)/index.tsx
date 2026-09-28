import { router } from "expo-router";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { Screen } from "@/components/Screen";
import { UpdateCallout } from "@/components/UpdateCallout";
import { KcalRing, MacroBars } from "@/components/nutrition/DaySummary";
import { SOURCE_ICON } from "@/components/running/ActivityCard";
import { formatMinutes } from "@/components/running/TemplateCard";
import { Callout, Badge, Button, Card, Icon, Overline, Text } from "@/components/ui";
import { useActiveWorkout } from "@/data/activeWorkoutStore";
import { useRunning } from "@/data/runningStore";
import { useLibrary, useStrength } from "@/data/strengthStore";
import { nextSuggestedRoutine } from "@/domain/strength";
import { useNutrition, useTargets } from "@/data/store";
import { addDays, dayLabel, fromDateKey, todayKey } from "@/domain/dates";
import { fmtDuration, fmtInt, fmtKm, fmtPace } from "@/domain/format";
import { sumNutrients } from "@/domain/nutrition";
import { avgPace, estimateTemplate, SOURCE_LABEL } from "@/domain/running";
import { activeDayStreak } from "@/domain/streak";
import { useBreakpoint } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

const long = new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" });

function greeting(): string {
  const h = new Date().getHours();
  return h < 13 ? "Buenos días" : h < 21 ? "Buenas tardes" : "Buenas noches";
}

export default function HoyScreen() {
  const { isWide } = useBreakpoint();
  const name = useNutrition((s) => s.profile.name);
  const targets = useTargets();
  const entries = useNutrition((s) => s.entries);
  const templates = useRunning((s) => s.templates);
  const planned = useRunning((s) => s.planned);
  const activities = useRunning((s) => s.activities);
  const today = todayKey();
  const routines = useStrength((s) => s.routines);
  const gymWorkouts = useStrength((s) => s.workouts);
  const library = useLibrary();
  const activeWorkout = useActiveWorkout((s) => s.workout);
  const startWorkout = useActiveWorkout((s) => s.start);
  const suggestedRoutine = useMemo(() => nextSuggestedRoutine(routines, gymWorkouts), [routines, gymWorkouts]);

  const totals = useMemo(() => sumNutrients(entries.filter((e) => e.date === today).map((e) => e.nutrients)), [entries, today]);
  const upcoming = useMemo(
    () => planned.filter((p) => p.date >= today && p.date <= addDays(today, 2)).sort((a, b) => a.date.localeCompare(b.date))[0],
    [planned, today],
  );
  const upcomingTpl = upcoming ? templates.find((t) => t.id === upcoming.templateId) : undefined;
  const last = useMemo(() => [...activities].sort((a, b) => b.date.localeCompare(a.date))[0], [activities]);
  const streak = useMemo(() => {
    const dates = [...entries.map((e) => e.date), ...activities.map((a) => a.date), ...gymWorkouts.map((w) => w.date)];
    return activeDayStreak(dates, today);
  }, [entries, activities, gymWorkouts, today]);

  const nutrition = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ver nutrición de hoy"
      onPress={() => router.navigate("/nutricion")}
      style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
    >
      <Card style={{ gap: space.lg }} testID="hoy-nutricion">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text variant="heading">Nutrición</Text>
          <Icon name="chevron-forward" size="md" color="faint" />
        </View>
        <View style={{ alignItems: "center" }}>
          <KcalRing eaten={totals.kcal} target={targets.kcal} size={170} />
          <Text variant="caption" color="muted" style={{ marginTop: space.sm }} tabular>
            {fmtInt(totals.kcal)} de {fmtInt(targets.kcal)} kcal
          </Text>
        </View>
        <MacroBars totals={totals} targets={targets} />
      </Card>
    </Pressable>
  );

  const training = (
    <View style={{ gap: space.lg }}>
      <Card style={{ gap: space.md }} testID="hoy-plan">
        <Overline color="brandText">Próximo entrenamiento</Overline>
        {upcoming && upcomingTpl ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Text variant="heading" numberOfLines={2}>
                  {upcomingTpl.name}
                </Text>
                <Text variant="caption" color="muted" tabular>
                  {dayLabel(upcoming.date, today)} ·{" "}
                  {(() => {
                    const e = estimateTemplate(upcomingTpl);
                    return e.meters > 0 ? `≈ ${fmtKm(e.meters)} km · ${formatMinutes(e.seconds)}` : "sin distancia definida";
                  })()}
                </Text>
              </View>
              <Badge label="Running" icon="walk" tone="brand" />
            </View>
            <Button label="Ver plantillas" variant="secondary" size="sm" onPress={() => router.navigate("/running")} />
          </>
        ) : (
          <>
            <Text variant="body" color="muted">
              Nada planificado para los próximos días.
            </Text>
            <Button label="Planificar un entrenamiento" icon="calendar-outline" variant="secondary" size="sm" onPress={() => router.navigate("/running")} />
          </>
        )}
      </Card>

      {last ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Última actividad: ${last.title}`}
          onPress={() => router.push({ pathname: "/sesion/[id]", params: { id: last.id } })}
          style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}
        >
          <Card style={{ gap: space.md }} testID="hoy-ultima">
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Overline color="muted">Última actividad</Overline>
              <Badge label={SOURCE_LABEL[last.source]} icon={SOURCE_ICON[last.source]} />
            </View>
            <Text variant="heading">{last.title}</Text>
            <Text variant="caption" color="muted">
              {dayLabel(last.date, today)}
            </Text>
            <View style={{ flexDirection: "row", gap: space.xl }}>
              <View>
                <Text variant="heading" tabular>
                  {fmtKm(last.distanceM)} <Text variant="caption" color="muted">km</Text>
                </Text>
              </View>
              <View>
                <Text variant="heading" tabular>
                  {fmtDuration(last.durationS)}
                </Text>
              </View>
              <View>
                <Text variant="heading" tabular>
                  {fmtPace(avgPace(last))} <Text variant="caption" color="muted">/km</Text>
                </Text>
              </View>
            </View>
          </Card>
        </Pressable>
      ) : null}

      <Card style={{ gap: space.md }} testID="hoy-fuerza">
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Overline color="brandText">Fuerza</Overline>
          <Badge label="Gimnasio" icon="barbell" tone="brand" />
        </View>
        {activeWorkout ? (
          <>
            <Text variant="heading">{activeWorkout.name} en curso</Text>
            <Button
              testID="hoy-continue"
              label="Continuar entrenamiento"
              icon="play"
              onPress={() => router.push({ pathname: "/entreno/[id]", params: { id: activeWorkout.id } })}
            />
          </>
        ) : suggestedRoutine ? (
          <>
            <Text variant="heading">Hoy toca: {suggestedRoutine.name}</Text>
            <Text variant="caption" color="muted">
              {suggestedRoutine.exercises.length} ejercicios · la que hace más tiempo que no haces
            </Text>
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              <Button
                testID="hoy-start"
                label="Empezar"
                icon="play"
                size="sm"
                onPress={() => {
                  startWorkout(suggestedRoutine, library);
                  const id = useActiveWorkout.getState().workout?.id;
                  if (id) router.push({ pathname: "/entreno/[id]", params: { id } });
                }}
              />
              <Button label="Ver rutinas" variant="secondary" size="sm" onPress={() => router.navigate("/fuerza")} />
            </View>
          </>
        ) : (
          <Button label="Crear una rutina" icon="add" variant="secondary" size="sm" onPress={() => router.navigate("/fuerza")} />
        )}
      </Card>
      <Callout icon="football-outline" title="Fútbol" dense>
        Llegará en una próxima fase del diseño.
      </Callout>
    </View>
  );

  return (
    <Screen variant="tab" testID="screen-hoy">
      <View style={{ paddingTop: space.lg, paddingBottom: space.lg, gap: 2 }}>
        <Text variant="caption" color="brandText">
          {(() => {
            const t = long.format(fromDateKey(today));
            return t.charAt(0).toUpperCase() + t.slice(1);
          })()}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" }}>
          <Text variant="title" accessibilityRole="header">
            {greeting()}, {name.split(" ")[0]}
          </Text>
          {streak >= 1 ? (
            <View testID="streak-badge">
              <Badge label={`${streak} ${streak === 1 ? "día" : "días"} seguidos`} tone="brand" icon="flame" />
            </View>
          ) : null}
        </View>
      </View>
      <UpdateCallout />
      {isWide ? (
        <View style={{ flexDirection: "row", gap: space.xl, alignItems: "flex-start" }}>
          <View style={{ flex: 1 }}>{nutrition}</View>
          <View style={{ flex: 1 }}>{training}</View>
        </View>
      ) : (
        <View style={{ gap: space.lg }}>
          {nutrition}
          {training}
        </View>
      )}
    </Screen>
  );
}
