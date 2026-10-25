// Bandeja de avisos de Social (likes, comentarios, seguidores, solicitudes). Como el feed
// (`socialStore.ts`), en memoria y sin `persist`: es del servidor. Sin push: el contador se
// refresca al abrir la app, al volver a primer plano y al entrar en Social (`useNotificationsPolling`).
import { useEffect } from "react";
import { AppState } from "react-native";
import { create } from "zustand";
import { api, type SocialNotification } from "./api";
import { useAuth } from "./authStore";

interface NotificationsState {
  unread: number;
  items: SocialNotification[];
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  refreshUnread: () => Promise<void>;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  markAllRead: () => Promise<void>;
  /** Tras aceptar/rechazar desde la bandeja: la solicitud deja de estar pendiente. */
  resolveRequest: (id: string, accepted: boolean) => void;
  reset: () => void;
}

const EMPTY = { unread: 0, items: [] as SocialNotification[], cursor: null, hasMore: true, loading: false, error: null };

export const useNotifications = create<NotificationsState>()((set, get) => ({
  ...EMPTY,
  refreshUnread: async () => {
    const token = useAuth.getState().token;
    if (!token) return;
    try {
      const { count } = await api.socialUnreadCount(token);
      set({ unread: count });
    } catch {
      // Sin red el contador se queda como estaba: no es para molestar con un aviso.
    }
  },
  refresh: async () => {
    const token = useAuth.getState().token;
    if (!token) return;
    set({ loading: true, error: null });
    try {
      const { notifications, nextCursor } = await api.socialNotifications(token);
      set({ items: notifications, cursor: nextCursor, hasMore: nextCursor !== null, loading: false });
    } catch {
      set({ loading: false, error: "No se pudieron cargar los avisos. Prueba otra vez." });
    }
  },
  loadMore: async () => {
    const token = useAuth.getState().token;
    const { cursor, hasMore, loading } = get();
    if (!token || !cursor || !hasMore || loading) return;
    set({ loading: true });
    try {
      const { notifications, nextCursor } = await api.socialNotifications(token, cursor);
      set((s) => ({ items: [...s.items, ...notifications], cursor: nextCursor, hasMore: nextCursor !== null, loading: false }));
    } catch {
      set({ loading: false, error: "No se pudo cargar más. Prueba otra vez." });
    }
  },
  markAllRead: async () => {
    const token = useAuth.getState().token;
    const newest = get().items[0]?.createdAt;
    if (!token || get().unread === 0) return;
    set((s) => ({ unread: 0, items: s.items.map((n) => ({ ...n, read: true })) }));
    await api.socialMarkRead(token, newest).catch(() => {});
  },
  resolveRequest: (id, accepted) =>
    set((s) => ({ items: s.items.map((n) => (n.id === id ? { ...n, pending: false, kind: accepted ? "follow" : n.kind } : n)) })),
  reset: () => set(EMPTY),
}));

/** Refresca el contador al iniciar sesión y al volver la app a primer plano (sin push). */
export function useNotificationsPolling() {
  const token = useAuth((s) => s.token);
  useEffect(() => {
    if (!token) {
      useNotifications.getState().reset();
      return;
    }
    void useNotifications.getState().refreshUnread();
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") void useNotifications.getState().refreshUnread();
    });
    return () => sub.remove();
  }, [token]);
}
