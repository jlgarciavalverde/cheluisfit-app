import { Image } from "expo-image";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Avatar } from "@/components/social/Avatar";
import { PostCard } from "@/components/social/PostCard";
import { LoadingScreen, SignedOutScreen } from "@/components/social/ScreenStates";
import { ActionList, ActionRow, Badge, BottomSheet, Button, Card, ConfirmSheet, EmptyState, Icon, IconButton, ListGroup, ListRow, Stat, StatGrid, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api, ApiError, type FollowState, type Post, type SocialProfile, type SocialUserSummary } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { useNotifications } from "@/data/notificationsStore";
import { useSocial } from "@/data/socialStore";
import { SPORT_LABEL } from "@/domain/sports";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

const FOLLOW_LABEL: Record<FollowState, string> = { self: "", none: "Seguir", pending: "Solicitado", accepted: "Siguiendo" };

function CountButton({ label, value, onPress, testID }: { label: string; value: number; onPress?: () => void; testID?: string }) {
  const body = <Stat label={label} value={String(value)} size="sm" align="center" />;
  if (!onPress) return <View style={{ flex: 1 }}>{body}</View>;
  return (
    <Pressable testID={testID} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${value} ${label}. Ver lista`} style={{ flex: 1 }}>
      {body}
    </Pressable>
  );
}

/**
 * Perfil público: lo que ven los demás (nombre público, foto, portada, ciudad, deportes, bio y las
 * estadísticas que la persona elige enseñar). Nunca el nombre real ni el correo de la cuenta. Con
 * cuenta privada, quien no la sigue solo ve la cabecera.
 */
export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const token = useAuth((s) => s.token);
  const { c } = useTheme();

  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [followState, setFollowState] = useState<FollowState>("none");
  const [followsMe, setFollowsMe] = useState(false);
  const [counts, setCounts] = useState({ posts: 0, followers: 0, following: 0 });
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pending, setPending] = useState<SocialUserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<"unfollow" | "cancel" | "remove" | null>(null);

  const isSelf = followState === "self";

  const load = async () => {
    if (!token) return;
    setError(null);
    try {
      const r = await api.socialProfile(token, username);
      setProfile(r.profile);
      setFollowState(r.followState);
      setFollowsMe(r.followsMe);
      setCounts(r.counts);
      setPosts(r.posts);
      setCursor(r.nextCursor);
      setPending(r.followState === "self" ? await api.socialPendingFollows(token) : []);
    } catch {
      setError("No se pudo cargar este perfil.");
    }
  };

  // Al volver del editor o de una lista, el perfil se ve al día.
  useFocusEffect(
    useCallback(() => {
      void load();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [username, token]),
  );

  if (!token) return <SignedOutScreen title="Perfil" testID="screen-perfil-social" />;

  const loadMore = async () => {
    if (!cursor || loadingMore || !profile) return;
    setLoadingMore(true);
    try {
      const r = await api.socialUserPosts(token, profile.username, cursor);
      setPosts((cur) => [...(cur ?? []), ...r.posts]);
      setCursor(r.nextCursor);
    } catch {
      toast("No se pudieron cargar más publicaciones");
    } finally {
      setLoadingMore(false);
    }
  };

  const follow = async () => {
    if (!profile) return;
    try {
      const r = await api.socialFollow(token, profile.username);
      setFollowState(r.status);
      if (r.status === "accepted") {
        await load();
        void useSocial.getState().refresh(token); // sus posts entran ya en el feed
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo seguir");
    }
  };

  const unfollow = async () => {
    if (!profile) return;
    setConfirm(null);
    try {
      await api.socialUnfollow(token, profile.username);
      setFollowState("none");
      await load();
      void useSocial.getState().refresh(token);
    } catch {
      toast("No se pudo dejar de seguir");
    }
  };

  const removeFollower = async () => {
    if (!profile) return;
    setConfirm(null);
    try {
      await api.socialRemoveFollower(token, profile.username);
      setFollowsMe(false);
      toast(`${profile.displayName} ya no te sigue`);
    } catch {
      toast("No se pudo quitar de tus seguidores");
    }
  };

  const respondRequest = async (u: SocialUserSummary, accept: boolean) => {
    try {
      await (accept ? api.socialAcceptFollow(token, u.username) : api.socialDeclineFollow(token, u.username));
      setPending((p) => p.filter((x) => x.username !== u.username));
      if (accept) setCounts((c2) => ({ ...c2, followers: c2.followers + 1 }));
      void useNotifications.getState().refreshUnread();
    } catch {
      toast("No se pudo responder a la solicitud");
    }
  };

  if (error) {
    return (
      <Screen testID="screen-perfil-social">
        <ScreenHeader title="Perfil" back />
        <EmptyState icon="cloud-offline-outline" title={error} actionLabel="Reintentar" onAction={load} />
      </Screen>
    );
  }
  if (!profile) return <LoadingScreen title="Perfil" testID="screen-perfil-social" />;

  const canSeeMore = posts !== null;
  const openList = (tab: "followers" | "following") => router.push({ pathname: "/social/conexiones", params: { username: profile.username, tab } });

  const header = (
    <View style={{ gap: space.lg }}>
      <View>
        {profile.coverUrl ? (
          <Image source={{ uri: profile.coverUrl }} contentFit="cover" accessibilityLabel="Foto de portada" style={{ height: 140, borderRadius: radius.lg, backgroundColor: c.surfaceAlt }} testID="profile-cover" />
        ) : (
          <View style={{ height: 72, borderRadius: radius.lg, backgroundColor: c.brandSoft }} />
        )}
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.md, marginTop: -space.xxl, paddingHorizontal: space.md }}>
          <View style={{ borderRadius: radius.pill, borderWidth: 3, borderColor: c.bg }}>
            <Avatar name={profile.displayName} url={profile.avatarUrl} size="lg" />
          </View>
          <View style={{ flex: 1 }} />
          {isSelf ? (
            <Button testID="edit-profile" label="Editar perfil" icon="create-outline" size="sm" variant="secondary" onPress={() => router.push("/social/editar-perfil")} />
          ) : (
            <View style={{ flexDirection: "row", gap: space.xs }}>
              <Button
                testID="follow-toggle"
                label={FOLLOW_LABEL[followState]}
                icon={followState === "none" ? "person-add-outline" : followState === "pending" ? "time-outline" : "checkmark"}
                size="sm"
                variant={followState === "none" ? "primary" : "secondary"}
                onPress={followState === "none" ? follow : () => setConfirm(followState === "pending" ? "cancel" : "unfollow")}
              />
              {followsMe || followState !== "none" ? <IconButton testID="profile-menu" icon="ellipsis-horizontal" label="Más opciones" size="md" filled onPress={() => setMenu(true)} /> : null}
            </View>
          )}
        </View>
      </View>

      <View style={{ gap: space.xs }}>
        <Text variant="title" testID="profile-display-name">
          {profile.displayName}
        </Text>
        <Text variant="body" color="muted">
          @{profile.username}
          {followsMe && !isSelf ? " · Te sigue" : ""}
        </Text>
        {profile.city ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <Icon name="location-outline" size="sm" color="muted" />
            <Text variant="body" color="muted">
              {profile.city}
            </Text>
          </View>
        ) : null}
      </View>

      {profile.sports.length ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }} testID="profile-sports">
          {profile.sports.map((s) => (
            <Badge key={s} label={SPORT_LABEL[s as keyof typeof SPORT_LABEL] ?? s} tone="brand" />
          ))}
        </View>
      ) : null}
      {profile.bio ? <Text variant="body">{profile.bio}</Text> : null}

      <Card style={{ flexDirection: "row", paddingVertical: space.md }}>
        <CountButton label="Publicaciones" value={counts.posts} />
        <CountButton testID="open-followers" label="Seguidores" value={counts.followers} onPress={canSeeMore ? () => openList("followers") : undefined} />
        <CountButton testID="open-following" label="Siguiendo" value={counts.following} onPress={canSeeMore ? () => openList("following") : undefined} />
      </Card>

      {profile.stats.length ? (
        <View style={{ gap: space.sm }} testID="profile-stats">
          <StatGrid columns={2}>
            {profile.stats.map((s) => (
              <Stat key={s.key} label={s.detail ? `${s.label} · ${s.detail}` : s.label} value={s.value} unit={s.unit} size="md" />
            ))}
          </StatGrid>
        </View>
      ) : isSelf ? (
        <Text variant="caption" color="muted">
          Tus estadísticas públicas aparecen aquí al sincronizar. Elige cuáles enseñar en «Editar perfil».
        </Text>
      ) : null}

      {isSelf && pending.length > 0 ? (
        <Card style={{ gap: space.sm }} testID="pending-follows">
          <Text variant="bodyStrong">Solicitudes de seguimiento</Text>
          <ListGroup>
            {pending.map((u) => (
              <ListRow
                key={u.username}
                title={u.name}
                subtitle={`@${u.username}`}
                leading={<Avatar name={u.name} url={u.avatarUrl} size="sm" />}
                trailing={
                  <View style={{ flexDirection: "row", gap: space.xs }}>
                    <IconButton icon="checkmark-circle" label={`Aceptar a ${u.name}`} color="brandText" onPress={() => respondRequest(u, true)} />
                    <IconButton icon="close-circle" label={`Rechazar a ${u.name}`} color="danger" onPress={() => respondRequest(u, false)} />
                  </View>
                }
              />
            ))}
          </ListGroup>
        </Card>
      ) : null}

      {posts === null ? (
        <EmptyState icon="lock-closed-outline" title="Cuenta privada" text="Síguela para ver sus publicaciones y estadísticas." />
      ) : posts.length === 0 ? (
        <EmptyState icon="images-outline" title={isSelf ? "Todavía no has publicado nada" : "Todavía no ha publicado nada"} actionLabel={isSelf ? "Publicar" : undefined} onAction={isSelf ? () => router.push("/social/publicar") : undefined} />
      ) : null}
    </View>
  );

  // Mismo «me gusta» optimista que el feed (`(tabs)/social.tsx`), también reflejado en el feed.
  const toggleLike = async (post: Post) => {
    const patch = (liked: boolean, count: number) => {
      setPosts((cur) => cur?.map((p) => (p.id === post.id ? { ...p, likedByMe: liked, likesCount: count } : p)) ?? cur);
      useSocial.getState().updatePost(post.id, { likedByMe: liked, likesCount: count });
    };
    patch(!post.likedByMe, post.likesCount + (post.likedByMe ? -1 : 1));
    try {
      await (post.likedByMe ? api.socialUnlike(token, post.id) : api.socialLike(token, post.id));
    } catch {
      patch(post.likedByMe, post.likesCount);
      toast("No se pudo dar «me gusta». Prueba otra vez.");
    }
  };

  return (
    <Screen testID="screen-perfil-social" scroll={false}>
      <ScreenHeader title={profile.displayName} subtitle={`@${profile.username}`} back />
      <FlatList
        style={{ flex: 1 }}
        data={posts ?? []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: space.lg }}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        renderItem={({ item }) => (
          <View style={{ marginBottom: space.md }}>
            <PostCard post={item} onOpenAuthor={() => {}} onOpenPost={() => router.push({ pathname: "/social/post/[id]", params: { id: item.id } })} onToggleLike={() => toggleLike(item)} />
          </View>
        )}
      />

      <BottomSheet visible={menu} onClose={() => setMenu(false)} title={profile.displayName} subtitle={`@${profile.username}`}>
        <ActionList>
          {followState === "accepted" ? (
            <ActionRow icon="person-remove-outline" label="Dejar de seguir" onPress={() => {
                setMenu(false);
                setConfirm("unfollow");
              }} />
          ) : null}
          {followState === "pending" ? <ActionRow icon="close-circle-outline" label="Cancelar la solicitud" onPress={() => {
                setMenu(false);
                setConfirm("cancel");
              }} /> : null}
          {followsMe ? (
            <ActionRow testID="remove-follower" icon="remove-circle-outline" label="Quitar de mis seguidores" hint="Dejará de ver tu perfil si es privado" tone="danger" onPress={() => {
                setMenu(false);
                setConfirm("remove");
              }} />
          ) : null}
        </ActionList>
      </BottomSheet>

      <ConfirmSheet
        visible={confirm === "unfollow" || confirm === "cancel"}
        title={confirm === "cancel" ? "¿Cancelar la solicitud?" : `¿Dejar de seguir a ${profile.displayName}?`}
        message={profile.isPrivate ? "Su cuenta es privada: para volver a ver sus publicaciones tendrás que pedírselo otra vez." : "Sus publicaciones dejarán de salir en tu feed."}
        confirmLabel={confirm === "cancel" ? "Cancelar solicitud" : "Dejar de seguir"}
        onConfirm={unfollow}
        onClose={() => setConfirm(null)}
        testID="confirm-unfollow"
      />
      <ConfirmSheet
        visible={confirm === "remove"}
        title={`¿Quitar a ${profile.displayName} de tus seguidores?`}
        message="No se le avisa. Si tu cuenta es privada, dejará de ver tus publicaciones."
        confirmLabel="Quitar"
        onConfirm={removeFollower}
        onClose={() => setConfirm(null)}
      />
    </Screen>
  );
}
