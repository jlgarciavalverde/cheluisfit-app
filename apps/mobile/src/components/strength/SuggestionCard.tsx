import { View } from "react-native";
import { Button, Card, Icon, Text } from "@/components/ui";
import { fmtKg } from "@/domain/format";
import type { Suggestion } from "@/domain/strength";
import { space } from "@/theme/tokens";

function suggestionTitle(s: Suggestion, kind: string): string {
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

export function SuggestionCard({
  suggestion,
  kind,
  hasPendingSets,
  onApply,
}: {
  suggestion: Suggestion;
  kind: string;
  hasPendingSets: boolean;
  onApply: () => void;
}) {
  if (suggestion.action === "none") return null;
  return (
    <Card
      tone="alt"
      testID="suggestion"
      accent={suggestion.action === "increase" ? "success" : suggestion.action === "deload" ? "warning" : undefined}
      style={{ gap: space.xs }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Icon name={ICON[suggestion.action]} size="md" color={suggestion.action === "increase" ? "success" : suggestion.action === "deload" ? "warning" : "brandText"} />
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {suggestionTitle(suggestion, kind)}
        </Text>
        {suggestion.action !== "start" && hasPendingSets ? (
          <Button testID="apply-suggestion" label="Aplicar" size="sm" variant="secondary" onPress={onApply} />
        ) : null}
      </View>
      <Text variant="caption" color="muted">
        {suggestion.reason}
      </Text>
    </Card>
  );
}
