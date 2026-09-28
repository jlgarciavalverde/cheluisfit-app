import { router } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Avatar } from "@/components/social/Avatar";
import { EmptyState, ListGroup, ListRow, SearchField } from "@/components/ui";
import { api, ApiError, type SocialUserSummary } from "@/data/api";
import { SignedOutScreen } from "@/components/social/ScreenStates";
import { useAuth } from "@/data/authStore";
import { space } from "@/theme/tokens";

export default function SearchUsersScreen() {
  const token = useAuth((s) => s.token);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SocialUserSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (!token || q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .socialSearch(token, q)
        .then((users) => {
          if (cancelled) return;
          setResults(users);
          setError(null);
        })
        .catch((e: unknown) => {
          if (cancelled) return;
          setResults(null);
          setError(e instanceof ApiError ? e.message : "No se pudo buscar. Prueba otra vez.");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, token]);

  if (!token) return <SignedOutScreen title="Buscar personas" testID="screen-buscar-personas" />;

  return (
    <Screen testID="screen-buscar-personas" scroll={false}>
      <ScreenHeader title="Buscar personas" back />
      <SearchField testID="search-users" value={query} onChangeText={setQuery} placeholder="Nombre o usuario…" autoFocus />
      <View style={{ marginTop: space.lg, flex: 1 }}>
        {error && !loading ? (
          <EmptyState icon="cloud-offline-outline" title={error} />
        ) : results === null ? (
          <EmptyState icon="search-outline" title={loading ? "Buscando…" : "Escribe al menos 2 letras"} />
        ) : results.length === 0 ? (
          <EmptyState icon="person-outline" title="Sin resultados" />
        ) : (
          <ListGroup>
            {results.map((u) => (
              <ListRow
                key={u.username}
                testID={`user-${u.username}`}
                title={u.name}
                subtitle={`@${u.username}`}
                leading={<Avatar name={u.name} url={u.avatarUrl} size="sm" />}
                chevron
                onPress={() => router.push({ pathname: "/social/perfil/[username]", params: { username: u.username } })}
              />
            ))}
          </ListGroup>
        )}
      </View>
    </Screen>
  );
}
