// Estado del panel del asistente de IA. Desde la 0.22 las conversaciones persisten en local
// (`cf_ai_panel_v1`, sin sync con el servidor). `open` y `pendingPrompt` no se guardan: al abrir
// la app el panel sigue cerrado. Permite abrirlo desde fuera con una pregunta ya escrita — «¿Qué
// cocino?» de la Nevera — que `AiAssistant.tsx` envía sola al abrirse.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AiProposal } from "./api";
import { guardedJSONStorage, guardRehydrate } from "./persistSafety";
import type { AiSection } from "@/domain/aiContext";

const MAX_MESSAGES_PER_SECTION = 40;

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  /** Mensaje de la propia app (error), no del modelo: no se reenvía como historial. */
  local?: boolean;
  /** En un error: se puede reintentar el último mensaje de la persona. */
  retry?: boolean;
  proposals?: (AiProposal & { resolved?: "applied" | "discarded" })[];
}

function capMessages(msgs: ChatMessage[]): ChatMessage[] {
  return msgs.length <= MAX_MESSAGES_PER_SECTION ? msgs : msgs.slice(-MAX_MESSAGES_PER_SECTION);
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

export const useAiPanel = create<AiPanelState>()(
  persist(
    (set, get) => ({
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
      setMessages: (section, update) =>
        set((s) => ({ conversations: { ...s.conversations, [section]: capMessages(update(s.conversations[section] ?? [])) } })),
      resetConversation: (section) => set((s) => ({ conversations: { ...s.conversations, [section]: [] } })),
    }),
    {
      name: "cf_ai_panel_v1",
      version: 1,
      storage: guardedJSONStorage(),
      onRehydrateStorage: guardRehydrate("cf_ai_panel_v1"),
      partialize: (s) => ({ conversations: s.conversations }),
    },
  ),
);
