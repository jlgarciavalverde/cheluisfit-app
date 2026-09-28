import { View } from "react-native";
import { fmtInt, fmtNum } from "@/domain/format";
import type { Nutrients, Targets } from "@/domain/types";
import { useBreakpoint } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";
import type { Palette } from "@/theme/tokens";
import { Card } from "../ui/Card";
import { ProgressBar } from "../ui/ProgressBar";
import { Ring } from "../ui/Ring";
import { Text } from "../ui/Text";

export const MACROS: { key: "protein" | "carbs" | "fat" | "fiber"; label: string; color: keyof Palette }[] = [
  { key: "protein", label: "Proteína", color: "protein" },
  { key: "carbs", label: "Hidratos", color: "carbs" },
  { key: "fat", label: "Grasas", color: "fat" },
  { key: "fiber", label: "Fibra", color: "fiber" },
];

export function KcalRing({
  eaten,
  target,
  size = 190,
}: {
  eaten: number;
  target: number;
  size?: number;
}) {
  const left = target - eaten;
  const over = left < 0;
  return (
    <Ring value={eaten} max={target} size={size} stroke={size > 160 ? 16 : 12}>
      <View
        style={{ alignItems: "center" }}
        accessible
        accessibilityLabel={
          over
            ? `Has superado el objetivo en ${fmtInt(-left)} kilocalorías`
            : `Te quedan ${fmtInt(left)} kilocalorías de ${fmtInt(target)}`
        }
      >
        <Text
          variant={size > 160 ? "numeralXL" : "display"}
          tabular
          testID="kcal-left"
          numberOfLines={1}
          adjustsFontSizeToFit
          maxFontSizeMultiplier={1.1}
        >
          {fmtInt(Math.abs(left))}
        </Text>
        <Text variant="caption" color={over ? "warning" : "muted"}>
          {over ? "kcal de más" : "kcal restantes"}
        </Text>
      </View>
    </Ring>
  );
}

export function MacroBars({ totals, targets }: { totals: Nutrients; targets: Targets }) {
  return (
    <View style={{ gap: space.md }}>
      {MACROS.map((m) => (
        <View key={m.key} style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
            <Text variant="bodyStrong" color={m.color}>
              {m.label}
            </Text>
            <Text variant="caption" color="muted" tabular>
              <Text variant="bodyStrong" tabular>
                {fmtNum(totals[m.key])}
              </Text>{" "}
              / {targets[m.key]} g
            </Text>
          </View>
          <ProgressBar
            value={totals[m.key]}
            max={targets[m.key]}
            color={m.color}
            label={`${m.label}: ${fmtNum(totals[m.key])} de ${targets[m.key]} gramos`}
          />
        </View>
      ))}
    </View>
  );
}

export function SecondaryLimits({ totals, targets }: { totals: Nutrients; targets: Targets }) {
  const rows = [
    { label: "Azúcares", v: totals.sugars, max: targets.sugarsMax, unit: "g" },
    { label: "Saturadas", v: totals.satFat, max: targets.satFatMax, unit: "g" },
    { label: "Sal", v: totals.salt, max: targets.saltMax, unit: "g" },
  ];
  return (
    <View style={{ flexDirection: "row", gap: space.md }}>
      {rows.map((r) => {
        const over = r.v > r.max;
        return (
          <View key={r.label} style={{ flex: 1, gap: 2 }}>
            <Text variant="caption" color="muted">
              {r.label}
            </Text>
            <Text variant="bodyStrong" color={over ? "warning" : "text"} tabular>
              {fmtNum(r.v)} {r.unit}
            </Text>
            <Text variant="caption" color="faint" tabular>
              máx. {r.max} {r.unit}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Tarjeta resumen del día: anillo de kcal, comido/objetivo y macros. */
export function DaySummary({
  totals,
  targets,
  exerciseKcal,
}: {
  totals: Nutrients;
  targets: Targets;
  exerciseKcal?: number;
}) {
  const { bp } = useBreakpoint();
  const compact = bp === "compact";
  const target = targets.kcal + (exerciseKcal ?? 0);
  return (
    <Card>
      <View style={{ alignItems: "center", gap: space.lg }}>
        <KcalRing eaten={totals.kcal} target={target} size={compact ? 176 : 200} />
        <View style={{ flexDirection: "row", gap: space.xl }}>
          <View style={{ alignItems: "center" }}>
            <Text variant="heading" tabular>
              {fmtInt(totals.kcal)}
            </Text>
            <Text variant="caption" color="muted">
              Comido
            </Text>
          </View>
          <View style={{ alignItems: "center" }}>
            <Text variant="heading" tabular>
              {fmtInt(targets.kcal)}
            </Text>
            <Text variant="caption" color="muted">
              Objetivo
            </Text>
          </View>
          {exerciseKcal ? (
            <View style={{ alignItems: "center" }}>
              <Text variant="heading" color="success" tabular>
                +{fmtInt(exerciseKcal)}
              </Text>
              <Text variant="caption" color="muted">
                Ejercicio
              </Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ height: space.xl }} />
      <MacroBars totals={totals} targets={targets} />
    </Card>
  );
}
