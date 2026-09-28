import { Pressable, View } from "react-native";
import { type EffortMode, RIR_OPTIONS, rirToRpe, RPE_OPTIONS, SET_TYPE_LABEL, type SetLog, type SetType } from "@/domain/strength";
import { fmtNum } from "@/domain/format";
import { useTheme } from "@/theme/ThemeProvider";
import { interaction, radius, space } from "@/theme/tokens";
import { ActionRow } from "../ui/ActionRow";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { SegmentedControl } from "../ui/SegmentedControl";
import { Text } from "../ui/Text";

/** Una línea por tipo para que el flujo se entienda sin salir de la hoja. */
const TYPE_OPTIONS: { value: SetType; hint: string }[] = [
  { value: "normal", hint: "Serie de trabajo, con su descanso completo." },
  { value: "warmup", hint: "Carga ligera de preparación; no cuenta en el volumen ni en las marcas." },
  { value: "failure", hint: "Hasta la última repetición posible, sin margen." },
  { value: "drop", hint: "Sin descanso: bajas el peso y sigues. Va colgado de la serie anterior." },
];

/** Hoja para cambiar el tipo de una serie (normal/calentamiento/fallo/drop) o borrarla. */
export function TypeSheet({
  visible,
  onClose,
  set,
  canBeDrop,
  canDropBelow,
  onType,
  onDrop,
  onDelete,
}: {
  visible: boolean;
  onClose: () => void;
  set: SetLog | null;
  /** La serie puede ser drop: no es la primera y la anterior no es calentamiento (regla de `normalizeSets`). */
  canBeDrop: boolean;
  canDropBelow: boolean;
  onType: (t: SetType) => void;
  onDrop: () => void;
  onDelete: () => void;
}) {
  const { c } = useTheme();
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Tipo de serie" subtitle="Toca para cambiarlo">
      <View style={{ gap: space.sm }}>
        {TYPE_OPTIONS.map((o) => {
          const disabled = o.value === "drop" && !canBeDrop;
          const selected = set?.type === o.value;
          return (
            <Pressable
              key={o.value}
              testID={`type-${o.value}`}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled }}
              disabled={disabled}
              onPress={() => onType(o.value)}
              style={({ pressed }) => ({
                borderRadius: radius.md,
                paddingHorizontal: space.md,
                paddingVertical: space.sm,
                gap: 2,
                backgroundColor: selected ? c.brandSoft : c.surfaceAlt,
                borderWidth: 1,
                borderColor: selected ? c.brand : c.border,
                opacity: disabled ? 0.45 : pressed ? interaction.pressedOpacity : 1,
              })}
            >
              <Text variant="bodyStrong" color={selected ? "brandText" : "text"}>
                {SET_TYPE_LABEL[o.value]}
              </Text>
              <Text variant="caption" color="muted">
                {disabled ? "Va colgado de una serie de trabajo anterior — aquí no puede ir." : o.hint}
              </Text>
            </Pressable>
          );
        })}
        {canDropBelow ? <ActionRow testID="add-drop-below" label="Añadir un drop debajo" icon="arrow-down" onPress={onDrop} /> : null}
        <ActionRow testID="delete-set" label="Borrar esta serie" icon="trash-outline" tone="danger" onPress={onDelete} />
        <Button label="Cerrar" variant="ghost" fullWidth onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

/** Hoja para elegir el esfuerzo (RIR o RPE) de una serie. */
export function EffortSheet({
  visible,
  onClose,
  mode,
  onMode,
  current,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  mode: EffortMode;
  onMode: (m: EffortMode) => void;
  current: number | null;
  onPick: (rpe: number | null) => void;
}) {
  const options = mode === "rir" ? RIR_OPTIONS : RPE_OPTIONS;
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="¿Cuánto te costó?"
      subtitle={mode === "rir" ? "RIR: repeticiones que te habrían quedado" : "RPE: esfuerzo percibido de 6 a 10"}
    >
      <View style={{ gap: space.md }}>
        <SegmentedControl<EffortMode>
          value={mode}
          onChange={onMode}
          options={[
            { value: "rir", label: "RIR" },
            { value: "rpe", label: "RPE" },
          ]}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
          {options.map((o) => {
            const rpe = mode === "rir" ? rirToRpe(o) : o;
            return <Chip key={o} testID={`effort-opt-${o}`} label={fmtNum(o)} selected={current === rpe} onPress={() => onPick(rpe)} />;
          })}
        </View>
        <Text variant="caption" color="faint">
          {mode === "rir" ? "0 = no podías más · 2 = te quedaban 2 repeticiones" : "10 = máximo · 8 = te quedaban 2 repeticiones"}
        </Text>
        <Button label="Sin dato" variant="ghost" fullWidth onPress={() => onPick(null)} />
      </View>
    </BottomSheet>
  );
}
