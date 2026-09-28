import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Button, Card, CheckRow, Chip, Icon, ListGroup, ListRow, Text, TextField, BottomSheet } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api, ApiError } from "@/data/api";
import { useAuth } from "@/data/authStore";
import type { Activity } from "@/domain/running";
import { useRunning } from "@/data/runningStore";
import type { Workout } from "@/domain/strength";
import { useStrength } from "@/data/strengthStore";
import { addDays, dayLabel, todayKey } from "@/domain/dates";
import { fmtDuration, fmtKm } from "@/domain/format";
import { freeSnapshot, runSnapshot, snapshotSummary, strengthSnapshot } from "@/domain/socialSnapshot";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";

type Kind = "free" | "run" | "strength";

export default function PublishScreen() {
  const { c } = useTheme();
  const token = useAuth((s) => s.token);
  const activities = useRunning((s) => s.activities);
  const workouts = useStrength((s) => s.workouts);

  const [kind, setKind] = useState<Kind>("free");
  const [activity, setActivity] = useState<Activity | null>(null);
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [includeRoute, setIncludeRoute] = useState(false);
  const [text, setText] = useState("");
  const [photos, setPhotos] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [picker, setPicker] = useState<"run" | "strength" | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const cutoff = addDays(todayKey(), -30);
  const recentActivities = useMemo(() => activities.filter((a) => a.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date)), [activities, cutoff]);
  const recentWorkouts = useMemo(() => workouts.filter((w) => w.date >= cutoff).sort((a, b) => b.date.localeCompare(a.date)), [workouts, cutoff]);

  const snapshot = useMemo(() => {
    if (kind === "run" && activity) return runSnapshot(activity, includeRoute);
    if (kind === "strength" && workout) return strengthSnapshot(workout);
    return freeSnapshot();
  }, [kind, activity, workout, includeRoute]);

  const hasRoute = kind === "run" && !!activity?.route && activity.route.length > 1;
  const valid = kind === "free" || (kind === "run" && !!activity) || (kind === "strength" && !!workout);

  const addPhotos = async () => {
    if (photos.length >= 4) return;
    if (!token) {
      toast("Inicia sesión para poder subir fotos");
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast("Necesito permiso para ver tus fotos");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsMultipleSelection: true, selectionLimit: 4 - photos.length });
    if (result.canceled) return;
    setUploading(true);
    try {
      for (const asset of result.assets) {
        // Sin `allowsEditing` (incompatible con la selección múltiple), el picker devuelve el
        // archivo en su formato original — un iPhone puede entregar HEIC, que el servidor no
        // acepta (`routes/media.ts`). Se re-codifica siempre a JPEG antes de subir, sea cual
        // sea el formato de origen.
        const manipulated = await ImageManipulator.manipulateAsync(asset.uri, [], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
        const up = await api.uploadMedia(token, manipulated.uri, "foto.jpg", "image/jpeg");
        setPhotos((p) => (p.length >= 4 ? p : [...p, up]));
      }
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo subir alguna foto");
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!token || !valid) return;
    setSubmitting(true);
    try {
      const { id } = await api.socialPublish(token, {
        kind,
        text: text.trim(),
        snapshot: snapshot as unknown as Record<string, unknown>,
        mediaIds: photos.map((p) => p.id),
      });
      toast("Publicado");
      router.replace({ pathname: "/social/post/[id]", params: { id } });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo publicar");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen
      testID="screen-publicar"
      variant="form"
      footer={<Button testID="publish-submit" label={submitting ? "Publicando…" : "Publicar"} size="lg" fullWidth disabled={!valid || submitting || uploading} onPress={submit} />}
    >
      <ScreenHeader title="Publicar" back />
      <View style={{ gap: space.lg }}>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Chip testID="kind-free" label="Publicación libre" selected={kind === "free"} onPress={() => setKind("free")} />
          <Chip testID="kind-run" label="Carrera reciente" selected={kind === "run"} onPress={() => setKind("run")} />
          <Chip testID="kind-strength" label="Entreno de fuerza" selected={kind === "strength"} onPress={() => setKind("strength")} />
        </View>

        {kind === "run" ? (
          <Card style={{ gap: space.sm }}>
            <Button
              testID="pick-activity"
              label={activity ? `${dayLabel(activity.date)} · ${activity.title}` : "Elegir una carrera de los últimos 30 días"}
              icon="walk-outline"
              variant="secondary"
              onPress={() => setPicker("run")}
            />
            {activity ? (
              <Text variant="caption" color="muted">
                {fmtKm(activity.distanceM)} km en {fmtDuration(activity.durationS)}
              </Text>
            ) : null}
            {hasRoute ? <CheckRow label="Incluir el recorrido (recortado por los extremos)" checked={includeRoute} onChange={setIncludeRoute} /> : null}
          </Card>
        ) : null}

        {kind === "strength" ? (
          <Card style={{ gap: space.sm }}>
            <Button
              testID="pick-workout"
              label={workout ? `${dayLabel(workout.date)} · ${workout.name}` : "Elegir un entreno de los últimos 30 días"}
              icon="barbell-outline"
              variant="secondary"
              onPress={() => setPicker("strength")}
            />
            {workout ? (
              <Text variant="caption" color="muted">
                {snapshotSummary(strengthSnapshot(workout))}
              </Text>
            ) : null}
          </Card>
        ) : null}

        <TextField testID="publish-text" label="Cuéntanos algo (opcional)" value={text} onChangeText={setText} placeholder="¿Qué tal ha ido?" multiline style={{ minHeight: 84, textAlignVertical: "top" }} />

        <View style={{ gap: space.sm }}>
          <Text variant="bodyStrong">Fotos (hasta 4)</Text>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {photos.map((p) => (
              <View key={p.id} style={{ width: 80, height: 80 }}>
                <Pressable
                  onPress={() => setPhotos((cur) => cur.filter((x) => x.id !== p.id))}
                  accessibilityRole="button"
                  accessibilityLabel="Quitar foto"
                  style={{ position: "absolute", top: -6, right: -6, zIndex: 1 }}
                >
                  <Icon name="close-circle" size="md" color="danger" />
                </Pressable>
                <Image source={{ uri: p.url }} contentFit="cover" accessibilityLabel="Foto a publicar" style={{ width: 80, height: 80, borderRadius: radius.md, backgroundColor: c.surfaceAlt }} />
              </View>
            ))}
            {photos.length < 4 ? (
              <Pressable
                testID="add-photo"
                onPress={addPhotos}
                disabled={uploading}
                accessibilityRole="button"
                accessibilityLabel="Añadir foto"
                style={{ width: 80, height: 80, borderRadius: radius.md, borderWidth: 2, borderColor: c.border, borderStyle: "dashed", alignItems: "center", justifyContent: "center" }}
              >
                <Icon name={uploading ? "hourglass-outline" : "add"} size="lg" color="muted" />
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>

      <BottomSheet visible={picker === "run"} onClose={() => setPicker(null)} title="Elegir una carrera">
        <ListGroup>
          {recentActivities.map((a) => (
            <ListRow
              key={a.id}
              title={a.title}
              subtitle={`${dayLabel(a.date)} · ${fmtKm(a.distanceM)} km`}
              onPress={() => {
                setActivity(a);
                setIncludeRoute(false);
                setPicker(null);
              }}
            />
          ))}
        </ListGroup>
        {recentActivities.length === 0 ? (
          <Text variant="body" color="muted">
            No tienes carreras en los últimos 30 días.
          </Text>
        ) : null}
      </BottomSheet>

      <BottomSheet visible={picker === "strength"} onClose={() => setPicker(null)} title="Elegir un entreno">
        <ListGroup>
          {recentWorkouts.map((w) => (
            <ListRow
              key={w.id}
              title={w.name}
              subtitle={dayLabel(w.date)}
              onPress={() => {
                setWorkout(w);
                setPicker(null);
              }}
            />
          ))}
        </ListGroup>
        {recentWorkouts.length === 0 ? (
          <Text variant="body" color="muted">
            No tienes entrenos en los últimos 30 días.
          </Text>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
