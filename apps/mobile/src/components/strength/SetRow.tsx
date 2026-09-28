import { useEffect, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { formatEffort, type Ghost, type SetLog, SET_TYPE_LABEL, type SetLabel } from "@/domain/strength";
import { fmtKg, parseNum } from "@/domain/format";
import { useSetColumns } from "./setColumns";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, typeScale } from "@/theme/tokens";
import { Icon } from "../ui/Icon";
import { Text } from "../ui/Text";

const fmt = (n: number | null) => (n === null ? "" : fmtKg(n));
const BADGE_COLOR = { C: "carbs", F: "danger", D: "fat" } as const;

/** Celda numérica: escribe con teclado numérico; el valor sugerido se ve en gris hasta pulsar ✓. */
function NumCell({
  value,
  placeholder,
  onCommit,
  done,
  decimal,
  label,
  testID,
  error,
}: {
  value: number | null;
  placeholder: string;
  onCommit: (n: number | null) => void;
  done: boolean;
  decimal?: boolean;
  label: string;
  testID: string;
  error?: boolean;
}) {
  const { c } = useTheme();
  const [text, setText] = useState(fmt(value));
  useEffect(() => {
    const parsed = parseNum(text);
    if ((text.trim() === "" ? null : parsed) !== value) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <TextInput
      testID={testID}
      accessibilityLabel={label}
      value={text}
      placeholder={placeholder}
      placeholderTextColor={c.faint}
      keyboardType={decimal ? "decimal-pad" : "number-pad"}
      maxFontSizeMultiplier={1.1}
      selectTextOnFocus
      editable={!done}
      onChangeText={(t) => {
        setText(t);
        if (t.trim() === "") return onCommit(null);
        const n = parseNum(t);
        if (n !== null && n >= 0 && n <= 9999) onCommit(n);
      }}
      style={
        {
          height: 44,
          borderRadius: radius.sm,
          textAlign: "center",
          ...typeScale.inputStrong,
          fontVariant: ["tabular-nums"],
          color: c.text,
          backgroundColor: done ? "transparent" : c.surfaceAlt,
          borderWidth: 1.5,
          borderColor: error ? c.danger : "transparent",
          padding: 0,
          outlineStyle: "none",
        } as object
      }
    />
  );
}

/** Una fila de la tabla de series: etiqueta/tipo, anterior, kg, reps, esfuerzo y el check de hecha. */
export function SetRow({
  index,
  set,
  label,
  ghost,
  previous,
  isDrop,
  isNext,
  hasKg,
  kind,
  effortMode,
  hasError,
  onTypePress,
  onCopyPrev,
  onCommitKg,
  onCommitReps,
  onEffortPress,
  onComplete,
}: {
  index: number;
  set: SetLog;
  label: SetLabel;
  ghost: Ghost | null;
  previous: SetLog | null;
  isDrop: boolean;
  isNext: boolean;
  hasKg: boolean;
  kind: "weight_reps" | "bodyweight" | "duration";
  effortMode: "rir" | "rpe";
  hasError: boolean;
  onTypePress: () => void;
  onCopyPrev: () => void;
  onCommitKg: (n: number | null) => void;
  onCommitReps: (n: number | null) => void;
  onEffortPress: () => void;
  onComplete: () => void;
}) {
  const { c } = useTheme();
  const col = useSetColumns();
  const s = set;
  const l = label;
  const g = ghost;
  const prev = previous;
  return (
    <View
      testID={`set-row-${index}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: col.gap,
        minHeight: 52,
        paddingVertical: 4,
        paddingLeft: isDrop ? 14 : 0,
        paddingRight: 2,
        borderRadius: radius.md,
        backgroundColor: s.done ? c.successSoft : "transparent",
        borderWidth: 1,
        borderColor: isNext && !s.done ? c.brand : "transparent",
      }}
    >
      {isDrop ? (
        <View pointerEvents="none" style={{ position: "absolute", left: 4, top: -6, bottom: 26, width: 8, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: c.fat, borderBottomLeftRadius: 6 }} />
      ) : null}
      <Pressable
        testID={`set-label-${index}`}
        accessibilityRole="button"
        accessibilityLabel={`Serie ${l.label}${l.badge ? `, ${SET_TYPE_LABEL[s.type]}` : ""}. Cambiar tipo`}
        onPress={onTypePress}
        style={{ width: isDrop ? col.serie - 4 : col.serie, height: 44, alignItems: "center", justifyContent: "center" }}
      >
        {l.badge ? (
          <View
            style={{
              minWidth: 30,
              height: 30,
              paddingHorizontal: 6,
              borderRadius: radius.pill,
              backgroundColor: c[BADGE_COLOR[l.badge]],
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text variant="control" style={{ color: c.bg }} maxFontSizeMultiplier={1.1}>
              {l.badge}
              {l.dropIndex > 1 ? l.dropIndex : ""}
            </Text>
          </View>
        ) : (
          <Text variant="heading" tabular maxFontSizeMultiplier={1.1}>
            {l.label}
          </Text>
        )}
      </Pressable>

      <Pressable
        testID={`prev-${index}`}
        accessibilityRole="button"
        accessibilityLabel={prev ? `Última vez: ${prev.kg ?? 0} kilos por ${prev.reps}. Copiar` : "Sin dato de la última vez"}
        disabled={!prev || s.done}
        onPress={onCopyPrev}
        style={{ flex: 1, minWidth: col.prevMin, alignItems: "center", justifyContent: "center", minHeight: 44 }}
      >
        <Text variant="caption" color="faint" tabular numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.1}>
          {prev ? (kind === "duration" ? `${prev.reps} s` : kind === "bodyweight" && !prev.kg ? `${prev.reps}` : `${fmt(prev.kg)}×${prev.reps}`) : "–"}
        </Text>
      </Pressable>

      {hasKg ? (
        <View style={{ width: col.kg }}>
          <NumCell
            testID={`kg-${index}`}
            label={`Kilos de la serie ${l.label}`}
            value={s.kg}
            placeholder={g?.kg != null ? fmt(g.kg) : kind === "bodyweight" ? "0" : "–"}
            decimal
            done={s.done}
            error={hasError && kind === "weight_reps" && (s.kg ?? g?.kg ?? null) === null}
            onCommit={onCommitKg}
          />
        </View>
      ) : null}

      <View style={{ width: col.reps }}>
        <NumCell
          testID={`reps-${index}`}
          label={`${kind === "duration" ? "Segundos" : "Repeticiones"} de la serie ${l.label}`}
          value={s.reps}
          placeholder={g?.reps != null ? fmt(g.reps) : "–"}
          done={s.done}
          error={hasError && (s.reps ?? g?.reps ?? null) === null}
          onCommit={onCommitReps}
        />
      </View>

      <Pressable
        testID={`effort-${index}`}
        accessibilityRole="button"
        accessibilityLabel={`Esfuerzo de la serie ${l.label}: ${s.rpe === null ? "sin dato" : formatEffort(s.rpe, effortMode)}`}
        onPress={onEffortPress}
        style={{
          width: col.effort,
          height: 44,
          borderRadius: radius.sm,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: s.done ? "transparent" : c.surfaceAlt,
        }}
      >
        <Text variant="bodyStrong" color={s.rpe === null ? "faint" : "text"} tabular maxFontSizeMultiplier={1.1}>
          {formatEffort(s.rpe, effortMode)}
        </Text>
      </Pressable>

      <Pressable
        testID={`done-${index}`}
        accessibilityRole="checkbox"
        aria-checked={s.done}
        accessibilityLabel={`Serie ${l.label} hecha`}
        onPress={onComplete}
        hitSlop={2}
        style={{ width: col.done, height: 48, alignItems: "center", justifyContent: "center" }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.pill,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: s.done ? c.success : "transparent",
            borderWidth: 2,
            borderColor: s.done ? c.success : hasError ? c.danger : c.faint,
          }}
        >
          {s.done ? <Icon name="checkmark" size="md" color="bg" /> : null}
        </View>
      </Pressable>
    </View>
  );
}
