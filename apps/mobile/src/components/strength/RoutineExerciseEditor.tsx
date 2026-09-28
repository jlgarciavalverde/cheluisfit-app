import { Pressable, View } from "react-native";
import { parseNum } from "@/domain/format";
import {
  type Exercise,
  planCounts,
  plannedSets,
  planSummary,
  restText,
  type RoutineExercise,
  RULE_LABEL,
  type ProgressionRule,
  supersetLabel,
} from "@/domain/strength";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { IconButton } from "../ui/Button";
import { Badge } from "../ui/Badge";
import { Chip } from "../ui/Chip";
import { DurationField } from "../ui/DurationField";
import { Icon } from "../ui/Icon";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Stepper } from "../ui/Stepper";
import { Text } from "../ui/Text";
import { TextField } from "../ui/TextField";
import { Button } from "../ui/Button";
import { ExerciseThumb } from "./MediaStage";
import { FieldGroup } from "../ui/Section";

const INCREMENTS = [1, 1.25, 2, 2.5, 5];

/** Un ejercicio dentro del editor de rutinas: fila resumen que se despliega para configurarlo. */
export function RoutineExerciseEditor({
  item,
  exercise,
  all,
  index,
  expanded,
  onToggle,
  onChange,
  onRemove,
  onMove,
  onLinkNext,
  onUnlink,
  canUp,
  canDown,
  canLinkNext,
}: {
  item: RoutineExercise;
  exercise?: Exercise;
  all: readonly RoutineExercise[];
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onChange: (r: RoutineExercise) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
  onLinkNext: () => void;
  onUnlink: () => void;
  canUp: boolean;
  canDown: boolean;
  canLinkNext: boolean;
}) {
  const { c } = useTheme();
  const counts = planCounts(item.sets);
  const ss = supersetLabel(all, index);
  const name = exercise?.name ?? "Ejercicio desconocido";
  const isDuration = exercise?.kind === "duration";
  const setPlan = (patch: Partial<typeof counts>) => {
    const n = { ...counts, ...patch };
    onChange({ ...item, sets: plannedSets(n.warmups, n.working, n.repMin, n.repMax) });
  };
  const summary = `${planSummary(item.sets, exercise?.kind)} · ${restText(item.restS)} · ${RULE_LABEL[item.rule].toLowerCase()}`;

  return (
    <View
      testID={`rex-${item.id}`}
      style={{ borderRadius: radius.md, borderWidth: 1, borderColor: expanded ? c.brand : c.border, backgroundColor: c.surface, overflow: "hidden" }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${name}. ${summary}. ${expanded ? "Cerrar" : "Editar"}`}
          onPress={onToggle}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 72, padding: space.sm }}
        >
          {exercise ? <ExerciseThumb exercise={exercise} size={52} /> : null}
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, flexWrap: "wrap" }}>
              {ss ? <Badge label={ss} tone="brand" icon="link" /> : null}
              <Text variant="bodyStrong" numberOfLines={2} style={{ flexShrink: 1 }}>
                {name}
              </Text>
            </View>
            <Text variant="caption" color="muted" numberOfLines={2}>
              {summary}
            </Text>
          </View>
          <Icon name={expanded ? "chevron-up" : "chevron-down"} size="sm" color="faint" />
        </Pressable>
        <IconButton icon="arrow-up" label={`Subir ${name}`} size="sm" color="muted" onPress={() => canUp && onMove(-1)} />
        <IconButton icon="arrow-down" label={`Bajar ${name}`} size="sm" color="muted" onPress={() => canDown && onMove(1)} />
      </View>

      {expanded ? (
        <View style={{ gap: space.lg, padding: space.md, borderTopWidth: 1, borderTopColor: c.border }}>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Stepper testID={`w-${item.id}`} label="Series" value={counts.working} min={1} max={10} onChange={(n) => setPlan({ working: n })} />
            <Stepper testID={`wu-${item.id}`} label="Calentamiento" value={counts.warmups} max={4} onChange={(n) => setPlan({ warmups: n })} />
          </View>

          <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-end" }}>
            <TextField
              testID={`min-${item.id}`}
              label={isDuration ? "Segundos mín." : "Reps mín."}
              keyboardType="number-pad"
              value={String(counts.repMin)}
              onChangeText={(t) => {
                const v = parseNum(t);
                if (v !== null && v > 0 && v <= 200) setPlan({ repMin: Math.round(v), repMax: Math.max(Math.round(v), counts.repMax) });
              }}
            />
            <TextField
              testID={`max-${item.id}`}
              label={isDuration ? "Segundos máx." : "Reps máx."}
              keyboardType="number-pad"
              value={String(counts.repMax)}
              onChangeText={(t) => {
                const v = parseNum(t);
                if (v !== null && v > 0 && v <= 200) setPlan({ repMax: Math.round(v), repMin: Math.min(Math.round(v), counts.repMin) });
              }}
            />
          </View>

          <DurationField
            testID={`rest-${item.id}`}
            label="Descanso entre series"
            value={item.restS}
            onChange={(s) => s !== null && s >= 0 && s <= 900 && onChange({ ...item, restS: s })}
            hint="Se usa para el temporizador automático"
          />

          <FieldGroup label="Sobrecarga progresiva">
            <SegmentedControl<ProgressionRule>
              value={item.rule}
              onChange={(rule) => onChange({ ...item, rule })}
              options={[
                { value: "double", label: "Doble" },
                { value: "linear", label: "Lineal" },
                { value: "off", label: "Ninguna" },
              ]}
            />
            <Text variant="caption" color="faint">
              {item.rule === "double"
                ? "Mantén el peso hasta llegar al máximo de reps en todas las series; entonces sube."
                : item.rule === "linear"
                  ? "Si completas todas las series, sube el peso la próxima vez."
                  : "Sin sugerencias: se te enseña lo de la última vez."}
            </Text>
            {item.rule !== "off" ? (
              <View style={{ gap: space.xs }}>
                <Text variant="caption" color="muted">
                  Cuánto sube cada vez
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                  {INCREMENTS.map((n) => (
                    <Chip key={n} label={`${String(n).replace(".", ",")} kg`} selected={item.increment === n} onPress={() => onChange({ ...item, increment: n })} />
                  ))}
                </View>
              </View>
            ) : null}
          </FieldGroup>

          <TextField
            label="Nota (opcional)"
            value={item.note ?? ""}
            onChangeText={(t) => onChange({ ...item, note: t || undefined })}
            placeholder="Agarre, altura del banco…"
            maxLength={120}
          />

          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {item.supersetId ? (
              <Button label="Quitar superserie" icon="unlink-outline" variant="secondary" size="sm" onPress={onUnlink} />
            ) : canLinkNext ? (
              <Button testID={`link-${item.id}`} label="Superserie con el siguiente" icon="link-outline" variant="secondary" size="sm" onPress={onLinkNext} />
            ) : null}
            <Button label="Quitar de la rutina" icon="trash-outline" variant="danger" size="sm" onPress={onRemove} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
