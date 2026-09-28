import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { DateNavigator } from "@/components/nutrition/DateNavigator";
import { DaySummary, SecondaryLimits } from "@/components/nutrition/DaySummary";
import { MealCard } from "@/components/nutrition/MealCard";
import { WeekView } from "@/components/nutrition/WeekView";
import { Badge, BottomSheetForm, Button, Callout, Card, IconButton, SegmentedControl, Text, haptic } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useRunning } from "@/data/runningStore";
import { useNutrition, useTargets } from "@/data/store";
import { addDays, todayKey } from "@/domain/dates";
import { TDEE_WINDOW_DAYS } from "@/domain/tdee";
import { GOAL_LABEL, mealTargetKcal, sumNutrients, totalsByMeal } from "@/domain/nutrition";
import { type Entry, MEAL_LABEL, MEAL_SLOTS, type MealSlot } from "@/domain/types";
import { useBreakpoint } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

export default function NutricionScreen() {
  const [date, setDate] = useState(todayKey());
  const [view, setView] = useState<"day" | "week">("day");
  const [saving, setSaving] = useState<MealSlot | null>(null);
  const { isWide } = useBreakpoint();
  const targets = useTargets();
  const goal = useNutrition((s) => s.profile.goal);
  const allEntries = useNutrition((s) => s.entries);
  const sumExercise = useNutrition((s) => s.sumExerciseKcal);
  const activities = useRunning((s) => s.activities);
  const removeEntry = useNutrition((s) => s.removeEntry);
  const restoreEntry = useNutrition((s) => s.restoreEntry);
  const copyMeal = useNutrition((s) => s.copyMeal);
  const removeEntries = useNutrition((s) => s.removeEntries);
  const saveMeal = useNutrition((s) => s.saveMeal);
  const tdeePending = useNutrition((s) => (s.tdee.enabled ? s.tdee.pending : null));
  const checkTdee = useNutrition((s) => s.checkTdee);
  const applyTdeeProposal = useNutrition((s) => s.applyTdeeProposal);
  const dismissTdeeProposal = useNutrition((s) => s.dismissTdeeProposal);

  // Al abrir y cada vez que la app vuelve a primer plano:
  // - revisión del TDEE adaptativo (con la media de kcal de ejercicio de las 2 últimas semanas);
  // - si se estaba viendo «hoy» y ya es otro día (la pestaña seguía abierta desde anoche), se pasa
  //   al día nuevo: si no, «Añadir» apuntaba a ayer sin darse cuenta.
  const openedOn = useRef(todayKey());
  useEffect(() => {
    const onActive = () => {
      const now = todayKey();
      if (openedOn.current !== now) {
        setDate((d) => (d === openedOn.current ? now : d));
        openedOn.current = now;
      }
      const from = addDays(now, -(TDEE_WINDOW_DAYS - 1));
      const kcal = useRunning.getState().activities.filter((a) => a.date >= from && a.date <= now).reduce((x, a) => x + (a.kcal ?? 0), 0);
      checkTdee(kcal / TDEE_WINDOW_DAYS);
    };
    onActive();
    const sub = AppState.addEventListener("change", (st) => st === "active" && onActive());
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = useMemo(() => allEntries.filter((e) => e.date === date), [allEntries, date]);
  const yesterday = useMemo(() => allEntries.filter((e) => e.date === addDays(date, -1)), [allEntries, date]);
  const byMeal = useMemo(() => totalsByMeal(entries), [entries]);
  const totals = useMemo(() => sumNutrients(entries.map((e) => e.nutrients)), [entries]);
  const logged = useMemo(() => new Set(allEntries.map((e) => e.date)), [allEntries]);
  const exerciseKcal = useMemo(
    () => (sumExercise ? activities.filter((a) => a.date === date).reduce((x, a) => x + (a.kcal ?? 0), 0) : 0),
    [sumExercise, activities, date],
  );

  const del = (e: Entry) => {
    const removed = removeEntry(e.id);
    haptic.warn();
    if (removed) toast(`${e.name} eliminado`, { actionLabel: "Deshacer", onAction: () => restoreEntry(removed) });
  };

  const summary = (
    <View style={{ gap: space.lg }}>
      <DaySummary totals={totals} targets={targets} exerciseKcal={exerciseKcal} />
      <Card>
        <SecondaryLimits totals={totals} targets={targets} />
      </Card>
    </View>
  );

  const meals = (
    <View style={{ gap: space.lg }}>
      {MEAL_SLOTS.map((slot) => (
        <MealCard
          key={slot}
          slot={slot}
          entries={entries.filter((e) => e.meal === slot)}
          totals={byMeal[slot]}
          targetKcal={mealTargetKcal(targets, slot)}
          onAdd={() => router.push({ pathname: "/anadir", params: { meal: slot, date } })}
          onOpenEntry={(e) =>
            router.push({ pathname: "/alimento/[id]", params: { id: e.foodId, entry: e.id, meal: e.meal, date } })
          }
          onDeleteEntry={del}
          canCopyYesterday={yesterday.some((e) => e.meal === slot)}
          onCopyYesterday={() => {
            const ids = copyMeal(addDays(date, -1), date, slot);
            const n = ids.length;
            toast(`${n} ${n === 1 ? "alimento copiado" : "alimentos copiados"} de ayer`, n ? { actionLabel: "Deshacer", onAction: () => removeEntries(ids) } : undefined);
          }}
          onSaveMeal={() => setSaving(slot)}
        />
      ))}
    </View>
  );

  return (
    <Screen variant="tab" testID="screen-nutricion">
      <ScreenHeader
        title="Nutrición"
        right={
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <IconButton icon="basket-outline" label="Nevera" onPress={() => router.push("/nevera")} filled />
            <IconButton
              icon="options-outline"
              label="Objetivo y ajustes de nutrición"
              onPress={() => router.push("/objetivo")}
              filled
            />
          </View>
        }
      />
      <View style={{ gap: space.lg }}>
        {tdeePending ? (
          <Callout
            tone="brand"
            icon="trending-up-outline"
            testID="tdee-proposal"
            action={
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <Button
                  testID="tdee-apply"
                  label="Aplicar"
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    applyTdeeProposal();
                    toast("Objetivo actualizado");
                  }}
                />
                <Button testID="tdee-dismiss" label="Descartar" size="sm" variant="ghost" onPress={dismissTdeeProposal} />
              </View>
            }
          >
            {tdeePending.reason}
          </Callout>
        ) : null}
        <DateNavigator date={date} onChange={setDate} logged={logged} />
        <SegmentedControl
          value={view}
          onChange={setView}
          options={[
            { value: "day", label: "Día" },
            { value: "week", label: "Semana" },
          ]}
        />
        {/* Con «Ganar masa muscular» la etiqueta y el texto no caben en una línea: bajan a la siguiente. */}
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm, rowGap: space.xs }}>
          <Badge label={`Objetivo: ${GOAL_LABEL[goal]}`} tone="brand" icon="flag-outline" />
          <Text variant="caption" color="faint" style={{ flexShrink: 1 }}>
            Calculado para ti · editable
          </Text>
        </View>
        {view === "week" ? (
          <WeekView date={date} entries={allEntries} targets={targets} />
        ) : isWide ? (
          <View style={{ flexDirection: "row", gap: space.xl, alignItems: "flex-start" }}>
            <View style={{ width: 380 }}>{summary}</View>
            <View style={{ flex: 1 }}>{meals}</View>
          </View>
        ) : (
          <>
            {summary}
            {meals}
          </>
        )}
      </View>

      <BottomSheetForm
        visible={saving !== null}
        title="Guardar como mi comida"
        subtitle={saving ? `${MEAL_LABEL[saving]} · se podrá añadir de golpe a cualquier comida` : undefined}
        label="Nombre"
        placeholder="Mi desayuno de siempre"
        initialValue={saving ? `Mi ${MEAL_LABEL[saving].toLowerCase()}` : ""}
        confirmLabel="Guardar"
        onClose={() => setSaving(null)}
        onSubmit={(name) => {
          if (!saving) return;
          const saved = saveMeal(name, date, saving);
          setSaving(null);
          if (saved) toast(`«${saved.name}» guardada en Mis comidas`);
        }}
      />
    </Screen>
  );
}
