import { router, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { PostCard } from "@/components/social/PostCard";
import { Button, Callout, EmptyState, Icon, IconButton, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { useNotifications } from "@/data/notificationsStore";
import { useSocial } from "@/data/socialStore";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space, touch } from "@/theme/tokens";

/** Campana de avisos con el número de nuevos encima. */
function BellButton() {
  const { c } = useTheme();
  const unread = useNotifications((s) => s.unread);
  return (
    <Pressable
      testID="open-notifications"
      accessibilityRole="button"
      accessibilityLabel={unread > 0 ? `Avisos, ${unread} ${unread === 1 ? "nuevo" : "nuevos"}` : "Avisos"}
      onPress={() => router.push("/social/avisos")}
      style={({ pressed }) => ({
        width: touch.min,
        height: touch.min,
        borderRadius: radius.pill,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: c.surfaceAlt,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      <Icon name={unread > 0 ? "notifications" : "notifications-outline"} size="md" color="text" />
      {unread > 0 ? (
        <View
          testID="notifications-badge"
          pointerEvents="none"
          style={{ position: "absolute", top: 2, right: 0, minWidth: 20, paddingHorizontal: space.xs, borderRadius: radius.sm, backgroundColor: c.danger, alignItems: "center" }}
        >
          <Text variant="tiny" color="onBrand" maxFontSizeMultiplier={1}>
            {unread > 99 ? "99+" : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export default function SocialScreen() {
  const token = useAuth((s) => s.token);
  const { posts, loading, hasMore, error, refresh, loadMore, updatePost } = useSocial();

  // Al entrar en la pestaña (no solo al iniciar sesión): lo nuevo de los demás y el contador.
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      void refresh(token);
      void useNotifications.getState().refreshUnread();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]),
  );

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

  const openMyProfile = async () => {
    try {
      const { username } = await api.socialMyProfile(token);
      router.push({ pathname: "/social/perfil/[username]", params: { username } });
    } catch {
      toast("No se pudo abrir tu perfil. Prueba otra vez.");
    }
  };

  return (
    <Screen variant="tab" testID="screen-social" scroll={false}>
      <ScreenHeader
        title="Social"
        right={
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <BellButton />
            <IconButton testID="open-my-profile" icon="person-circle-outline" label="Mi perfil" onPress={openMyProfile} filled />
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
        ListFooterComponent={
          error && posts.length > 0 ? (
            <Callout tone="warning" icon="cloud-offline-outline" dense action={<Button label="Reintentar" size="sm" variant="secondary" onPress={() => loadMore(token)} />}>
              {error}
            </Callout>
          ) : null
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon={error ? "cloud-offline-outline" : "people-outline"}
              title={error ?? "Nadie ha publicado todavía"}
              text={error ? undefined : "Publica tu próxima carrera o entreno, o busca a tu gente con la lupa."}
              actionLabel={error ? "Reintentar" : "Buscar a tu gente"}
              onAction={error ? () => refresh(token) : () => router.push("/social/buscar")}
            />
          )
        }
      />
    </Screen>
  );
}
