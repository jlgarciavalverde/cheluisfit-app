import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Avatar } from "@/components/social/Avatar";
import { PostCard } from "@/components/social/PostCard";
import { Button, ConfirmSheet, EmptyState, IconButton, Skeleton, Text, TextField } from "@/components/ui";
import { SignedOutScreen } from "@/components/social/ScreenStates";
import { toast } from "@/components/ui/Toast";
import { api, ApiError, type Post, type SocialComment } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { useSocial } from "@/data/socialStore";
import { fmtRelativeTime } from "@/domain/format";
import { radius, space } from "@/theme/tokens";

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const token = useAuth((s) => s.token);
  const me = useAuth((s) => s.user);
  const { updatePost, removePost } = useSocial();

  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<SocialComment[] | null>(null);
  const [text, setText] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState<{ kind: "post" } | { kind: "comment"; id: string } | null>(null);

  const load = async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const [p, c] = await Promise.all([api.socialPost(token, id), api.socialComments(token, id)]);
      setPost(p);
      setComments(c);
    } catch {
      setLoadError("No se pudo cargar esta publicación.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token]);

  if (!token) return <SignedOutScreen title="Publicación" />;

  const toggleLike = async () => {
    if (!post) return;
    const next = { likedByMe: !post.likedByMe, likesCount: post.likesCount + (post.likedByMe ? -1 : 1) };
    setPost({ ...post, ...next });
    updatePost(post.id, next);
    try {
      await (post.likedByMe ? api.socialUnlike(token, post.id) : api.socialLike(token, post.id));
    } catch {
      setPost(post);
      updatePost(post.id, { likedByMe: post.likedByMe, likesCount: post.likesCount });
      toast("No se pudo dar «me gusta». Prueba otra vez.");
    }
  };

  const send = async () => {
    if (!post || !text.trim()) return;
    setSending(true);
    try {
      const { id: commentId } = await api.socialAddComment(token, post.id, text.trim());
      setComments((c) => [...(c ?? []), { id: commentId, text: text.trim(), createdAt: Date.now(), author: { id: me!.id, name: me!.name, username: "" } }]);
      updatePost(post.id, { commentsCount: post.commentsCount + 1 });
      setPost((p) => (p ? { ...p, commentsCount: p.commentsCount + 1 } : p));
      setText("");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo enviar el comentario");
    } finally {
      setSending(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await api.socialDeleteComment(token, commentId);
      setComments((c) => c?.filter((x) => x.id !== commentId) ?? null);
      if (post) {
        updatePost(post.id, { commentsCount: Math.max(0, post.commentsCount - 1) });
        setPost({ ...post, commentsCount: Math.max(0, post.commentsCount - 1) });
      }
    } catch {
      toast("No se pudo borrar el comentario");
    }
  };

  const deletePost = async () => {
    if (!post) return;
    try {
      await api.socialDeletePost(token, post.id);
      removePost(post.id);
      toast("Publicación eliminada");
      router.back();
    } catch {
      toast("No se pudo eliminar la publicación");
    }
  };

  return (
    <Screen
      testID="screen-post-detalle"
      scroll={false}
      footer={
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
          <TextField testID="comment-input" label="Comentar" value={text} onChangeText={setText} placeholder="Escribe un comentario…" style={{ flex: 1 }} />
          <Button testID="comment-send" label="Enviar" onPress={send} loading={sending} disabled={!text.trim()} />
        </View>
      }
    >
      <ScreenHeader
        title="Publicación"
        back
        right={
          post && post.author.id === me?.id ? <IconButton icon="trash-outline" label="Eliminar publicación" color="danger" onPress={() => setConfirm({ kind: "post" })} /> : undefined
        }
      />
      {loadError ? (
        <EmptyState icon="cloud-offline-outline" title={loadError} actionLabel="Reintentar" onAction={load} />
      ) : !post ? (
        <View style={{ gap: space.md, paddingVertical: space.md }} accessibilityLabel="Cargando" accessibilityRole="progressbar">
          <Skeleton style={{ height: 220, borderRadius: radius.lg }} />
          <Skeleton style={{ height: 48, borderRadius: radius.md }} />
        </View>
      ) : (
        <FlatList
          style={{ flex: 1 }}
          data={comments ?? []}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={<PostCard post={post} onOpenAuthor={() => router.push({ pathname: "/social/perfil/[username]", params: { username: post.author.username } })} onOpenPost={() => {}} onToggleLike={toggleLike} />}
          ListHeaderComponentStyle={{ marginBottom: space.md }}
          renderItem={({ item }) => (
            <View style={{ flexDirection: "row", gap: space.sm, paddingVertical: space.sm, alignItems: "flex-start" }} testID={`comment-${item.id}`}>
              <Avatar name={item.author.name} url={item.author.avatarUrl} size="sm" />
              <View style={{ flex: 1 }}>
                <Text variant="caption" color="muted">
                  {item.author.name} · {fmtRelativeTime(item.createdAt)}
                </Text>
                <Text variant="body">{item.text}</Text>
              </View>
              {item.author.id === me?.id || post.author.id === me?.id ? (
                <IconButton icon="close" label="Borrar comentario" size="sm" onPress={() => setConfirm({ kind: "comment", id: item.id })} />
              ) : null}
            </View>
          )}
          contentContainerStyle={{ paddingVertical: space.md }}
          ListEmptyComponent={
            <Text variant="body" color="muted" style={{ paddingVertical: space.md }}>
              Sin comentarios todavía.
            </Text>
          }
        />
      )}
      <ConfirmSheet
        testID="confirm-delete"
        visible={confirm !== null}
        title={confirm?.kind === "post" ? "¿Eliminar la publicación?" : "¿Borrar el comentario?"}
        message={confirm?.kind === "post" ? "Desaparece para todo el mundo, con sus comentarios y «me gusta». No se puede deshacer." : "Desaparece para todo el mundo. No se puede deshacer."}
        confirmLabel={confirm?.kind === "post" ? "Eliminar publicación" : "Borrar comentario"}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          if (confirm?.kind === "post") deletePost();
          else if (confirm?.kind === "comment") deleteComment(confirm.id);
        }}
      />
    </Screen>
  );
}
