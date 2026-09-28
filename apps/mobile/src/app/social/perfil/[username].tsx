import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Avatar } from "@/components/social/Avatar";
import { PostCard } from "@/components/social/PostCard";
import { BottomSheet, Button, Card, CheckRow, EmptyState, IconButton, ListGroup, ListRow, Stat, StatGrid, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { LoadingScreen, SignedOutScreen } from "@/components/social/ScreenStates";
import { api, ApiError, type FollowState, type Post, type SocialProfile, type SocialUserSummary } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { space } from "@/theme/tokens";

const FOLLOW_LABEL: Record<FollowState, string> = { self: "", none: "Seguir", pending: "Solicitado", accepted: "Siguiendo" };

export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const token = useAuth((s) => s.token);

  const [profile, setProfile] = useState<SocialProfile | null>(null);
  const [followState, setFollowState] = useState<FollowState>("none");
  const [counts, setCounts] = useState({ posts: 0, followers: 0, following: 0 });
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [pending, setPending] = useState<SocialUserSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [bio, setBio] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);

  const isSelf = followState === "self";

  const load = async () => {
    if (!token) return;
    setError(null);
    try {
      const r = await api.socialProfile(token, username);
      setProfile(r.profile);
      setFollowState(r.followState);
      setCounts(r.counts);
      setPosts(r.posts);
      setBio(r.profile.bio);
      setIsPrivate(r.profile.isPrivate);
      if (r.followState === "self" && r.profile.isPrivate) setPending(await api.socialPendingFollows(token));
    } catch {
      setError("No se pudo cargar este perfil.");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, token]);

  if (!token) return <SignedOutScreen title="Perfil" testID="screen-perfil-social" />;

  const toggleFollow = async () => {
    if (!profile) return;
    try {
      if (followState === "none") {
        const r = await api.socialFollow(token, profile.username);
        setFollowState(r.status);
      } else {
        await api.socialUnfollow(token, profile.username);
        setFollowState("none");
        setPosts(profile.isPrivate ? null : posts);
      }
    } catch {
      toast("No se pudo actualizar el seguimiento");
    }
  };

  const respondRequest = async (u: SocialUserSummary, accept: boolean) => {
    try {
      await (accept ? api.socialAcceptFollow(token, u.username) : api.socialDeclineFollow(token, u.username));
      setPending((p) => p.filter((x) => x.username !== u.username));
      if (accept) setCounts((c2) => ({ ...c2, followers: c2.followers + 1 }));
    } catch {
      toast("No se pudo responder a la solicitud");
    }
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return toast("Necesito permiso para ver tus fotos");
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled) return;
    const asset = result.assets[0]!;
    try {
      const up = await api.uploadMedia(token, asset.uri, asset.fileName ?? "avatar.jpg", asset.mimeType ?? "image/jpeg");
      await api.socialUpdateProfile(token, { avatarMediaId: up.id });
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo subir la foto");
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api.socialUpdateProfile(token, { bio, isPrivate });
      setEditing(false);
      await load();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setSavingProfile(false);
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

  const header = (
    <View style={{ gap: space.lg }}>
      <View style={{ flexDirection: "row", gap: space.lg, alignItems: "center" }}>
        <View>
          <Avatar name={profile.name} url={profile.avatarUrl} size="lg" />
          {isSelf ? (
            <View style={{ position: "absolute", bottom: -4, right: -4 }}>
              <IconButton icon="camera" label="Cambiar foto de perfil" onPress={pickAvatar} filled="brand" size="sm" />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1 }}>
          <Text variant="title">{profile.name}</Text>
          <Text variant="body" color="muted">
            @{profile.username}
          </Text>
        </View>
      </View>

      {profile.bio ? <Text variant="body">{profile.bio}</Text> : null}

      <StatGrid>
        <Stat label="Publicaciones" value={String(counts.posts)} size="sm" />
        <Stat label="Seguidores" value={String(counts.followers)} size="sm" />
        <Stat label="Siguiendo" value={String(counts.following)} size="sm" />
      </StatGrid>

      {isSelf ? (
        <Button testID="edit-profile" label="Editar perfil" icon="create-outline" variant="secondary" onPress={() => setEditing(true)} />
      ) : (
        <Button
          testID="follow-toggle"
          label={FOLLOW_LABEL[followState]}
          icon={followState === "none" ? "person-add-outline" : "checkmark"}
          variant={followState === "none" ? "primary" : "secondary"}
          onPress={toggleFollow}
        />
      )}

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
                    <IconButton icon="checkmark-circle" label="Aceptar" color="brandText" onPress={() => respondRequest(u, true)} />
                    <IconButton icon="close-circle" label="Rechazar" color="danger" onPress={() => respondRequest(u, false)} />
                  </View>
                }
              />
            ))}
          </ListGroup>
        </Card>
      ) : null}

      {posts === null ? <EmptyState icon="lock-closed-outline" title="Cuenta privada" text="Solo quienes sigue puede ver sus publicaciones." /> : null}
    </View>
  );

  // Mismo «me gusta» optimista que el feed (`(tabs)/social.tsx`), sobre la lista local de este perfil.
  const toggleLike = async (post: Post) => {
    if (!token) return;
    const patch = (liked: boolean, count: number) => setPosts((cur) => cur?.map((p) => (p.id === post.id ? { ...p, likedByMe: liked, likesCount: count } : p)) ?? cur);
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
      <ScreenHeader title={`@${profile.username}`} back />
      <FlatList
        style={{ flex: 1 }}
        data={posts ?? []}
        keyExtractor={(p) => p.id}
        ListHeaderComponent={header}
        ListHeaderComponentStyle={{ marginBottom: space.lg }}
        renderItem={({ item }) => (
          <View style={{ marginBottom: space.md }}>
            <PostCard post={item} onOpenAuthor={() => {}} onOpenPost={() => router.push({ pathname: "/social/post/[id]", params: { id: item.id } })} onToggleLike={() => toggleLike(item)} />
          </View>
        )}
      />

      <BottomSheet visible={editing} onClose={() => setEditing(false)} title="Editar perfil">
        <TextField label="Biografía" value={bio} onChangeText={setBio} placeholder="Cuéntanos algo de ti" multiline style={{ minHeight: 72, textAlignVertical: "top" }} />
        <CheckRow label="Cuenta privada" hint="Solo tus seguidores aceptados verán tus publicaciones" checked={isPrivate} onChange={setIsPrivate} kind="switch" />
        <Button label="Guardar cambios" onPress={saveProfile} loading={savingProfile} fullWidth />
      </BottomSheet>
    </Screen>
  );
}
