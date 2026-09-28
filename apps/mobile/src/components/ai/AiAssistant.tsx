import { usePathname } from "expo-router";
import { useState } from "react";
import { FlatList, KeyboardAvoidingView, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullScreenModal } from "@/components/FullScreenModal";
import { Button, Callout, Icon, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api, ApiError, type AiProposal } from "@/data/api";
import { useActiveWorkout } from "@/data/activeWorkoutStore";
import { useAuth } from "@/data/authStore";
import { useRunning } from "@/data/runningStore";
import { useNutrition, selectTargets } from "@/data/store";
import { useStrength } from "@/data/strengthStore";
import { AI_MAX_CHARS, chatHistory, foodFromMealProposal, nutritionContext, runningContext, sectionForPath, strengthContext, type AiSection } from "@/domain/aiContext";
import { todayKey } from "@/domain/dates";
import { MEAL_LABEL } from "@/domain/types";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { elevation, radius, space } from "@/theme/tokens";

const SECTION_LABEL: Record<AiSection, string> = { nutrition: "Nutrición", running: "Running", strength: "Fuerza", general: "General" };
const GOAL_FIELD_LABEL: Record<"kcal" | "protein" | "carbs" | "fat", string> = { kcal: "kcal", protein: "proteína", carbs: "hidratos", fat: "grasa" };

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Mensaje de la propia app (error), no del modelo: no se reenvía como historial. */
  local?: boolean;
  proposals?: (AiProposal & { resolved?: "applied" | "discarded" })[];
}

function buildContext(section: AiSection): string {
  if (section === "nutrition") {
    const s = useNutrition.getState();
    return nutritionContext(s.profile, selectTargets(s), s.entries, todayKey(), s.fridge);
  }
  if (section === "running") {
    const s = useRunning.getState();
    return runningContext(s.activities, s.templates);
  }
  if (section === "strength") return strengthContext(useStrength.getState().workouts);
  return "Sin datos específicos de esta sección.";
}

/** Cuerpo de la tarjeta de confirmación: el «preliminar» de lo que se va a cambiar, antes de tocar nada. */
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
          Se añadirá a {MEAL_LABEL[p.meal].toLowerCase()} de hoy
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

/** Aplica una propuesta ya confirmada usando las acciones reales de cada tienda (nunca las toca sin que la persona lo pida). */
function applyProposal(p: AiProposal, section: AiSection): { ok: boolean; message: string } {
  if (p.type === "add_meal_entry") {
    useNutrition.getState().addEntry(foodFromMealProposal(p), p.grams, p.meal, todayKey());
    return { ok: true, message: `${p.name} añadido a ${MEAL_LABEL[p.meal].toLowerCase()}` };
  }
  if (p.type === "add_note") {
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
  // adjust_goal
  if (section !== "nutrition") return { ok: false, message: "Esta propuesta no se puede aplicar aquí" };
  const targets = selectTargets(useNutrition.getState());
  useNutrition.getState().setTargetsOverride({ ...targets, [p.field]: p.value });
  return { ok: true, message: "Objetivo actualizado" };
}

function MessageBubble({ message, section, onResolve }: { message: ChatMessage; section: AiSection; onResolve: (proposalIndex: number, resolved: "applied" | "discarded") => void }) {
  const { c } = useTheme();
  const mine = message.role === "user";
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start", gap: space.sm }}>
      {message.content ? (
        <View style={{ maxWidth: "85%", paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.lg, backgroundColor: mine ? c.brand : c.surfaceAlt }}>
          <Text variant="body" color={mine ? "onBrand" : "text"}>
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
                    const r = applyProposal(p, section);
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
}

/** Burbuja flotante visible en cualquier pantalla; abre un panel de chat con el contexto de la sección actual. */
export function AiAssistant() {
  const { c } = useTheme();
  const { isWide } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const token = useAuth((s) => s.token);
  const hasWorkoutBar = useActiveWorkout((s) => !!s.workout) && !pathname.startsWith("/entreno/");
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const section = sectionForPath(pathname);

  if (!token) return null;

  const resolveProposal = (msgIndex: number, propIndex: number, resolved: "applied" | "discarded") => {
    setMessages((cur) =>
      cur.map((m, i) => (i !== msgIndex || !m.proposals ? m : { ...m, proposals: m.proposals.map((p, j) => (j === propIndex ? { ...p, resolved } : p)) })),
    );
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const withUser: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(withUser);
    setSending(true);
    try {
      const res = await api.aiChat(token, section, chatHistory(withUser), buildContext(section));
      setMessages((cur) => [...cur, { role: "assistant", content: res.reply, proposals: res.proposals }]);
    } catch (e) {
      // El servidor ya manda un mensaje claro (503 sin claves, 429 límite por hora…); los fallos
      // de red también llegan como `ApiError(0)` con su propio texto (ver `api.ts`).
      const content = e instanceof ApiError ? e.message : "No he podido responder. Prueba otra vez en un rato.";
      setMessages((cur) => [...cur, { role: "assistant", content, local: true }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: isWide ? space.xl : undefined,
          right: isWide ? undefined : space.md,
          bottom: isWide ? space.xl : insets.bottom + 68 + (hasWorkoutBar ? 68 : 0),
        }}
      >
        <Pressable
          testID="ai-assistant-bubble"
          accessibilityRole="button"
          accessibilityLabel="Asistente de IA"
          onPress={() => setOpen(true)}
          style={({ pressed }) => ({
            width: 56,
            height: 56,
            borderRadius: radius.pill,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.brand,
            opacity: pressed ? 0.9 : 1,
            ...elevation.floating,
          })}
        >
          <Icon name="sparkles-outline" size="lg" color="onBrand" />
        </Pressable>
      </View>

      <FullScreenModal visible={open} onClose={() => setOpen(false)} title="Asistente" subtitle={SECTION_LABEL[section]} testID="ai-assistant-panel">
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1, gap: space.md }}>
          <FlatList
            data={messages}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item, index }) => (
              <MessageBubble message={item} section={section} onResolve={(propIndex, resolved) => resolveProposal(index, propIndex, resolved)} />
            )}
            contentContainerStyle={{ gap: space.md, paddingVertical: space.md, flexGrow: 1 }}
            style={{ flex: 1 }}
            ListEmptyComponent={
              <Text variant="body" color="muted">
                Pregúntame sobre {section === "nutrition" ? "tu alimentación" : section === "running" ? "tus carreras" : section === "strength" ? "tus entrenos" : "CheluisFIT"}: qué tal vas, o qué te recomiendo.
              </Text>
            }
          />
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end", paddingBottom: space.md }}>
            <TextField testID="ai-input" label="Mensaje" value={input} onChangeText={setInput} placeholder="Escribe aquí…" multiline maxLength={AI_MAX_CHARS} style={{ flex: 1 }} />
            <Button testID="ai-send" label="Enviar" onPress={send} loading={sending} disabled={!input.trim()} />
          </View>
        </KeyboardAvoidingView>
      </FullScreenModal>
    </>
  );
}

