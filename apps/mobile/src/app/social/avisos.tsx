import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, SectionList, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Avatar } from "@/components/social/Avatar";
import { Button, Callout, EmptyState, Overline, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api, ApiError, type SocialNotification } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { useNotifications } from "@/data/notificationsStore";
import { fmtRelativeTime } from "@/domain/format";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

const DAY = 86_400_000;

function describe(n: SocialNotification): string {
  switch (n.kind) {
    case "follow":
      return "ha empezado a seguirte";
    case "follow_request":
      return n.pending ? "quiere seguirte" : "te pidió seguirte";
    case "follow_accepted":
      return "ha aceptado tu solicitud";
    case "like":
      return "le ha gustado tu publicación";
    case "comment":
      return "ha comentado tu publicación";
  }
}

/** Hoy / Esta semana / Antes, como en cualquier bandeja de avisos. */
function group(items: SocialNotification[], now = Date.now()) {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const today = startOfDay.getTime();
  const sections = [
    { title: "Hoy", data: items.filter((n) => n.createdAt >= today) },
    { title: "Esta semana", data: items.filter((n) => n.createdAt < today && n.createdAt >= today - 6 * DAY) },
    { title: "Antes", data: items.filter((n) => n.createdAt < today - 6 * DAY) },
  ];
  return sections.filter((s) => s.data.length > 0);
}

function NotificationRow({ n, onAnswered }: { n: SocialNotification; onAnswered: (accepted: boolean) => void }) {
  const { c } = useTheme();
  const token = useAuth((s) => s.token);
  const [busy, setBusy] = useState(false);
  const open = () =>
    n.postId
      ? router.push({ pathname: "/social/post/[id]", params: { id: n.postId } })
      : router.push({ pathname: "/social/perfil/[username]", params: { username: n.actor.username } });

  const answer = async (accept: boolean) => {
    if (!token) return;
    setBusy(true);
    try {
      await (accept ? api.socialAcceptFollow(token, n.actor.username) : api.socialDeclineFollow(token, n.actor.username));
      onAnswered(accept);
      toast(accept ? `${n.actor.name} ya te sigue` : "Solicitud rechazada");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo responder. Prueba otra vez.");
    } finally {
      setBusy(false);
    }
  };

  const detail = n.commentText ? `«${n.commentText}»` : n.postText ? `«${n.postText}»` : null;
  return (
    <View
      testID={`notification-${n.id}`}
      style={{
        padding: space.md,
        gap: space.sm,
        borderRadius: radius.md,
        backgroundColor: n.read ? c.surface : c.brandSoft,
      }}
    >
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${n.actor.name} ${describe(n)}. Abrir`} style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
        <Avatar name={n.actor.name} url={n.actor.avatarUrl} />
        <View style={{ flex: 1, gap: space.hair }}>
          <Text variant="body" numberOfLines={2}>
            <Text variant="bodyStrong">{n.actor.name}</Text> {describe(n)}
          </Text>
          {detail ? (
            <Text variant="caption" color="muted" numberOfLines={2}>
              {detail}
            </Text>
          ) : null}
          <Text variant="caption" color="faint">
            {fmtRelativeTime(n.createdAt)}
          </Text>
        </View>
      </Pressable>
      {n.kind === "follow_request" && n.pending ? (
        <View style={{ flexDirection: "row", gap: space.sm, paddingLeft: 52 }}>
          <Button testID={`accept-${n.actor.username}`} label="Aceptar" size="sm" disabled={busy} onPress={() => answer(true)} />
          <Button testID={`decline-${n.actor.username}`} label="Rechazar" size="sm" variant="ghost" disabled={busy} onPress={() => answer(false)} />
        </View>
      ) : null}
    </View>
  );
}

/** Bandeja de avisos de Social (sin push: se refresca al abrirla, ver `notificationsStore.ts`). */
export default function NotificationsScreen() {
  const token = useAuth((s) => s.token);
  const { items, loading, error, hasMore, refresh, loadMore, markAllRead, resolveRequest } = useNotifications();

  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      // Se marcan leídos al salir: así, mientras miras la lista, siguen resaltados los nuevos.
      void refresh();
      return () => void useNotifications.getState().markAllRead();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]),
  );

  return (
    <Screen testID="screen-avisos" scroll={false}>
      <ScreenHeader title="Avisos" back right={items.some((n) => !n.read) ? <Button label="Marcar leídos" size="sm" variant="ghost" onPress={() => void markAllRead()} /> : undefined} />
      <SectionList
        style={{ flex: 1 }}
        sections={group(items)}
        keyExtractor={(n) => n.id}
        renderSectionHeader={({ section }) => (
          <View style={{ paddingTop: space.md, paddingBottom: space.xs }}>
            <Overline color="muted">{section.title}</Overline>
          </View>
        )}
        renderItem={({ item }) => <NotificationRow n={item} onAnswered={(accepted) => resolveRequest(item.id, accepted)} />}
        ItemSeparatorComponent={() => <View style={{ height: space.sm }} />}
        stickySectionHeadersEnabled={false}
        refreshing={loading && items.length > 0}
        onRefresh={() => void refresh()}
        onEndReachedThreshold={0.4}
        onEndReached={() => hasMore && void loadMore()}
        contentContainerStyle={{ paddingBottom: space.xl, flexGrow: 1 }}
        ListFooterComponent={
          error && items.length > 0 ? (
            <Callout tone="warning" icon="cloud-offline-outline" dense>
              {error}
            </Callout>
          ) : null
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon={error ? "cloud-offline-outline" : "notifications-outline"}
              title={error ?? "Sin avisos todavía"}
              text={error ? undefined : "Aquí verás quién te sigue, le da «me gusta» o comenta tus publicaciones."}
            />
          )
        }
      />
    </Screen>
  );
}
