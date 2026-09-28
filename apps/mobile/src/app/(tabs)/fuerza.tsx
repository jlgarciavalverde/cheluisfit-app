import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { ExerciseRow } from "@/components/strength/ExerciseRow";
import { MuscleVolumeCard, RoutineCard, WorkoutCard } from "@/components/strength/cards";
import { BottomSheet, Button, Card, ConfirmSheet, Chip, ChipRow, EmptyState, CollapsibleSection, IconButton, Overline, ResponsiveGrid, SearchField, Section, SegmentedControl, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useActiveWorkout } from "@/data/activeWorkoutStore";
import { filterExercises } from "@/data/exerciseSearch";
import { useLibrary, useStrength } from "@/data/strengthStore";
import { todayKey, weekDates } from "@/domain/dates";
import { fmtDuration } from "@/domain/format";
import {
  EQUIPMENT_LABEL,
  type Equipment,
  GROUP_LABEL,
  GROUP_ORDER,
  type MuscleGroup,
  nextSuggestedRoutine,
  type Routine,
  routineFromWorkout,
  weeklySetsByMuscle,
} from "@/domain/strength";
import { space } from "@/theme/tokens";

type Tab = "train" | "routines" | "exercises" | "history";
const EQUIPMENT_FILTERS: Equipment[] = ["barbell", "dumbbell", "machine", "cable", "bodyweight"];

export default function FuerzaScreen() {
  const [tab, setTab] = useState<Tab>("train");
  const [pending, setPending] = useState<Routine | "empty" | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | "all">("all");
  const [equipment, setEquipment] = useState<Equipment | "all">("all");

  const routines = useStrength((s) => s.routines);
  const workouts = useStrength((s) => s.workouts);
  const duplicateRoutine = useStrength((s) => s.duplicateRoutine);
  const library = useLibrary();
  const active = useActiveWorkout((s) => s.workout);
  const start = useActiveWorkout((s) => s.start);
  const discard = useActiveWorkout((s) => s.discard);

  const byId = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const sorted = useMemo(() => [...workouts].sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [workouts]);
  const lastByRoutine = useMemo(() => {
    const m = new Map<string, string>();
    for (const w of sorted) if (w.routineId && !m.has(w.routineId)) m.set(w.routineId, w.date);
    return m;
  }, [sorted]);
  const suggested = useMemo(() => nextSuggestedRoutine(routines, workouts), [routines, workouts]);
  const weekSets = useMemo(() => weeklySetsByMuscle(workouts, weekDates(todayKey())), [workouts]);
  const exercises = useMemo(() => filterExercises(library, { query, group, equipment }), [library, query, group, equipment]);

  const begin = (r: Routine | null) => {
    start(r, library);
    const id = useActiveWorkout.getState().workout?.id;
    if (id) router.push({ pathname: "/entreno/[id]", params: { id } });
  };
  const request = (r: Routine | "empty") => {
    if (active) setPending(r);
    else begin(r === "empty" ? null : r);
  };

  const folders = useMemo(() => {
    const m = new Map<string, Routine[]>();
    for (const r of routines) m.set(r.folder ?? "Sin carpeta", [...(m.get(r.folder ?? "Sin carpeta") ?? []), r]);
    return [...m.entries()];
  }, [routines]);

  const activeCard = active ? (
    <Card testID="active-card" accent="brand" style={{ gap: space.md }}>
      <View style={{ gap: 2 }}>
        <Overline color="brandText">Entrenamiento en curso</Overline>
        <Text variant="heading">{active.name}</Text>
        <Text variant="caption" color="muted" tabular>
          {active.exercises.length} ejercicios ·{" "}
          {active.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)} series hechas ·{" "}
          {fmtDuration((Date.now() - new Date(active.startedAt).getTime()) / 1000)}
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
        <Button
          testID="continue-workout"
          label="Continuar"
          icon="play"
          onPress={() => router.push({ pathname: "/entreno/[id]", params: { id: active.id } })}
        />
        <Button testID="discard-workout" label="Descartar" variant="danger" icon="trash-outline" onPress={() => setConfirmDiscard(true)} />
      </View>
    </Card>
  ) : null;

  const train = (
    <View style={{ gap: space.lg }}>
      {activeCard}
      {suggested ? (
        <Section kind="overline" title="Para hoy" gap={space.sm}>
          <RoutineCard
            routine={suggested}
            byId={byId}
            lastDate={lastByRoutine.get(suggested.id)}
            suggested
            onStart={() => request(suggested)}
            onEdit={() => router.push({ pathname: "/rutina/[id]", params: { id: suggested.id } })}
          />
        </Section>
      ) : null}
      <Section kind="overline" title="Empezar" gap={space.sm}>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Button testID="start-empty" label="Entrenamiento vacío" icon="add" variant="secondary" onPress={() => request("empty")} />
          {sorted[0] ? (
            <Button
              testID="repeat-last"
              label="Repetir el último"
              icon="repeat"
              variant="secondary"
              onPress={() => request(routineFromWorkout(sorted[0]))}
            />
          ) : null}
        </View>
      </Section>
      {folders.map(([folder, list]) => {
        const visible = list.filter((r) => r.id !== suggested?.id);
        if (visible.length === 0) return null;
        return (
          <CollapsibleSection
            key={folder}
            testID={`folder-${folder}`}
            title={folder}
            subtitle={`${visible.length} ${visible.length === 1 ? "rutina" : "rutinas"}`}
            defaultOpen
          >
            {visible.map((r) => (
              <RoutineCard
                key={r.id}
                routine={r}
                byId={byId}
                lastDate={lastByRoutine.get(r.id)}
                onStart={() => request(r)}
                onEdit={() => router.push({ pathname: "/rutina/[id]", params: { id: r.id } })}
              />
            ))}
          </CollapsibleSection>
        );
      })}
    </View>
  );

  const routinesTab = (
    <View style={{ gap: space.lg }}>
      <Button testID="new-routine" label="Nueva rutina" icon="add" onPress={() => router.push({ pathname: "/rutina/[id]", params: { id: "new" } })} />
      {routines.length === 0 ? (
        <EmptyState icon="list-outline" title="Sin rutinas" text="Crea una para Espalda, Pecho, Pierna…" />
      ) : (
        <ResponsiveGrid>
          {routines.map((r) => (
            <RoutineCard
              key={r.id}
              routine={r}
              byId={byId}
              lastDate={lastByRoutine.get(r.id)}
              onStart={() => request(r)}
              onEdit={() => router.push({ pathname: "/rutina/[id]", params: { id: r.id } })}
              onDuplicate={() => {
                const c = duplicateRoutine(r.id);
                if (c) toast(`Duplicada como «${c.name}»`);
              }}
            />
          ))}
        </ResponsiveGrid>
      )}
    </View>
  );

  const exercisesTab = (
    <View style={{ gap: space.md, flex: 1 }}>
      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
        <SearchField testID="ex-search" value={query} onChangeText={setQuery} placeholder="Buscar ejercicio o músculo" />
        <IconButton testID="new-exercise" icon="add" label="Crear ejercicio" filled="brand" color="onBrand" onPress={() => router.push("/crear-ejercicio")} />
      </View>
      <ChipRow>
        <Chip label="Todos" selected={group === "all"} onPress={() => setGroup("all")} />
        {GROUP_ORDER.filter((g) => g !== "other").map((g) => (
          <Chip key={g} testID={`group-${g}`} label={GROUP_LABEL[g]} selected={group === g} onPress={() => setGroup(g)} />
        ))}
      </ChipRow>
      <ChipRow>
        <Chip label="Cualquier equipo" icon="options-outline" selected={equipment === "all"} onPress={() => setEquipment("all")} />
        {EQUIPMENT_FILTERS.map((q) => (
          <Chip key={q} label={EQUIPMENT_LABEL[q]} selected={equipment === q} onPress={() => setEquipment(q)} />
        ))}
      </ChipRow>
      <Text variant="caption" color="muted" accessibilityLiveRegion="polite">
        {exercises.length} ejercicios
      </Text>
      <FlatList
        style={{ flex: 1 }}
        data={exercises}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: space.xxl }}
        ListEmptyComponent={
          <EmptyState icon="search-outline" title="Sin resultados" text="Prueba con otra palabra o crea el ejercicio." actionLabel="Crear ejercicio" onAction={() => router.push("/crear-ejercicio")} />
        }
        renderItem={({ item, index }) => (
          <ExerciseRow exercise={item} divider={index > 0} onPress={() => router.push({ pathname: "/ejercicio/[id]", params: { id: item.id } })} />
        )}
      />
    </View>
  );

  const historyTab = (
    <View style={{ gap: space.lg }}>
      <MuscleVolumeCard sets={weekSets} />
      {sorted.length === 0 ? (
        <EmptyState icon="barbell-outline" title="Aún no hay entrenamientos" text="Empieza uno y aparecerá aquí." />
      ) : (
        <ResponsiveGrid>
          {sorted.map((w) => (
            <WorkoutCard key={w.id} workout={w} onPress={() => router.push({ pathname: "/entreno/detalle/[id]", params: { id: w.id } })} />
          ))}
        </ResponsiveGrid>
      )}
    </View>
  );

  return (
    <Screen variant="tab" testID="screen-fuerza" scroll={tab !== "exercises"}>
      <ScreenHeader title="Fuerza" />
      <View style={{ gap: space.lg, flex: tab === "exercises" ? 1 : undefined }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: "train", label: "Entrenar" },
            { value: "routines", label: "Rutinas" },
            { value: "exercises", label: "Ejercicios" },
            { value: "history", label: "Historial" },
          ]}
        />
        {tab === "train" ? train : tab === "routines" ? routinesTab : tab === "exercises" ? exercisesTab : historyTab}
      </View>

      <BottomSheet
        visible={pending !== null}
        onClose={() => setPending(null)}
        title="Ya tienes un entrenamiento en curso"
        subtitle="Solo puede haber uno abierto a la vez"
      >
        <View style={{ gap: space.sm }}>
          <Button
            label="Continuar el que tengo"
            icon="play"
            fullWidth
            onPress={() => {
              setPending(null);
              if (active) router.push({ pathname: "/entreno/[id]", params: { id: active.id } });
            }}
          />
          <Button
            testID="discard-and-start"
            label="Descartarlo y empezar el nuevo"
            variant="danger"
            fullWidth
            onPress={() => {
              const p = pending;
              setPending(null);
              discard();
              begin(p === "empty" || p === null ? null : p);
            }}
          />
          <Button label="Cancelar" variant="ghost" fullWidth onPress={() => setPending(null)} />
        </View>
      </BottomSheet>

      <ConfirmSheet
        testID="confirm-discard"
        visible={confirmDiscard}
        title="¿Descartar el entrenamiento?"
        message="Se pierden todas las series de este entrenamiento en curso. No se puede deshacer."
        confirmLabel="Descartar entrenamiento"
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          discard();
          toast("Entrenamiento descartado");
        }}
      />
    </Screen>
  );
}
