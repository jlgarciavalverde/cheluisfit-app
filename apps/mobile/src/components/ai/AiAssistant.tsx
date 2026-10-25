import { usePathname } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { FullScreenModal } from "@/components/FullScreenModal";
import { Button, Callout, Chip, ChipRow, Icon, Skeleton, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api, ApiError, type AiProposal } from "@/data/api";
import { FLOAT_GAP, isLiveWorkoutPath, showsWorkoutBar, useBottomChrome, WORKOUT_BAR_SPACE } from "@/components/bottomChrome";
import { useActiveWorkout } from "@/data/activeWorkoutStore";
import { useAiPanel, type ChatMessage } from "@/data/aiPanelStore";
import { useAuth } from "@/data/authStore";
import { useRunning } from "@/data/runningStore";
import { useNutrition, selectTargets } from "@/data/store";
import { useStrength } from "@/data/strengthStore";
import {
  AI_MAX_CHARS,
  budgetContext,
  chatHistory,
  foodFromMealProposal,
  generalContext,
  nutritionContext,
  profileContext,
  runningContext,
  screenTarget,
  sectionForPath,
  strengthContext,
  type AiSection,
} from "@/domain/aiContext";
import { dayLabel, todayKey } from "@/domain/dates";
import { defaultMaxHr } from "@/domain/running";
import { carbsFor, limitsFor } from "@/domain/nutrition";
import { MEAL_LABEL } from "@/domain/types";
import { useBreakpoint, useTheme } from "@/theme/ThemeProvider";
import { elevation, radius, space } from "@/theme/tokens";

const EMPTY: ChatMessage[] = [];

const SECTION_LABEL: Record<AiSection, string> = { nutrition: "Nutrición", running: "Running", strength: "Fuerza", general: "General" };
const GOAL_FIELD_LABEL: Record<"kcal" | "protein" | "carbs" | "fat", string> = { kcal: "kcal", protein: "proteína", carbs: "hidratos", fat: "grasa" };


/** Sugerencias para empezar, según la pantalla. */
function suggestionsFor(section: AiSection, pathname: string): string[] {
  if (pathname.startsWith("/nevera")) return ["¿Qué ceno con lo que tengo?", "Una idea alta en proteína con lo de la nevera", "¿Qué debería comprar para la semana?"];
  if (section === "nutrition") return ["¿Qué tal voy hoy?", "¿Qué ceno para llegar a la proteína?", "¿Cómo ha ido mi semana?"];
  if (section === "running") return ["¿Qué tal mi última carrera?", "¿Qué corro mañana?", "¿Estoy aumentando bien los km?"];
  if (section === "strength") return ["¿Cómo fue mi último entreno?", "¿Qué subo de peso la próxima vez?", "¿Me falta volumen en algún músculo?"];
  return ["¿Cómo va mi semana?", "¿Qué hago hoy?", "Dame un consejo para mejorar"];
}

function screenLine(pathname: string): string | null {
  const t = screenTarget(pathname);
  if (!t) return null;
  if (t.kind === "activity") {
    const a = useRunning.getState().activities.find((x) => x.id === t.id);
    return a ? `Pantalla actual: la sesión «${a.title}» del ${a.date}. Las notas se añadirían a esta.` : null;
  }
  const w = useStrength.getState().workouts.find((x) => x.id === t.id);
  return w ? `Pantalla actual: el entreno «${w.name}» del ${w.date}. Las notas se añadirían a este.` : null;
}

function buildContext(section: AiSection, pathname: string): string {
  const n = useNutrition.getState();
  const r = useRunning.getState();
  const g = useStrength.getState();
  const maxHr = n.profile.maxHr ?? defaultMaxHr(n.profile.age);
  const body =
    section === "nutrition"
      ? nutritionContext(n.profile, selectTargets(n), n.entries, todayKey(), n.fridge)
      : section === "running"
        ? runningContext(r.activities, r.templates, todayKey(), { planned: r.planned, maxHr })
        : section === "strength"
          ? strengthContext(g.workouts)
          : generalContext({ entries: n.entries, targets: selectTargets(n), activities: r.activities, workouts: g.workouts, planned: r.planned, templates: r.templates });
  return budgetContext([profileContext(n.profile, n.weights), screenLine(pathname), body]);
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

/** Aplica una propuesta ya confirmada usando las acciones reales de cada tienda (nunca las toca sin que la persona lo pida). */
function applyProposal(p: AiProposal, section: AiSection, pathname: string): { ok: boolean; message: string } {
  if (p.type === "add_meal_entry") {
    // Una fecha futura o mal formada no tiene sentido para algo que ya se comió: va a hoy.
    const date = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && p.date <= todayKey() ? p.date : todayKey();
    useNutrition.getState().addEntry(foodFromMealProposal(p), p.grams, p.meal, date);
    return { ok: true, message: `${p.name} añadido a ${MEAL_LABEL[p.meal].toLowerCase()}${date !== todayKey() ? ` (${dayLabel(date).toLowerCase()})` : ""}` };
  }
  if (p.type === "add_note") {
    // Primero la sesión que se ve en pantalla; si no hay ninguna, la última de la sección.
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
  // adjust_goal
  if (section !== "nutrition") return { ok: false, message: "Esta propuesta no se puede aplicar aquí" };
  const targets = selectTargets(useNutrition.getState());
  // Cambiar solo las kcal dejaba los macros sumando las kcal de antes: se recalculan los hidratos
  // (proteína y grasa se mantienen) y los límites que dependen de las kcal.
  const next = { ...targets, [p.field]: p.value };
  if (p.field === "kcal") Object.assign(next, { carbs: carbsFor(p.value, targets.protein, targets.fat) }, (({ fiber: _f, ...l }) => l)(limitsFor(p.value)));
  useNutrition.getState().setTargetsOverride(next);
  return { ok: true, message: "Objetivo actualizado (el ajuste automático queda en pausa mientras tengas un objetivo a mano)" };
}

function MessageBubble({
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
}

/** Burbuja flotante visible en cualquier pantalla; abre un panel de chat con el contexto de la sección actual. */
export function AiAssistant() {
  const { c } = useTheme();
  const { isWide } = useBreakpoint();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const token = useAuth((s) => s.token);
  const hasWorkoutBar = useActiveWorkout((s) => !!s.workout) && showsWorkoutBar(pathname);
  const chrome = useBottomChrome((s) => s.height);
  const open = useAiPanel((s) => s.open);
  const pendingPrompt = useAiPanel((s) => s.pendingPrompt);
  const setOpen = (v: boolean) => (v ? useAiPanel.getState().openPanel() : useAiPanel.getState().closePanel());
  const section = sectionForPath(pathname);
  const messages = useAiPanel((s) => s.conversations[section]) ?? EMPTY;
  const setMessages = (update: (cur: ChatMessage[]) => ChatMessage[]) => useAiPanel.getState().setMessages(section, update);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Otra pantalla abrió el panel con una pregunta ya escrita (p. ej. «¿Qué cocino?» de la Nevera).
  useEffect(() => {
    if (!open || !pendingPrompt || sending || !token) return;
    const prompt = useAiPanel.getState().takePrompt();
    if (prompt) void send(prompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pendingPrompt]);

  // En el entreno en curso tapaba el círculo de «hecho» de las series (visto en el móvil).
  if (!token || (isLiveWorkoutPath(pathname) && !open)) return null;

  const resolveProposal = (msgIndex: number, propIndex: number, resolved: "applied" | "discarded") => {
    setMessages((cur) =>
      cur.map((m, i) => (i !== msgIndex || !m.proposals ? m : { ...m, proposals: m.proposals.map((p, j) => (j === propIndex ? { ...p, resolved } : p)) })),
    );
  };

  async function ask(history: ChatMessage[]) {
    if (!token) return;
    setSending(true);
    try {
      const res = await api.aiChat(token, section, chatHistory(history), buildContext(section, pathname));
      setMessages((cur) => [...cur, { role: "assistant", content: res.reply, proposals: res.proposals }]);
    } catch (e) {
      // El servidor ya manda un mensaje claro (503 sin claves, 429 límite por hora…); los fallos
      // de red también llegan como `ApiError(0)` con su propio texto (ver `api.ts`).
      const content = e instanceof ApiError ? e.message : "No he podido responder. Prueba otra vez en un rato.";
      setMessages((cur) => [...cur, { role: "assistant", content, local: true, retry: true }]);
    } finally {
      setSending(false);
    }
  }

  async function send(forced?: string) {
    const text = (forced ?? input).trim();
    if (!text || sending || !token) return;
    if (!forced) setInput("");
    const withUser: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(() => withUser);
    await ask(withUser);
  }

  /** Quita el error y vuelve a mandar la conversación tal cual (el último mensaje es de la persona). */
  function retry() {
    if (sending) return;
    const clean = messages.filter((m) => !m.local);
    setMessages(() => clean);
    void ask(clean);
  }

  return (
    <>
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: isWide ? space.xl : undefined,
          right: isWide ? undefined : space.md,
          bottom: isWide ? space.xl : insets.bottom + chrome + FLOAT_GAP + (hasWorkoutBar ? WORKOUT_BAR_SPACE : 0),
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
          {messages.length > 0 ? (
            <View style={{ alignItems: "flex-end" }}>
              <Button testID="ai-new-conversation" label="Nueva conversación" icon="add" size="sm" variant="ghost" disabled={sending} onPress={() => useAiPanel.getState().resetConversation(section)} />
            </View>
          ) : null}
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            renderItem={({ item, index }) => (
              <MessageBubble
                message={item}
                section={section}
                pathname={pathname}
                onResolve={(propIndex, resolved) => resolveProposal(index, propIndex, resolved)}
                onRetry={retry}
              />
            )}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
            contentContainerStyle={{ gap: space.md, paddingVertical: space.md, flexGrow: 1 }}
            style={{ flex: 1 }}
            ListFooterComponent={
              sending ? (
                <View testID="ai-typing" accessible accessibilityLabel="El asistente está escribiendo" style={{ gap: space.xs, width: "70%" }}>
                  <Skeleton style={{ height: 14 }} />
                  <Skeleton style={{ height: 14, width: "60%" }} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              <View style={{ gap: space.md }}>
                <Text variant="body" color="muted">
                  Pregúntame sobre {section === "nutrition" ? "tu alimentación" : section === "running" ? "tus carreras" : section === "strength" ? "tus entrenos" : "CheluisFIT"}: qué tal vas, o qué te recomiendo. Veo tus datos de la app, no los invento.
                </Text>
                <ChipRow wrap>
                  {suggestionsFor(section, pathname).map((q) => (
                    <Chip key={q} label={q} icon="chatbubble-ellipses-outline" onPress={() => void send(q)} />
                  ))}
                </ChipRow>
              </View>
            }
          />
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end", paddingBottom: space.md }}>
            <TextField testID="ai-input" label="Mensaje" value={input} onChangeText={setInput} placeholder="Escribe aquí…" multiline maxLength={AI_MAX_CHARS} style={{ flex: 1 }} />
            <Button testID="ai-send" label="Enviar" onPress={() => send()} loading={sending} disabled={!input.trim()} />
          </View>
        </KeyboardAvoidingView>
      </FullScreenModal>
    </>
  );
}

