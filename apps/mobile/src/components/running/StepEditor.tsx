import { useState } from "react";
import { Pressable, View } from "react-native";
import { parseNum } from "@/domain/format";
import {
  defaultMaxHr,
  describeStep,
  hrZoneRange,
  type Step,
  STEP_LABEL,
  type StepDuration,
  type StepKind,
  type StepTarget,
} from "@/domain/running";
import { useNutrition } from "@/data/store";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import type { Palette } from "@/theme/tokens";
import { IconButton } from "../ui/Button";
import { DurationField } from "../ui/DurationField";
import { Chip } from "../ui/Chip";
import { Icon } from "../ui/Icon";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Text } from "../ui/Text";
import { TextField } from "../ui/TextField";
import { FieldGroup } from "../ui/Section";

const KINDS: StepKind[] = ["warmup", "work", "recovery", "cooldown", "free"];
export const KIND_COLOR: Record<StepKind, keyof Palette> = {
  warmup: "carbs",
  work: "brand",
  recovery: "fat",
  cooldown: "fiber",
  free: "muted",
};

type DurType = StepDuration["type"];
type TargetType = StepTarget["type"];

function initialDistance(d: StepDuration): { text: string; unit: "m" | "km" } {
  if (d.type !== "distance") return { text: "1000", unit: "m" };
  if (d.meters >= 1000 && d.meters % 100 === 0) return { text: String(d.meters / 1000).replace(".", ","), unit: "km" };
  return { text: String(d.meters), unit: "m" };
}

/** Editor de un paso: fila resumen que se despliega para editar tipo, duración y objetivo. */
export function StepEditor({
  step,
  onChange,
  onRemove,
  onMove,
  expanded,
  onToggle,
  canUp,
  canDown,
  nested,
}: {
  step: Step;
  onChange: (s: Step) => void;
  onRemove: () => void;
  onMove: (delta: -1 | 1) => void;
  expanded: boolean;
  onToggle: () => void;
  canUp: boolean;
  canDown: boolean;
  nested?: boolean;
}) {
  const { c } = useTheme();
  const profile = useNutrition((s) => s.profile);
  const maxHr = profile.maxHr ?? defaultMaxHr(profile.age);
  const [dist, setDist] = useState(() => initialDistance(step.duration));
  const [distErr, setDistErr] = useState(false);
  const [timeErr, setTimeErr] = useState(false);
  const [paceErr, setPaceErr] = useState(false);

  const setDuration = (duration: StepDuration) => onChange({ ...step, duration });
  const setTarget = (target: StepTarget) => onChange({ ...step, target });

  const commitDist = (text: string, unit: "m" | "km") => {
    const v = parseNum(text);
    const meters = v === null ? null : Math.round(v * (unit === "km" ? 1000 : 1));
    if (meters !== null && meters > 0 && meters <= 100000) {
      setDistErr(false);
      setDuration({ type: "distance", meters });
    } else setDistErr(true);
  };
  const changeDurType = (t: DurType) => {
    setDistErr(false);
    setTimeErr(false);
    if (t === "open") setDuration({ type: "open" });
    else if (t === "distance") commitDist(dist.text, dist.unit);
    else setDuration({ type: "time", seconds: step.duration.type === "time" ? step.duration.seconds : 600 });
  };
  const changeTargetType = (t: TargetType) => {
    setPaceErr(false);
    if (t === "none") setTarget({ type: "none" });
    else if (t === "pace") setTarget({ type: "pace", secPerKm: step.target.type === "pace" ? step.target.secPerKm : 300 });
    else if (t === "hr") setTarget({ type: "hr", zone: 2 });
    else setTarget({ type: "rpe", value: 7 });
  };

  return (
    <View
      testID={`step-${step.id}`}
      style={{
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: expanded ? c.brand : c.border,
        backgroundColor: nested ? c.surfaceAlt : c.surface,
        overflow: "hidden",
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${describeStep(step)}. ${expanded ? "Cerrar" : "Editar"}`}
          onPress={onToggle}
          style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56, paddingLeft: space.md }}
        >
          <View style={{ width: 8, alignSelf: "stretch", marginVertical: space.md, borderRadius: radius.xs, backgroundColor: c[KIND_COLOR[step.kind]] }} />
          <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>
            {describeStep(step)}
          </Text>
          <Icon name={expanded ? "chevron-up" : "chevron-down"} size="sm" color="faint" />
        </Pressable>
        <IconButton icon="arrow-up" label="Subir paso" size="sm" color="muted" disabled={!canUp} onPress={() => onMove(-1)} />
        <IconButton icon="arrow-down" label="Bajar paso" size="sm" color="muted" disabled={!canDown} onPress={() => onMove(1)} />
      </View>

      {expanded ? (
        <View style={{ gap: space.lg, padding: space.md, paddingTop: space.sm, borderTopWidth: 1, borderTopColor: c.border }}>
          <FieldGroup label="Tipo">
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
              {KINDS.map((k) => (
                <Chip key={k} label={STEP_LABEL[k]} selected={step.kind === k} onPress={() => onChange({ ...step, kind: k })} />
              ))}
            </View>
          </FieldGroup>

          <FieldGroup label="Duración">
            <SegmentedControl<DurType>
              role="radio"
              label="Duración del paso"
              value={step.duration.type}
              onChange={changeDurType}
              options={[
                { value: "distance", label: "Distancia" },
                { value: "time", label: "Tiempo" },
                { value: "open", label: "Abierto" },
              ]}
            />
            {step.duration.type === "distance" ? (
              <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
                <TextField
                  testID="dur-distance"
                  label="Distancia"
                  keyboardType="decimal-pad"
                  value={dist.text}
                  onChangeText={(t) => {
                    setDist({ ...dist, text: t });
                    commitDist(t, dist.unit);
                  }}
                  error={distErr ? "Distancia no válida" : undefined}
                />
                <View style={{ flexDirection: "row", gap: space.xs, paddingBottom: distErr ? 22 : 0 }}>
                  {(["m", "km"] as const).map((u) => (
                    <Chip
                      key={u}
                      label={u}
                      selected={dist.unit === u}
                      onPress={() => {
                        setDist({ ...dist, unit: u });
                        commitDist(dist.text, u);
                      }}
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {step.duration.type === "time" ? (
              <DurationField
                testID="dur-time"
                label="Tiempo"
                value={step.duration.seconds}
                onChange={(sec) => {
                  if (sec !== null && sec > 0 && sec <= 6 * 3600) {
                    setTimeErr(false);
                    setDuration({ type: "time", seconds: sec });
                  } else setTimeErr(true);
                }}
                error={timeErr ? "Tiempo no válido" : undefined}
              />
            ) : null}
            {step.duration.type === "open" ? (
              <Text variant="caption" color="muted">
                Sin distancia ni tiempo fijos: dura hasta que pulses vuelta en el reloj.
              </Text>
            ) : null}
          </FieldGroup>

          <FieldGroup label="Objetivo">
            <SegmentedControl<TargetType>
              role="radio"
              label="Objetivo del paso"
              value={step.target.type}
              onChange={changeTargetType}
              options={[
                { value: "none", label: "Ninguno" },
                { value: "pace", label: "Ritmo" },
                { value: "hr", label: "FC" },
                { value: "rpe", label: "RPE" },
              ]}
            />
            {step.target.type === "pace" ? (
              <DurationField
                testID="target-pace"
                label="Ritmo objetivo (por km)"
                value={step.target.secPerKm}
                onChange={(sec) => {
                  if (sec !== null && sec >= 120 && sec <= 900) {
                    setPaceErr(false);
                    setTarget({ type: "pace", secPerKm: sec });
                  } else setPaceErr(true);
                }}
                error={paceErr ? "Entre 2:00 y 15:00 por km" : undefined}
                hint="Minutos y segundos por kilómetro, por ejemplo 3 min 55 s"
              />
            ) : null}
            {step.target.type === "hr" ? (
              <View style={{ gap: space.sm }}>
                <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                  {([1, 2, 3, 4, 5] as const).map((z) => (
                    <Chip key={z} label={`Zona ${z}`} selected={step.target.type === "hr" && step.target.zone === z} onPress={() => setTarget({ type: "hr", zone: z })} />
                  ))}
                </View>
                <Text variant="caption" color="muted" tabular testID="hr-zone-hint">
                  {(() => {
                    const r = hrZoneRange(step.target.zone, maxHr);
                    return `Zona ${step.target.zone} ≈ ${r.from}–${r.to} ppm (FC máx. ${maxHr})`;
                  })()}
                </Text>
              </View>
            ) : null}
            {step.target.type === "rpe" ? (
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
                  <Chip key={v} label={String(v)} selected={step.target.type === "rpe" && step.target.value === v} onPress={() => setTarget({ type: "rpe", value: v })} />
                ))}
              </View>
            ) : null}
          </FieldGroup>

          <Pressable
            accessibilityRole="button"
            onPress={onRemove}
            style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 44 }}
          >
            <Icon name="trash-outline" size="md" color="danger" />
            <Text variant="bodyStrong" color="danger">
              Quitar paso
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
