import { memo } from "react";
import { View } from "react-native";
import { Button, Callout, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import type { AiProposal } from "@/data/api";
import type { ChatMessage } from "@/data/aiPanelStore";
import { useRunning } from "@/data/runningStore";
import { useNutrition, selectTargets } from "@/data/store";
import { useStrength } from "@/data/strengthStore";
import { foodFromMealProposal, screenTarget, type AiSection } from "@/domain/aiContext";
import { dayLabel, todayKey } from "@/domain/dates";
import { carbsFor, limitsFor } from "@/domain/nutrition";
import { MEAL_LABEL } from "@/domain/types";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

const GOAL_FIELD_LABEL: Record<"kcal" | "protein" | "carbs" | "fat", string> = { kcal: "kcal", protein: "proteína", carbs: "hidratos", fat: "grasa" };

function ProposalBody({ p }: { p: AiProposal }) {
  if (p.type === "add_meal_entry") {
    const macros = [
      p.protein > 0 ? `P ${p.protein} g` : null,
      p.carbs > 0 ? `H ${p.carbs} g` : null,
      p.fat > 0 ? `G ${p.fat} g` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    return (
      <View style={{ gap: 2 }}>
        <Text variant="bodyStrong">
          «{p.name}» · {p.grams} g
        </Text>
        <Text variant="caption" color="muted">
          Se añadirá a {MEAL_LABEL[p.meal].toLowerCase()} de {p.date && p.date !== todayKey() ? dayLabel(p.date).toLowerCase() : "hoy"}
        </Text>
        <Text variant="caption" tabular>
          {p.kcal} kcal{macros ? ` · ${macros}` : ""}
        </Text>
      </View>
    );
  }
  if (p.type === "add_note") return <Text variant="body">Añadir una nota: «{p.note}»</Text>;
  return (
    <Text variant="body">
      Cambiar el objetivo de {GOAL_FIELD_LABEL[p.field]} a {p.value}.
    </Text>
  );
}

function applyProposal(p: AiProposal, section: AiSection, pathname: string): { ok: boolean; message: string } {
  if (p.type === "add_meal_entry") {
    const date = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.date <= todayKey() ? p.date : todayKey();
    useNutrition.getState().addEntry(foodFromMealProposal(p), p.grams, p.meal, date);
    return { ok: true, message: `${p.name} añadido a ${MEAL_LABEL[p.meal].toLowerCase()}${date !== todayKey() ? ` (${dayLabel(date).toLowerCase()})` : ""}` };
  }
  if (p.type === "add_note") {
    const target = screenTarget(pathname);
    if (target?.kind === "activity") {
      const a = useRunning.getState().activities.find((x) => x.id === target.id);
      if (a) {
        useRunning.getState().updateActivity(a.id, { notes: a.notes ? `${a.notes}\n${p.note}` : p.note });
        return { ok: true, message: "Nota añadida a esta sesión" };
      }
    }
    if (target?.kind === "workout") {
      const w = useStrength.getState().workouts.find((x) => x.id === target.id);
      if (w) {
        useStrength.getState().updateWorkout({ ...w, notes: w.notes ? `${w.notes}\n${p.note}` : p.note });
        return { ok: true, message: "Nota añadida a este entreno" };
      }
    }
    if (section === "running") {
      const activities = useRunning.getState().activities;
      const last = [...activities].sort((a, b) => b.date.localeCompare(a.date))[0];
      if (!last) return { ok: false, message: "No hay ninguna carrera todavía" };
      useRunning.getState().updateActivity(last.id, { notes: last.notes ? `${last.notes}\n${p.note}` : p.note });
      return { ok: true, message: "Nota añadida" };
    }
    if (section === "strength") {
      const workouts = useStrength.getState().workouts;
      const last = [...workouts].sort((a, b) => b.date.localeCompare(a.date))[0];
      if (!last) return { ok: false, message: "No hay ningún entreno todavía" };
      useStrength.getState().updateWorkout({ ...last, notes: last.notes ? `${last.notes}\n${p.note}` : p.note });
      return { ok: true, message: "Nota añadida" };
    }
    return { ok: false, message: "Esta propuesta no se puede aplicar aquí" };
  }
  if (section !== "nutrition") return { ok: false, message: "Esta propuesta no se puede aplicar aquí" };
  const targets = selectTargets(useNutrition.getState());
  const next = { ...targets, [p.field]: p.value };
  if (p.field === "kcal") Object.assign(next, { carbs: carbsFor(p.value, targets.protein, targets.fat) }, (({ fiber: _f, ...l }) => l)(limitsFor(p.value)));
  useNutrition.getState().setTargetsOverride(next);
  return { ok: true, message: "Objetivo actualizado (el ajuste automático queda en pausa mientras tengas un objetivo a mano)" };
}

export const MessageBubble = memo(function MessageBubble({
  message,
  section,
  pathname,
  onResolve,
  onRetry,
}: {
  message: ChatMessage;
  section: AiSection;
  pathname: string;
  onResolve: (proposalIndex: number, resolved: "applied" | "discarded") => void;
  onRetry: () => void;
}) {
  const { c } = useTheme();
  const mine = message.role === "user";
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start", gap: space.sm }}>
      {message.local ? (
        <Callout tone="danger" icon="alert-circle-outline" dense action={message.retry ? <Button label="Reintentar" size="sm" variant="secondary" onPress={onRetry} /> : undefined}>
          {message.content}
        </Callout>
      ) : message.content ? (
        <View style={{ maxWidth: "85%", paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.lg, backgroundColor: mine ? c.brand : c.surfaceAlt }}>
          <Text variant="body" color={mine ? "onBrand" : "text"} selectable>
            {message.content}
          </Text>
        </View>
      ) : null}
      {message.proposals?.map((p, i) => (
        <Callout
          key={i}
          tone={p.resolved === "applied" ? "success" : p.resolved === "discarded" ? "neutral" : "brand"}
          icon="sparkles-outline"
          dense
          action={
            p.resolved ? undefined : (
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <Button
                  label="Aplicar"
                  size="sm"
                  variant="secondary"
                  onPress={() => {
                    const r = applyProposal(p, section, pathname);
                    toast(r.message);
                    onResolve(i, r.ok ? "applied" : "discarded");
                  }}
                />
                <Button label="Descartar" size="sm" variant="ghost" onPress={() => onResolve(i, "discarded")} />
              </View>
            )
          }
        >
          <ProposalBody p={p} />
          {p.resolved === "applied" ? (
            <Text variant="caption" color="success">
              ✓ Aplicado
            </Text>
          ) : p.resolved === "discarded" ? (
            <Text variant="caption" color="faint">
              Descartado — no se cambió nada
            </Text>
          ) : null}
        </Callout>
      ))}
    </View>
  );
});
