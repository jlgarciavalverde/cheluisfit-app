// Tienda del feed social: no va al blob de sync (es un feed paginado del servidor, no un dato
// propio que haya que llevar offline) — en memoria, sin `persist`. Las acciones (dar like,
// comentar, publicar) actualizan el post en caché tras la llamada, sin refetch completo.
import { create } from "zustand";
import { api, type Post } from "./api";

interface SocialState {
  posts: Post[];
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  error: string | null;

  refresh: (token: string) => Promise<void>;
  loadMore: (token: string) => Promise<void>;
  applyPost: (post: Post) => void;
  removePost: (postId: string) => void;
  updatePost: (postId: string, patch: Partial<Pick<Post, "likesCount" | "likedByMe" | "commentsCount">>) => void;
}

export const useSocial = create<SocialState>()((set, get) => ({
  posts: [],
  cursor: null,
  hasMore: true,
  loading: false,
  error: null,

  refresh: async (token) => {
    set({ loading: true, error: null });
    try {
      const { posts, nextCursor } = await api.socialFeed(token);
      set({ posts, cursor: nextCursor, hasMore: nextCursor !== null, loading: false });
    } catch {
      set({ loading: false, error: "No se pudo cargar el feed. Prueba otra vez." });
    }
  },

  loadMore: async (token) => {
    const { cursor, hasMore, loading } = get();
    if (!hasMore || loading || !cursor) return;
    set({ loading: true });
    try {
      const { posts, nextCursor } = await api.socialFeed(token, cursor);
      set((s) => ({ posts: [...s.posts, ...posts], cursor: nextCursor, hasMore: nextCursor !== null, loading: false }));
    } catch {
      set({ loading: false, error: "No se pudo cargar más. Prueba otra vez." });
    }
  },

  applyPost: (post) => set((s) => ({ posts: [post, ...s.posts] })),
  removePost: (postId) => set((s) => ({ posts: s.posts.filter((p) => p.id !== postId) })),
  updatePost: (postId, patch) => set((s) => ({ posts: s.posts.map((p) => (p.id === postId ? { ...p, ...patch } : p)) })),
}));
