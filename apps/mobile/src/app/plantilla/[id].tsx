import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { StepEditor } from "@/components/running/StepEditor";
import { formatMinutes } from "@/components/running/TemplateCard";
import { Callout, Button, Chip, EmptyState, FieldGroup, IconButton, Stepper, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useRunning } from "@/data/runningStore";
import { SEED_TEMPLATES } from "@/data/runningSeed";
import { fmtKm } from "@/domain/format";
import {
  cloneItems,
  estimateTemplate,
  makeId,
  moveItem,
  newRepeat,
  newStep,
  type Repeat,
  type Step,
  type Template,
  type TemplateItem,
  TEMPLATE_KIND_LABEL,
  type TemplateKind,
  templateProblems,
} from "@/domain/running";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

const KINDS = Object.keys(TEMPLATE_KIND_LABEL) as TemplateKind[];

export default function TemplateEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const existing = useRunning((s) => s.templates.find((t) => t.id === id));
  const saveTemplate = useRunning((s) => s.saveTemplate);
  const deleteTemplate = useRunning((s) => s.deleteTemplate);
  const restoreTemplate = useRunning((s) => s.restoreTemplate);
  const isNew = id === "new" || !existing;

  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<TemplateKind>(existing?.kind ?? "custom");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [items, setItems] = useState<TemplateItem[]>(() => (existing ? cloneItemsKeepIds(existing.items) : []));
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [tried, setTried] = useState(false);

  const draft: Template = { id: existing?.id ?? makeId("tpl"), name, kind, items, notes: notes.trim() || undefined };
  const est = useMemo(() => estimateTemplate(draft), [items]); // eslint-disable-line
  const problems = templateProblems(draft);

  const toggle = (sid: string) =>
    setOpen((o) => {
      const n = new Set(o);
      n.has(sid) ? n.delete(sid) : n.add(sid);
      return n;
    });

  const setItem = (idx: number, it: TemplateItem) => setItems((l) => l.map((x, i) => (i === idx ? it : x)));
  const removeItem = (idx: number) => setItems((l) => l.filter((_, i) => i !== idx));
  const addStep = () => {
    const s = newStep("work");
    setItems((l) => [...l, s]);
    setOpen((o) => new Set(o).add(s.id));
  };
  const addRepeat = () => setItems((l) => [...l, newRepeat()]);

  const save = () => {
    setTried(true);
    if (problems.length) return;
    saveTemplate(draft);
    toast(isNew ? "Plantilla creada" : "Plantilla guardada");
    router.back();
  };

  const fromBase = (kindBase: TemplateKind) => {
    const base = SEED_TEMPLATES.find((t) => t.kind === kindBase);
    if (!base) return;
    setItems(cloneItems(base.items));
    setKind(base.kind);
    if (!name.trim()) setName(base.name);
  };

  return (
    <Screen variant="form"
      testID="screen-plantilla"
      footer={
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }} accessibilityLiveRegion="polite">
            <Text variant="caption" color="muted">
              Total estimado
            </Text>
            <Text variant="bodyStrong" tabular testID="tpl-total">
              {est.meters > 0 ? `≈ ${fmtKm(est.meters)} km · ${formatMinutes(est.seconds)}` : "—"}
              {est.hasOpen ? " + pasos abiertos" : ""}
            </Text>
          </View>
          <Button testID="save-template" label={isNew ? "Crear plantilla" : "Guardar cambios"} size="lg" fullWidth onPress={save} />
        </View>
      }
    >
      <ScreenHeader title={isNew ? "Nueva plantilla" : "Editar plantilla"} back />
      <View style={{ gap: space.lg }}>
        <TextField testID="tpl-name" label="Nombre" value={name} onChangeText={setName} placeholder="Series 6×800" error={tried && !name.trim() ? "Ponle un nombre" : undefined} />
        <FieldGroup label="Tipo de entrenamiento">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {KINDS.map((k) => (
              <Chip key={k} label={TEMPLATE_KIND_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} />
            ))}
          </View>
        </FieldGroup>

        {items.length === 0 ? (
          <Callout icon="copy-outline" title="Empieza desde una base">
            <Text variant="caption" color="muted">
              Copia la estructura de una plantilla típica y ajústala.
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {(["intervals", "long", "sprints", "fartlek", "tempo", "easy"] as TemplateKind[]).map((k) => (
                <Chip key={k} testID={`base-${k}`} label={TEMPLATE_KIND_LABEL[k]} icon="copy-outline" onPress={() => fromBase(k)} />
              ))}
            </View>
          </Callout>
        ) : null}

        <View style={{ gap: space.md }}>
          <Text variant="heading">Estructura</Text>
          {items.length === 0 ? (
            <EmptyState icon="list-outline" title="Sin pasos todavía" text="Añade un paso o un bloque de repeticiones." />
          ) : null}
          {items.map((it, idx) =>
            it.type === "step" ? (
              <StepEditor
                key={it.id}
                step={it}
                expanded={open.has(it.id)}
                onToggle={() => toggle(it.id)}
                onChange={(s) => setItem(idx, s)}
                onRemove={() => removeItem(idx)}
                onMove={(d) => setItems((l) => moveItem(l, idx, d))}
                canUp={idx > 0}
                canDown={idx < items.length - 1}
              />
            ) : (
              <RepeatBlock
                key={it.id}
                block={it}
                open={open}
                toggle={toggle}
                onChange={(r) => setItem(idx, r)}
                onRemove={() => removeItem(idx)}
                onMove={(d) => setItems((l) => moveItem(l, idx, d))}
                canUp={idx > 0}
                canDown={idx < items.length - 1}
              />
            ),
          )}
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            <Button testID="add-step" label="Añadir paso" icon="add" variant="secondary" size="sm" onPress={addStep} />
            <Button testID="add-repeat" label="Bloque ×N" icon="repeat" variant="secondary" size="sm" onPress={addRepeat} />
          </View>
          {tried && problems.length > 0 ? (
            <View accessibilityLiveRegion="polite">
              {problems.map((p) => (
                <Text key={p} variant="caption" color="danger">
                  • {p}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <TextField label="Notas (opcional)" value={notes} onChangeText={setNotes} multiline placeholder="Recuperación, objetivo del día…" style={{ minHeight: 72, textAlignVertical: "top" }} />

        {!isNew && existing ? (
          <Button
            label="Eliminar plantilla"
            icon="trash-outline"
            variant="danger"
            fullWidth
            onPress={() => {
              const removed = deleteTemplate(existing.id);
              router.back();
              if (removed) toast(`«${removed.name}» eliminada`, { actionLabel: "Deshacer", onAction: () => restoreTemplate(removed) });
            }}
          />
        ) : null}
      </View>
    </Screen>
  );
}

function cloneItemsKeepIds(items: readonly TemplateItem[]): TemplateItem[] {
  return items.map((it) =>
    it.type === "step"
      ? { ...it, duration: { ...it.duration }, target: { ...it.target } }
      : { ...it, steps: it.steps.map((s) => ({ ...s, duration: { ...s.duration }, target: { ...s.target } })) },
  );
}

function RepeatBlock({
  block,
  open,
  toggle,
  onChange,
  onRemove,
  onMove,
  canUp,
  canDown,
}: {
  block: Repeat;
  open: Set<string>;
  toggle: (id: string) => void;
  onChange: (r: Repeat) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
  canUp: boolean;
  canDown: boolean;
}) {
  const { c } = useTheme();
  const setStep = (i: number, s: Step) => onChange({ ...block, steps: block.steps.map((x, j) => (j === i ? s : x)) });
  return (
    <View
      testID={`repeat-${block.id}`}
      style={{ borderRadius: radius.lg, borderWidth: 2, borderColor: c.border, padding: space.md, gap: space.md, backgroundColor: c.bg }}
    >
      <Stepper
        layout="inline"
        icon="repeat"
        label="Repetir"
        value={block.times}
        min={1}
        max={50}
        format={(n) => `×${n}`}
        decLabel="Una repetición menos"
        incLabel="Una repetición más"
        valueLabel={`${block.times} repeticiones`}
        minValueWidth={40}
        testID="repeat-times"
        onChange={(times) => onChange({ ...block, times })}
      />
      {block.steps.map((s, i) => (
        <StepEditor
          key={s.id}
          nested
          step={s}
          expanded={open.has(s.id)}
          onToggle={() => toggle(s.id)}
          onChange={(ns) => setStep(i, ns)}
          onRemove={() => onChange({ ...block, steps: block.steps.filter((_, j) => j !== i) })}
          onMove={(d) => onChange({ ...block, steps: moveItem(block.steps, i, d) })}
          canUp={i > 0}
          canDown={i < block.steps.length - 1}
        />
      ))}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Button
          label="Paso al bloque"
          icon="add"
          variant="ghost"
          size="sm"
          onPress={() => {
            const s = newStep("recovery");
            onChange({ ...block, steps: [...block.steps, s] });
            toggle(s.id);
          }}
        />
        <View style={{ flexDirection: "row" }}>
          <IconButton icon="arrow-up" label="Subir bloque" size="sm" color="muted" onPress={() => canUp && onMove(-1)} />
          <IconButton icon="arrow-down" label="Bajar bloque" size="sm" color="muted" onPress={() => canDown && onMove(1)} />
          <IconButton icon="trash-outline" label="Quitar bloque" size="md" color="danger" onPress={onRemove} />
        </View>
      </View>
    </View>
  );
}

