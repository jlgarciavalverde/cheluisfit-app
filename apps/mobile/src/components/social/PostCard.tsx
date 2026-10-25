import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, ScrollView, Share, useWindowDimensions, View } from "react-native";
import { FullScreenModal } from "@/components/FullScreenModal";
import { RouteMap } from "@/components/running/RouteMap";
import { Card, Icon, Stat, StatGrid, Text } from "@/components/ui";
import type { Post } from "@/data/api";
import { fmtDuration, fmtKg, fmtKm, fmtPace, fmtRelativeTime } from "@/domain/format";
import { snapshotSummary, type RunSnapshot, type Snapshot, type StrengthSnapshot } from "@/domain/socialSnapshot";
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

/** «100×5 · 100×5 · 97,5×6»: todas las series de trabajo (antes solo se veía la primera). */
function setsLine(sets: StrengthSnapshot["exercises"][number]["sets"]): string {
  return sets.map((x) => (x.kg ? `${fmtKg(x.kg)}×${x.reps}` : `${x.reps}`)).join(" · ");
}

function StrengthBody({ s }: { s: StrengthSnapshot }) {
  return (
    <View style={{ gap: space.sm }}>
      <StatGrid>
        <Stat label="Series" value={String(s.totals.workingSets)} size="sm" />
        <Stat label="Volumen" value={fmtKg(s.totals.volume)} unit="kg" size="sm" />
        {s.totals.durationS ? <Stat label="Duración" value={fmtDuration(s.totals.durationS)} size="sm" /> : null}
      </StatGrid>
      <View style={{ gap: space.xs }}>
        {s.exercises.map((e, i) => (
          <View key={i} style={{ flexDirection: "row", gap: space.sm }}>
            <Text variant="bodyStrong" style={{ flexShrink: 1 }} numberOfLines={2}>
              {e.name}
            </Text>
            <Text variant="body" color="muted" tabular style={{ flex: 1, textAlign: "right" }}>
              {setsLine(e.sets)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Visor de fotos a pantalla completa, deslizando entre las del post. */
function PhotoViewer({ urls, start, onClose }: { urls: string[]; start: number | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const side = Math.min(width, 760) - 2 * space.lg;
  return (
    <FullScreenModal visible={start !== null} onClose={onClose} title="Fotos" testID="photo-viewer">
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: (start ?? 0) * side, y: 0 }}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: "center" }}
      >
        {urls.map((url, i) => (
          <Image key={url} source={{ uri: url }} contentFit="contain" accessibilityLabel={`Foto ${i + 1} de ${urls.length}`} style={{ width: side, height: height * 0.7 }} />
        ))}
      </ScrollView>
    </FullScreenModal>
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
  const [photo, setPhoto] = useState<number | null>(null);
  const share = () => {
    // Los posts son privados (perfil privado/seguidores): se comparte el resumen en texto, no un enlace.
    const summary = post.kind === "free" ? "" : snapshotSummary(post.snapshot as unknown as Snapshot);
    void Share.share({ message: [`${post.author.name} en CheluisFIT`, summary, post.text].filter(Boolean).join("\n") });
  };
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
          <Text variant="bodyStrong" numberOfLines={1}>
            {post.author.name}
          </Text>
          <Text variant="caption" color="muted" numberOfLines={1}>
            @{post.author.username} · {fmtRelativeTime(post.createdAt)}
          </Text>
        </View>
      </Pressable>

      {post.kind === "run" ? <RunBody s={post.snapshot as unknown as RunSnapshot} /> : null}
      {post.kind === "strength" ? <StrengthBody s={post.snapshot as unknown as StrengthSnapshot} /> : null}

      {post.media.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
          {post.media.map((url, i) => (
            <Pressable key={url} onPress={() => setPhoto(i)} accessibilityRole="button" accessibilityLabel={`Ampliar foto ${i + 1}`}>
              <Image source={{ uri: url }} contentFit="cover" style={{ width: 220, height: 220, borderRadius: radius.md }} />
            </Pressable>
          ))}
        </ScrollView>
      ) : null}

      {post.text ? <Text variant="body">{post.text}</Text> : null}

      <View style={{ flexDirection: "row", gap: space.lg, alignItems: "center" }}>
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
        <View style={{ flex: 1 }} />
        <Pressable onPress={share} accessibilityRole="button" accessibilityLabel="Compartir" style={{ minHeight: touch.comfortable, minWidth: touch.min, alignItems: "center", justifyContent: "center" }}>
          <Icon name="share-social-outline" size="md" color="muted" />
        </Pressable>
      </View>
      {post.media.length > 0 ? <PhotoViewer urls={post.media} start={photo} onClose={() => setPhoto(null)} /> : null}
    </Card>
  );
}
