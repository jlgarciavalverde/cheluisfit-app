// Estado del panel del asistente de IA (sin `persist`: es de la sesión de uso, como antes la
// conversación). Guarda una conversación por sección, para que cerrar el panel o cambiar de
// pantalla no la borre, y permite abrirlo desde fuera con una pregunta ya escrita — «¿Qué
// cocino?» de la Nevera — que `AiAssistant.tsx` envía sola al abrirse.
import { create } from "zustand";
import type { AiProposal } from "./api";
import type { AiSection } from "@/domain/aiContext";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Mensaje de la propia app (error), no del modelo: no se reenvía como historial. */
  local?: boolean;
  /** En un error: se puede reintentar el último mensaje de la persona. */
  retry?: boolean;
  proposals?: (AiProposal & { resolved?: "applied" | "discarded" })[];
}

interface AiPanelState {
  open: boolean;
  /** Pregunta que se enviará sola en cuanto el panel la recoja (`takePrompt`). */
  pendingPrompt: string | null;
  conversations: Partial<Record<AiSection, ChatMessage[]>>;
  openPanel: (prompt?: string) => void;
  closePanel: () => void;
  takePrompt: () => string | null;
  setMessages: (section: AiSection, update: (cur: ChatMessage[]) => ChatMessage[]) => void;
  resetConversation: (section: AiSection) => void;
}

export const useAiPanel = create<AiPanelState>()((set, get) => ({
  open: false,
  pendingPrompt: null,
  conversations: {},
  openPanel: (prompt) => set({ open: true, pendingPrompt: prompt ?? null }),
  closePanel: () => set({ open: false }),
  takePrompt: () => {
    const p = get().pendingPrompt;
    if (p) set({ pendingPrompt: null });
    return p;
  },
  setMessages: (section, update) => set((s) => ({ conversations: { ...s.conversations, [section]: update(s.conversations[section] ?? []) } })),
  resetConversation: (section) => set((s) => ({ conversations: { ...s.conversations, [section]: [] } })),
}));
