import { useKeepAwake } from "expo-keep-awake";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { takeCreatedExercise } from "@/lib/createdExercise";
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ExerciseCircles } from "@/components/strength/ExerciseCircles";
import { FinishWorkoutSheet } from "@/components/strength/FinishWorkoutSheet";
import { LinkSupersetSheet } from "@/components/strength/LinkSupersetSheet";
import { PlatesSheet } from "@/components/strength/PlatesSheet";
import { ExercisePicker } from "@/components/strength/ExercisePicker";
import { ExerciseThumb, MediaStage } from "@/components/strength/MediaStage";
import { RestBar } from "@/components/strength/RestBar";
import { SetsTable } from "@/components/strength/SetsTable";
import { WorkoutExerciseMenu } from "@/components/strength/WorkoutExerciseMenu";
import { FullScreenModal } from "@/components/FullScreenModal";
import { Callout, BottomSheetForm, Button, ConfirmSheet, Card, EmptyState, Icon, IconButton, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useActiveWorkout } from "@/data/activeWorkoutStore";
import { useLibrary, useStrength } from "@/data/strengthStore";
import { fmtDuration, fmtKg } from "@/domain/format";
import {
  EQUIPMENT_LABEL,
  ghostsFor,
  historyFor,
  MUSCLE_LABEL,
  planCounts,
  planSummary,
  previousFor,
  restText,
  suggestNext,
  suggestSubstitutes,
  supersetLabel,
  warmupSets,
} from "@/domain/strength";
import { useNow } from "@/lib/useNow";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const a = Keyboard.addListener("keyboardDidShow", () => setOpen(true));
    const b = Keyboard.addListener("keyboardDidHide", () => setOpen(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return open;
}

function suggestionTitle(s: import("@/domain/strength").Suggestion, kind: string): string {
  const first = s.perSet[0];
  const weighted = kind === "weight_reps" || (first?.kg ?? 0) > 0;
  const goal = kind === "duration" ? `${first?.reps ?? 0} s` : `${first?.reps ?? 0} reps`;
  switch (s.action) {
    case "increase":
      return weighted ? `Sube a ${fmtKg(first?.kg ?? 0)} kg` : `Sube a ${goal}`;
    case "deload":
      return `Baja a ${fmtKg(first?.kg ?? 0)} kg`;
    case "hold":
      return weighted ? `Mantén ${fmtKg(first?.kg ?? 0)} kg` : `Objetivo: ${goal}`;
    default:
      return "Primera vez";
  }
}

const ICON = { start: "sparkles", increase: "arrow-up-circle", hold: "remove-circle", deload: "arrow-down-circle", none: "time-outline" } as const;

function Runner() {
  useKeepAwake();
  const { c } = useTheme();
  const { isWide } = useBreakpoint();
  const kbOpen = useKeyboardOpen();

  const workout = useActiveWorkout((s) => s.workout)!;
  const current = useActiveWorkout((s) => s.current);
  const setCurrent = useActiveWorkout((s) => s.setCurrent);
  const finish = useActiveWorkout((s) => s.finish);
  const clearActive = useActiveWorkout((s) => s.clearActive);
  const discard = useActiveWorkout((s) => s.discard);
  const replace = useActiveWorkout((s) => s.replace);
  const add = useActiveWorkout((s) => s.add);
  const removeAt = useActiveWorkout((s) => s.removeAt);
  const move = useActiveWorkout((s) => s.move);
  const link = useActiveWorkout((s) => s.link);
  const unlink = useActiveWorkout((s) => s.unlink);
  const setNote = useActiveWorkout((s) => s.setNote);
  const setName = useActiveWorkout((s) => s.setWorkoutName);
  const addWarmups = useActiveWorkout((s) => s.addWarmups);
  const addWorkout = useStrength((s) => s.addWorkout);
  const workouts = useStrength((s) => s.workouts);
  const barKg = useStrength((s) => s.barKg);
  const plates = useStrength((s) => s.plates);
  const library = useLibrary();

  const [menu, setMenu] = useState(false);
  const [picker, setPicker] = useState<"add" | "replace" | null>(null);
  const [linkSheet, setLinkSheet] = useState(false);
  const [finishSheet, setFinishSheet] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [rename, setRename] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [platesOpen, setPlatesOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const tableY = useRef(0);
  // Qué estaba haciendo el selector al pulsar «Crear ejercicio» (añadir o sustituir), para
  // aplicar el ejercicio recién creado igual al volver (ver `lib/createdExercise.ts`).
  const createMode = useRef<"add" | "replace">("add");

  const idx = Math.min(current, Math.max(0, workout.exercises.length - 1));
  const ex = workout.exercises[idx];
  const libById = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const libEx = ex ? libById.get(ex.exerciseId) : undefined;
  const media = libEx ?? (ex ? { name: ex.name, frames: undefined, video: undefined } : undefined);

  const history = useMemo(() => (ex ? historyFor(workouts, ex.exerciseId) : []), [workouts, ex?.exerciseId]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = ex ? planCounts(ex.plan.sets) : null;
  const suggestion = useMemo(
    () =>
      ex && counts
        ? suggestNext(history, {
            rule: ex.plan.rule,
            repMin: counts.repMin,
            repMax: counts.repMax,
            increment: ex.plan.increment,
            plannedSets: counts.working,
            kind: ex.kind,
          })
        : null,
    [history, ex?.plan, ex?.kind], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const previous = useMemo(() => (ex ? previousFor(ex.sets, history[0]?.sets) : []), [ex?.sets, history]); // eslint-disable-line react-hooks/exhaustive-deps
  const ghosts = useMemo(
    () => (ex && suggestion ? ghostsFor(ex.sets, suggestion, previous, { barKg, usesBar: ex.equipment === "barbell" }) : []),
    [ex?.sets, suggestion, previous, barKg, ex?.equipment], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Peso de trabajo: el que la persona ya ha escrito en la primera serie de trabajo; si no, el
  // sugerido. Antes se usaba siempre el sugerido (y podía coger el de una fila de calentamiento).
  const workKg = (() => {
    if (!ex) return 0;
    const i = ex.sets.findIndex((x) => x.type !== "warmup");
    if (i < 0) return 0;
    return ex.sets[i]!.kg ?? ghosts[i]?.kg ?? 0;
  })();

  // Al marcar una serie la tabla se desplaza para dejar visible la siguiente.
  const doneHere = ex ? ex.sets.filter((s) => s.done).length : 0;
  useEffect(() => {
    if (!ex || doneHere === 0) return;
    const next = ex.sets.findIndex((s) => !s.done);
    if (next < 0) return;
    scrollRef.current?.scrollTo({ y: Math.max(0, tableY.current + next * 58 - 150), animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneHere, idx]);

  useFocusEffect(
    useCallback(() => {
      const id = takeCreatedExercise();
      const created = id ? useStrength.getState().custom.find((e) => e.id === id) : undefined;
      if (!created) return;
      if (createMode.current === "replace") replace(idx, created);
      else add(created, workout.exercises.length ? idx : undefined);
      toast(`${created.name} añadido`);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idx, workout.exercises.length]),
  );

  // El reloj que avanza cada segundo vive en `<Elapsed>`: antes era un estado de esta pantalla y la
  // repintaba entera cada segundo (tabla de series, fotos, círculos…).
  const elapsedAtRender = (Date.now() - new Date(workout.startedAt).getTime()) / 1000;
  const doneSets = workout.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const pendingSets = workout.exercises.reduce((n, e) => n + e.sets.filter((s) => !s.done).length, 0);
  const allDone = !!ex && ex.sets.length > 0 && ex.sets.every((s) => s.done);
  const nextIdx = workout.exercises.findIndex((e, i) => i > idx && e.sets.some((s) => !s.done));

  // Solo cambia si cambia el ejercicio o la lista de ejercicios (no al escribir en una serie).
  const exerciseIds = workout.exercises.map((e) => e.exerciseId).join("|");
  const substitutes = useMemo(
    () => (libEx ? suggestSubstitutes(libEx, library, exerciseIds.split("|")) : []),
    [libEx, library, exerciseIds],
  );

  const finishAndSave = () => {
    const report = finish();
    setFinishSheet(false);
    if (!report) return;
    if (report.workout.exercises.length === 0) {
      clearActive();
      toast("No había series marcadas: nada que guardar");
      router.dismissTo("/fuerza");
      return;
    }
    // Guardar en el historial ANTES de vaciar el entreno activo (dos `persist` de AsyncStorage
    // independientes, sin transacción compartida — ver el comentario de `finish()` en
    // `activeWorkoutStore.ts`): si la app muriera entre medias, peor caso es que el entreno
    // reaparezca como "en curso" además de estar ya guardado, nunca que desaparezca del todo.
    addWorkout(report.workout);
    clearActive();
    router.replace({ pathname: "/entreno/resumen/[id]", params: { id: report.workout.id } });
  };

  const applySuggestion = () => {
    if (!ex || !suggestion) return;
    let k = 0;
    const { patchSet } = useActiveWorkout.getState();
    for (const s of ex.sets) {
      if (s.done || s.type === "warmup" || s.type === "drop") continue;
      const p = suggestion.perSet[Math.min(k++, suggestion.perSet.length - 1)];
      patchSet(idx, s.id, { kg: p.kg, reps: p.reps });
    }
  };

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: c.bg, alignItems: "center" }} testID="screen-entreno">
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, width: "100%", maxWidth: isWide ? 900 : 760 }}>
        {/* Cabecera */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.sm, minHeight: 60 }}>
          <IconButton testID="minimize" icon="chevron-down" label="Minimizar: el entrenamiento sigue abierto" onPress={() => (router.canGoBack() ? router.back() : router.dismissTo("/fuerza"))} />
          <Pressable accessibilityRole="button" accessibilityLabel={`${workout.name}. Cambiar nombre`} onPress={() => setRename(true)} style={{ flex: 1, minHeight: 48, justifyContent: "center" }}>
            <Text variant="heading" numberOfLines={1} testID="workout-name">
              {workout.name}
            </Text>
            <Elapsed startedAt={workout.startedAt} doneSets={doneSets} />
          </Pressable>
          <Button testID="finish" label="Terminar" size="sm" onPress={() => setFinishSheet(true)} />
        </View>

        <ExerciseCircles exercises={workout.exercises} current={idx} onSelect={setCurrent} onAdd={() => setPicker("add")} />

        {!ex ? (
          <View style={{ flex: 1 }}>
            <EmptyState icon="barbell-outline" title="Entrenamiento vacío" text="Añade el primer ejercicio con el botón +." actionLabel="Añadir ejercicio" onAction={() => setPicker("add")} />
          </View>
        ) : (
          <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xl, gap: space.md }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Foto / GIF / vídeo (se encoge al escribir) */}
            {kbOpen ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                {media ? <ExerciseThumb exercise={media} size={44} /> : null}
                <Text variant="bodyStrong" numberOfLines={2} style={{ flex: 1 }}>
                  {ex.name}
                </Text>
              </View>
            ) : (
              <>
                {media ? <MediaStage exercise={media} height={isWide ? 220 : 170} onPress={() => setZoom(true)} /> : null}
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="title" numberOfLines={2} testID="exercise-name">
                      {ex.name}
                    </Text>
                    <Text variant="caption" color="muted">
                      {ex.primary.map((m) => MUSCLE_LABEL[m]).join(", ")} · {EQUIPMENT_LABEL[ex.equipment]} · {planSummary(ex.plan.sets, ex.kind)} · {restText(ex.plan.restS)}
                    </Text>
                  </View>
                  <IconButton testID="exercise-menu" icon="ellipsis-horizontal" label="Más opciones del ejercicio" filled onPress={() => setMenu(true)} />
                </View>
              </>
            )}

            {ex.supersetId ? (
              <Callout icon="link" dense testID="superset-note">
                Superserie {supersetLabel(workout.exercises, idx)}: al marcar una serie pasas al siguiente ejercicio y el descanso llega al acabar la ronda.
              </Callout>
            ) : null}

            {suggestion && suggestion.action !== "none" ? (
              <Card
                tone="alt"
                testID="suggestion"
                accent={suggestion.action === "increase" ? "success" : suggestion.action === "deload" ? "warning" : undefined}
                style={{ gap: space.xs }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <Icon name={ICON[suggestion.action]} size="md" color={suggestion.action === "increase" ? "success" : suggestion.action === "deload" ? "warning" : "brandText"} />
                  <Text variant="bodyStrong" style={{ flex: 1 }}>
                    {suggestionTitle(suggestion, ex.kind)}
                  </Text>
                  {suggestion.action !== "start" && ex.sets.some((s) => !s.done) ? (
                    <Button testID="apply-suggestion" label="Aplicar" size="sm" variant="secondary" onPress={applySuggestion} />
                  ) : null}
                </View>
                <Text variant="caption" color="muted">
                  {suggestion.reason}
                </Text>
              </Card>
            ) : null}

            <View onLayout={(e) => { tableY.current = e.nativeEvent.layout.y; }}>
              <SetsTable exIdx={idx} exercise={ex} previous={previous} ghosts={ghosts} kind={ex.kind} />
            </View>

            {noteOpen || ex.note ? (
              <TextField testID="exercise-note" label="Nota del ejercicio" value={ex.note ?? ""} onChangeText={(t) => setNote(idx, t)} placeholder="Agarre, sensaciones…" maxLength={200} />
            ) : null}

            {allDone && nextIdx >= 0 ? (
              <Button testID="next-exercise" label="Siguiente ejercicio" icon="arrow-forward" size="lg" fullWidth onPress={() => setCurrent(nextIdx)} />
            ) : null}
            {allDone && nextIdx < 0 ? (
              <Button testID="finish-inline" label="Terminar entrenamiento" icon="checkmark-done" size="lg" fullWidth onPress={() => setFinishSheet(true)} />
            ) : null}
          </ScrollView>
        )}

        <RestBar defaultRestS={ex?.plan.restS ?? 90} />
      </KeyboardAvoidingView>

      {/* Menú del ejercicio */}
      <WorkoutExerciseMenu
        visible={menu}
        onClose={() => setMenu(false)}
        exerciseName={ex?.name ?? "Ejercicio"}
        hasNote={!!ex?.note}
        canWarmup={!!ex && ex.kind !== "duration" && !ex.sets.some((s) => s.type === "warmup") && workKg > 0}
        canPlates={ex?.equipment === "barbell"}
        hasSuperset={!!ex?.supersetId}
        canLink={!ex?.supersetId && workout.exercises.length > 1}
        onReplace={() => { setMenu(false); setPicker("replace"); }}
        onWarmup={() => {
          if (!ex) return;
          addWarmups(idx, warmupSets(workKg, ex.equipment === "barbell" ? barKg : 0, ex.plan.increment > 0 ? ex.plan.increment : 2.5));
          setMenu(false);
        }}
        onPlates={() => { setMenu(false); setPlatesOpen(true); }}
        onUnlink={() => { unlink(idx); setMenu(false); }}
        onLink={() => { setMenu(false); setLinkSheet(true); }}
        onNote={() => { setNoteOpen(true); setMenu(false); }}
        onMoveBack={() => { move(idx, -1); setMenu(false); }}
        onMoveForward={() => { move(idx, 1); setMenu(false); }}
        onHistory={() => {
          setMenu(false);
          if (ex) router.push({ pathname: "/ejercicio/[id]", params: { id: ex.exerciseId } });
        }}
        onRemove={() => {
          removeAt(idx);
          setMenu(false);
          toast("Ejercicio quitado");
        }}
      />

      <PlatesSheet key={`${idx}-${platesOpen}`} visible={platesOpen} onClose={() => setPlatesOpen(false)} initialKg={workKg || null} barKg={barKg} plates={plates} />

      <LinkSupersetSheet
        visible={linkSheet}
        onClose={() => setLinkSheet(false)}
        exercises={workout.exercises}
        excludeIndex={idx}
        onLink={(i) => {
          link(idx, i);
          setLinkSheet(false);
          toast("Superserie creada");
        }}
      />

      <FinishWorkoutSheet
        visible={finishSheet}
        onClose={() => setFinishSheet(false)}
        workoutName={workout.name}
        elapsedLabel={fmtDuration(elapsedAtRender)}
        doneSets={doneSets}
        pendingSets={pendingSets}
        onSave={finishAndSave}
        onDiscard={() => {
          setFinishSheet(false);
          setConfirmDiscard(true);
        }}
      />

      <ConfirmSheet
        testID="confirm-discard"
        visible={confirmDiscard}
        title="¿Descartar el entrenamiento?"
        message="Se pierden todas las series de este entrenamiento. No se puede deshacer."
        confirmLabel="Descartar entrenamiento"
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          discard();
          toast("Entrenamiento descartado");
          router.dismissTo("/fuerza");
        }}
      />

      <BottomSheetForm visible={rename} title="Nombre del entrenamiento" label="Nombre" initialValue={workout.name} confirmLabel="Guardar cambios" onClose={() => setRename(false)} onSubmit={(v) => { setName(v.trim()); setRename(false); }} />

      {/* Añadir / sustituir */}
      <ExercisePicker
        visible={picker !== null}
        title={picker === "replace" ? "Sustituir ejercicio" : "Añadir ejercicio"}
        subtitle={picker === "replace" ? `En lugar de ${ex?.name ?? ""}` : "Se añade después del actual"}
        suggested={picker === "replace" ? substitutes : undefined}
        excludeIds={workout.exercises.map((e) => e.exerciseId)}
        onClose={() => setPicker(null)}
        onPick={(picked) => {
          if (picker === "replace") {
            replace(idx, picked);
            toast(`Sustituido por ${picked.name}`);
          } else {
            add(picked, workout.exercises.length ? idx : undefined);
            toast(`${picked.name} añadido`);
          }
          setPicker(null);
        }}
        onCreate={(n) => {
          createMode.current = picker ?? "add";
          setPicker(null);
          router.push({ pathname: "/crear-ejercicio", params: { name: n, from: "picker" } });
        }}
      />

      {/* Foto a pantalla completa */}
      <FullScreenModal visible={zoom} onClose={() => setZoom(false)} title={ex?.name ?? "Ejercicio"}>
        <View style={{ borderRadius: radius.lg, overflow: "hidden" }}>{media ? <MediaStage exercise={media} height={420} rounded={false} /> : null}</View>
      </FullScreenModal>
    </SafeAreaView>
  );
}

export default function WorkoutScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workout = useActiveWorkout((s) => s.workout);
  if (!workout || workout.id !== id) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: "center", padding: space.xl }} edges={["top", "bottom"]}>
        <EmptyState icon="barbell-outline" title="Este entrenamiento ya no está abierto" text="Puedes empezar otro desde Fuerza." actionLabel="Ir a Fuerza" onAction={() => router.dismissTo("/fuerza")} />
      </SafeAreaView>
    );
  }
  return <Runner />;
}


/** Tiempo transcurrido del entreno, que se repinta solo a sí mismo cada segundo. */
function Elapsed({ startedAt, doneSets }: { startedAt: string; doneSets: number }) {
  const now = useNow(1000);
  return (
    <Text variant="caption" color="muted" tabular testID="workout-elapsed" numberOfLines={1}>
      {fmtDuration((now - new Date(startedAt).getTime()) / 1000)} · {doneSets} {doneSets === 1 ? "serie" : "series"}
    </Text>
  );
}
