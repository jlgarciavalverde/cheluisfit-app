import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { takeCreatedExercise } from "@/lib/createdExercise";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { ExercisePicker } from "@/components/strength/ExercisePicker";
import { RoutineExerciseEditor } from "@/components/strength/RoutineExerciseEditor";
import { Button, Chip, ConfirmSheet, EmptyState, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useLibrary, useStrength } from "@/data/strengthStore";
import { makeId } from "@/domain/running";
import { linkSuperset, type Routine, type RoutineExercise, routineExerciseFor, unlinkSuperset } from "@/domain/strength";
import { moveItem } from "@/domain/strength";
import { space } from "@/theme/tokens";

export default function RoutineEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = useStrength((s) => s.routines.find((r) => r.id === id));
  const routines = useStrength((s) => s.routines);
  const saveRoutine = useStrength((s) => s.saveRoutine);
  const deleteRoutine = useStrength((s) => s.deleteRoutine);
  const restoreRoutine = useStrength((s) => s.restoreRoutine);
  const library = useLibrary();
  const byId = useMemo(() => new Map(library.map((e) => [e.id, e])), [library]);
  const isNew = id === "new" || !existing;

  const [name, setName] = useState(existing?.name ?? "");
  const [folder, setFolder] = useState(existing?.folder ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [items, setItems] = useState<RoutineExercise[]>(() => (existing ? structuredClone(existing.exercises) : []));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [tried, setTried] = useState(false);

  // Salir sin guardar (flecha, «atrás» de Android o gesto) lo perdía todo sin avisar.
  const navigation = useNavigation();
  const initial = useRef(JSON.stringify([name, folder, notes, items])).current;
  const dirty = JSON.stringify([name, folder, notes, items]) !== initial;
  const leaving = useRef(false);
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  useEffect(
    () =>
      navigation.addListener("beforeRemove", (e) => {
        if (!dirty || leaving.current) return;
        e.preventDefault();
        setPendingLeave(() => () => {
          leaving.current = true;
          navigation.dispatch(e.data.action);
        });
      }),
    [navigation, dirty],
  );
  const leave = () => {
    leaving.current = true;
    if (router.canGoBack()) router.back();
    else router.replace("/fuerza");
  };

  const folders = useMemo(() => [...new Set(routines.map((r) => r.folder).filter(Boolean) as string[])], [routines]);
  const nameBad = name.trim() === "";
  const empty = items.length === 0;
  const toggle = (rid: string) =>
    setOpen((o) => {
      const n = new Set(o);
      n.has(rid) ? n.delete(rid) : n.add(rid);
      return n;
    });

  const save = () => {
    setTried(true);
    if (nameBad || empty) return;
    const routine: Routine = {
      id: existing?.id ?? makeId("rt"),
      name: name.trim(),
      folder: folder.trim() || undefined,
      notes: notes.trim() || undefined,
      exercises: items,
    };
    saveRoutine(routine);
    toast(isNew ? "Rutina creada" : "Rutina guardada");
    leave();
  };

  const totalSets = items.reduce((n, e) => n + e.sets.length, 0);

  // Vuelta de «Crear ejercicio» abierto desde el selector: se añade como si se hubiera elegido.
  useFocusEffect(
    useCallback(() => {
      const id = takeCreatedExercise();
      const ex = id ? useStrength.getState().custom.find((e) => e.id === id) : undefined;
      if (!ex) return;
      const r = routineExerciseFor(ex, 3, 8, 12);
      setItems((l) => [...l, r]);
      setOpen(new Set([r.id]));
    }, []),
  );

  return (
    <Screen variant="form"
      testID="screen-rutina"
      footer={
        <View style={{ gap: space.sm }}>
          <Text variant="caption" color="muted" tabular>
            {items.length === 1 ? "1 ejercicio" : `${items.length} ejercicios`} · {totalSets === 1 ? "1 serie" : `${totalSets} series`}
          </Text>
          <Button testID="save-routine" label={isNew ? "Crear rutina" : "Guardar cambios"} size="lg" fullWidth onPress={save} />
        </View>
      }
    >
      <ScreenHeader
        title={isNew ? "Nueva rutina" : "Editar rutina"}
        // La flecha pregunta aquí mismo: en la web `router.back()` va por el historial del
        // navegador y `beforeRemove` no llega a poder pararlo.
        onBack={() => (dirty ? setPendingLeave(() => leave) : leave())}
      />
      <View style={{ gap: space.lg }}>
        <TextField
          testID="rt-name"
          label="Nombre"
          value={name}
          onChangeText={setName}
          maxLength={60}
          placeholder="Pecho y tríceps"
          error={tried && nameBad ? "Ponle un nombre" : undefined}
        />
        <View style={{ gap: space.sm }}>
          <TextField label="Carpeta (opcional)" value={folder} onChangeText={setFolder} maxLength={40} placeholder="Mi semana" />
          {folders.length > 0 ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {folders.map((f) => (
                <Chip key={f} label={f} selected={folder === f} onPress={() => setFolder(folder === f ? "" : f)} />
              ))}
            </View>
          ) : null}
        </View>

        <View style={{ gap: space.md }}>
          <Text variant="heading">Ejercicios</Text>
          {empty ? <EmptyState icon="barbell-outline" title="Sin ejercicios todavía" text="Añade los que vas a hacer en esta rutina." /> : null}
          {items.map((it, idx) => (
            <RoutineExerciseEditor
              key={it.id}
              item={it}
              exercise={byId.get(it.exerciseId)}
              all={items}
              index={idx}
              expanded={open.has(it.id)}
              onToggle={() => toggle(it.id)}
              onChange={(r) => setItems((l) => l.map((x, i) => (i === idx ? r : x)))}
              onRemove={() => {
                const before = items;
                setItems((l) => unlinkSuperset(l, idx).filter((_, i) => i !== idx));
                toast(`${byId.get(it.exerciseId)?.name ?? "Ejercicio"} quitado`, { actionLabel: "Deshacer", onAction: () => setItems(before) });
              }}
              onMove={(d) => setItems((l) => moveItem(l, idx, d))}
              onLinkNext={() => setItems((l) => linkSuperset(l, idx, idx + 1))}
              onUnlink={() => setItems((l) => unlinkSuperset(l, idx))}
              canUp={idx > 0}
              canDown={idx < items.length - 1}
              canLinkNext={idx < items.length - 1}
            />
          ))}
          <Button testID="add-exercise" label="Añadir ejercicio" icon="add" variant="secondary" onPress={() => setPicking(true)} />
          {tried && empty ? (
            <Text variant="caption" color="danger">
              • Añade al menos un ejercicio
            </Text>
          ) : null}
        </View>

        <TextField label="Notas (opcional)" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 72, textAlignVertical: "top" }} />

        {!isNew && existing ? (
          <Button
            label="Eliminar rutina"
            icon="trash-outline"
            variant="danger"
            fullWidth
            onPress={() => {
              const at = routines.findIndex((r) => r.id === existing.id);
              const removed = deleteRoutine(existing.id);
              leave();
              if (removed) toast(`«${removed.name}» eliminada`, { actionLabel: "Deshacer", onAction: () => restoreRoutine(removed, at) });
            }}
          />
        ) : null}
      </View>

      <ExercisePicker
        visible={picking}
        title="Añadir ejercicio"
        subtitle="Se añade al final de la rutina"
        excludeIds={items.map((i) => i.exerciseId)}
        onClose={() => setPicking(false)}
        onPick={(ex) => {
          const r = routineExerciseFor(ex, 3, 8, 12);
          setItems((l) => [...l, r]);
          // Solo el recién añadido desplegado: con todos abiertos la página se hacía larguísima.
          setOpen(new Set([r.id]));
          setPicking(false);
        }}
        onCreate={(n) => {
          setPicking(false);
          router.push({ pathname: "/crear-ejercicio", params: { name: n, from: "picker" } });
        }}
      />
      <ConfirmSheet
        visible={pendingLeave !== null}
        testID="leave-unsaved"
        title="¿Salir sin guardar?"
        message={isNew ? "La rutina no se ha creado todavía: se perderá lo que has puesto." : "Se perderán los cambios que has hecho en la rutina."}
        confirmLabel="Salir sin guardar"
        onConfirm={() => {
          const go = pendingLeave;
          setPendingLeave(null);
          go?.();
        }}
        onClose={() => setPendingLeave(null)}
      />
    </Screen>
  );
}
