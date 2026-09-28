import { Image } from "expo-image";
import { Pressable, ScrollView, View } from "react-native";
import { RouteMap } from "@/components/running/RouteMap";
import { Card, Icon, Stat, StatGrid, Text } from "@/components/ui";
import type { Post } from "@/data/api";
import { fmtDuration, fmtKm, fmtPace, fmtRelativeTime } from "@/domain/format";
import type { RunSnapshot, StrengthSnapshot } from "@/domain/socialSnapshot";
import { radius, space, touch } from "@/theme/tokens";
import { Avatar } from "./Avatar";

function RunBody({ s }: { s: RunSnapshot }) {
  return (
    <View style={{ gap: space.sm }}>
      <StatGrid>
        <Stat label="Distancia" value={fmtKm(s.distanceM)} unit="km" size="sm" />
        <Stat label="Tiempo" value={fmtDuration(s.durationS)} size="sm" />
        {s.pace > 0 ? <Stat label="Ritmo" value={fmtPace(s.pace)} unit="/km" size="sm" /> : null}
        {s.avgHr ? <Stat label="FC media" value={String(s.avgHr)} unit="ppm" size="sm" /> : null}
      </StatGrid>
      {s.route && s.route.length > 1 ? <RouteMap route={s.route} height={140} /> : null}
    </View>
  );
}

function StrengthBody({ s }: { s: StrengthSnapshot }) {
  return (
    <View style={{ gap: space.xs }}>
      {s.exercises.map((e, i) => (
        <Text key={i} variant="body">
          {e.name} · {e.sets.length}×{e.sets[0]?.reps ?? 0}
          {e.sets[0]?.kg ? ` @ ${e.sets[0].kg} kg` : ""}
        </Text>
      ))}
      <Text variant="caption" color="muted">
        {s.totals.workingSets} series · {s.totals.volume} kg de volumen
      </Text>
    </View>
  );
}

export function PostCard({
  post,
  onOpenAuthor,
  onOpenPost,
  onToggleLike,
}: {
  post: Post;
  onOpenAuthor: () => void;
  onOpenPost: () => void;
  onToggleLike: () => void;
}) {
  return (
    <Card style={{ gap: space.md }} testID={`post-${post.id}`}>
      <Pressable
        onPress={onOpenAuthor}
        accessibilityRole="button"
        accessibilityLabel={`Ver perfil de ${post.author.name}`}
        style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}
      >
        <Avatar name={post.author.name} url={post.author.avatarUrl} />
        <View style={{ flex: 1 }}>
          <Text variant="bodyStrong">{post.author.name}</Text>
          <Text variant="caption" color="muted">
            @{post.author.username} · {fmtRelativeTime(post.createdAt)}
          </Text>
        </View>
      </Pressable>

      {post.kind === "run" ? <RunBody s={post.snapshot as unknown as RunSnapshot} /> : null}
      {post.kind === "strength" ? <StrengthBody s={post.snapshot as unknown as StrengthSnapshot} /> : null}

      {post.media.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {post.media.map((url) => (
            <Image key={url} source={{ uri: url }} contentFit="cover" accessibilityLabel="Foto del post" style={{ width: 220, height: 220, borderRadius: radius.md }} />
          ))}
        </ScrollView>
      ) : null}

      {post.text ? <Text variant="body">{post.text}</Text> : null}

      <View style={{ flexDirection: "row", gap: space.lg }}>
        <Pressable
          testID={`like-${post.id}`}
          onPress={onToggleLike}
          accessibilityRole="button"
          accessibilityLabel={post.likedByMe ? "Quitar me gusta" : "Me gusta"}
          style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: touch.comfortable }}
        >
          <Icon name={post.likedByMe ? "heart" : "heart-outline"} size="md" color={post.likedByMe ? "danger" : "muted"} />
          <Text variant="body" color="muted">
            {post.likesCount}
          </Text>
        </Pressable>
        <Pressable
          onPress={onOpenPost}
          accessibilityRole="button"
          accessibilityLabel="Ver comentarios"
          style={{ flexDirection: "row", alignItems: "center", gap: space.xs, minHeight: touch.comfortable }}
        >
          <Icon name="chatbubble-outline" size="md" color="muted" />
          <Text variant="body" color="muted">
            {post.commentsCount}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}
