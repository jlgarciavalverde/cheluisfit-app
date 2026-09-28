import { router } from "expo-router";
import { useEffect } from "react";
import { FlatList, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { PostCard } from "@/components/social/PostCard";
import { EmptyState, IconButton } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { useSocial } from "@/data/socialStore";
import { space } from "@/theme/tokens";

export default function SocialScreen() {
  const token = useAuth((s) => s.token);
  const { posts, loading, hasMore, error, refresh, loadMore, updatePost } = useSocial();

  useEffect(() => {
    if (token) refresh(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) {
    return (
      <Screen variant="tab" testID="screen-social">
        <ScreenHeader title="Social" />
        <EmptyState
          icon="people-outline"
          title="Inicia sesión para ver el feed"
          text="Sigue a tu familia y amigos, comparte tus carreras y entrenos."
          actionLabel="Iniciar sesión"
          onAction={() => router.push("/cuenta")}
        />
      </Screen>
    );
  }

  const toggleLike = async (post: (typeof posts)[number]) => {
    updatePost(post.id, { likedByMe: !post.likedByMe, likesCount: post.likesCount + (post.likedByMe ? -1 : 1) });
    try {
      await (post.likedByMe ? api.socialUnlike(token, post.id) : api.socialLike(token, post.id));
    } catch {
      updatePost(post.id, { likedByMe: post.likedByMe, likesCount: post.likesCount }); // deshace el optimista si falla
      toast("No se pudo dar «me gusta». Prueba otra vez.");
    }
  };

  return (
    <Screen variant="tab" testID="screen-social" scroll={false}>
      <ScreenHeader
        title="Social"
        right={
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <IconButton icon="search-outline" label="Buscar personas" onPress={() => router.push("/social/buscar")} filled />
            <IconButton icon="add-circle-outline" label="Publicar" onPress={() => router.push("/social/publicar")} filled />
          </View>
        }
      />
      <FlatList
        style={{ flex: 1 }}
        data={posts}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            onOpenAuthor={() => router.push({ pathname: "/social/perfil/[username]", params: { username: item.author.username } })}
            onOpenPost={() => router.push({ pathname: "/social/post/[id]", params: { id: item.id } })}
            onToggleLike={() => toggleLike(item)}
          />
        )}
        contentContainerStyle={{ gap: space.md, paddingVertical: space.md, flexGrow: 1 }}
        refreshing={loading && posts.length > 0}
        onRefresh={() => refresh(token)}
        onEndReachedThreshold={0.4}
        onEndReached={() => hasMore && loadMore(token)}
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon={error ? "cloud-offline-outline" : "people-outline"}
              title={error ?? "Nadie ha publicado todavía"}
              text={error ? undefined : "Publica tu próxima carrera o entreno, o invita a más gente al hogar."}
            />
          )
        }
      />
    </Screen>
  );
}
