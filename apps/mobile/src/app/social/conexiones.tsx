import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Avatar } from "@/components/social/Avatar";
import { EmptyState, ListRow, SegmentedControl, Text } from "@/components/ui";
import { api, ApiError, type SocialUserSummary } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { space } from "@/theme/tokens";

type Tab = "followers" | "following";
const FOLLOW_BADGE: Record<string, string> = { accepted: "Le sigues", pending: "Solicitado" };

/** Seguidores y seguidos de alguien (misma privacidad que sus publicaciones). */
export default function ConnectionsScreen() {
  const params = useLocalSearchParams<{ username: string; tab?: Tab }>();
  const token = useAuth((s) => s.token);
  const [tab, setTab] = useState<Tab>(params.tab === "following" ? "following" : "followers");
  const [users, setUsers] = useState<SocialUserSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    setUsers(null);
    setError(null);
    api
      .socialFollowList(token, params.username, tab)
      .then((u) => alive && setUsers(u))
      .catch((e) => alive && setError(e instanceof ApiError ? e.message : "No se pudo cargar la lista"));
    return () => {
      alive = false;
    };
  }, [token, params.username, tab]);

  return (
    <Screen testID="screen-conexiones" scroll={false}>
      <ScreenHeader title={`@${params.username}`} back />
      <View style={{ gap: space.md, flex: 1 }}>
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: "followers", label: "Seguidores" },
            { value: "following", label: "Siguiendo" },
          ]}
        />
        <FlatList
          style={{ flex: 1 }}
          data={users ?? []}
          keyExtractor={(u) => u.username}
          ItemSeparatorComponent={() => <View style={{ height: space.xs }} />}
          renderItem={({ item }) => (
            <ListRow
              title={item.name}
              subtitle={`@${item.username}`}
              leading={<Avatar name={item.name} url={item.avatarUrl} size="sm" />}
              value={
                item.followState && FOLLOW_BADGE[item.followState] ? (
                  <Text variant="caption" color="muted">
                    {FOLLOW_BADGE[item.followState]}
                  </Text>
                ) : undefined
              }
              chevron
              onPress={() => router.push({ pathname: "/social/perfil/[username]", params: { username: item.username } })}
              testID={`connection-${item.username}`}
            />
          )}
          ListEmptyComponent={
            users === null && !error ? null : (
              <EmptyState
                icon={error ? "lock-closed-outline" : "people-outline"}
                title={error ?? (tab === "followers" ? "Sin seguidores todavía" : "Todavía no sigue a nadie")}
              />
            )
          }
        />
      </View>
    </Screen>
  );
}
