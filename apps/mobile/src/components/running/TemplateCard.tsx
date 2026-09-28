import { View } from "react-native";
import { fmtKm } from "@/domain/format";
import {
  describeDuration,
  describeTarget,
  estimateTemplate,
  type Repeat,
  type Step,
  STEP_LABEL,
  type Template,
  TEMPLATE_KIND_LABEL,
} from "@/domain/running";
import { space } from "@/theme/tokens";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { Text } from "../ui/Text";

const short: Record<Step["kind"], string> = {
  warmup: "Calentar",
  work: "Trabajo",
  recovery: "Recup.",
  cooldown: "Enfriar",
  free: "Libre",
};

function stepShort(s: Step): string {
  const t = describeTarget(s.target);
  return `${short[s.kind]} ${describeDuration(s.duration)}${t ? ` (${t})` : ""}`;
}

function repeatShort(r: Repeat): string {
  return `${r.times} × [${r.steps.map((s) => `${short[s.kind]} ${describeDuration(s.duration)}`).join(" + ")}]`;
}

export function structureLines(t: Template): string[] {
  return t.items.map((it) => (it.type === "step" ? stepShort(it) : repeatShort(it)));
}

export function formatMinutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : `${m} min`;
}

export function TemplateCard({
  template,
  onPlan,
  onEdit,
  onDuplicate,
}: {
  template: Template;
  onPlan: () => void;
  onEdit: () => void;
  onDuplicate?: () => void;
}) {
  const est = estimateTemplate(template);
  return (
    <Card testID={`template-${template.id}`} style={{ gap: space.md }}>
      <View style={{ gap: space.xs }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
          <Text variant="heading" style={{ flex: 1 }} numberOfLines={2}>
            {template.name}
          </Text>
          <Badge label={TEMPLATE_KIND_LABEL[template.kind]} tone="brand" />
        </View>
        <Text variant="caption" color="muted" tabular>
          {est.meters > 0 ? `≈ ${fmtKm(est.meters)} km · ${formatMinutes(est.seconds)}` : "Sin distancia definida"}
          {est.hasOpen ? " · con pasos abiertos" : ""}
        </Text>
      </View>
      <View style={{ gap: 2 }}>
        {structureLines(template).map((l, i) => (
          <Text key={`${l}-${i}`} variant="body" color="muted">
            {l}
          </Text>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
        <Button testID={`plan-${template.id}`} label="Planificar" icon="calendar-outline" size="sm" onPress={onPlan} />
        <Button testID={`edit-${template.id}`} label="Editar" icon="create-outline" variant="secondary" size="sm" onPress={onEdit} />
        {onDuplicate ? (
          <Button testID={`dup-${template.id}`} label="Duplicar" icon="copy-outline" variant="ghost" size="sm" onPress={onDuplicate} />
        ) : null}
      </View>
    </Card>
  );
}

export { STEP_LABEL };
