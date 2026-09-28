import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { handBackCreatedExercise } from "@/lib/createdExercise";
import { useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { ExerciseThumb } from "@/components/strength/MediaStage";
import { Button, Chip, FieldGroup, Icon, SegmentedControl, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api, ApiError } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { useStrength } from "@/data/strengthStore";
import {
  defaultRestFor,
  EQUIPMENT_LABEL,
  type Equipment,
  type Exercise,
  type ExerciseKind,
  GROUP_LABEL,
  GROUP_ORDER,
  type Muscle,
  MUSCLE_LABEL,
} from "@/domain/strength";
import { makeId } from "@/domain/running";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

const MUSCLES_BY_GROUP: Record<string, Muscle[]> = {
  chest: ["chest"],
  back: ["lats", "middleBack", "lowerBack", "traps"],
  shoulders: ["shoulders"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  legs: ["quads", "hamstrings", "glutes", "calves", "adductors", "abductors"],
  core: ["abs"],
  other: ["forearms", "neck"],
};

export default function CreateExerciseScreen() {
  const { c } = useTheme();
  // `from=picker`: se abrió desde el selector de una rutina/entreno y hay que volver a él.
  const params = useLocalSearchParams<{ name?: string; from?: string }>();
  const save = useStrength((s) => s.saveCustomExercise);
  const token = useAuth((s) => s.token);
  const [name, setName] = useState(params.name ?? "");
  const [primary, setPrimary] = useState<Muscle | null>(null);
  const [equipment, setEquipment] = useState<Equipment>("dumbbell");
  const [kind, setKind] = useState<ExerciseKind>("weight_reps");
  const [compound, setCompound] = useState(false);
  const [tried, setTried] = useState(false);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const pickPhoto = async (source: "camera" | "library") => {
    const perm = source === "camera" ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      toast(source === "camera" ? "Necesito permiso para usar la cámara" : "Necesito permiso para ver tus fotos");
      return;
    }
    const launch = source === "camera" ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const result = await launch({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect: [4, 3] });
    const asset = result.canceled ? null : result.assets[0];
    if (!asset) return;
    setPhotoUri(asset.uri);
    if (!token) {
      toast("Foto guardada en este móvil. Inicia sesión para que también se suba al servidor.");
      return;
    }
    setUploading(true);
    try {
      const { url } = await api.uploadMedia(token, asset.uri, asset.fileName ?? "foto.jpg", asset.mimeType ?? "image/jpeg");
      setPhotoUri(url);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo subir la foto; se queda solo en este móvil por ahora");
    } finally {
      setUploading(false);
    }
  };

  const nameBad = name.trim() === "";
  const submit = () => {
    setTried(true);
    if (nameBad || !primary) return;
    const ex: Exercise = {
      id: `custom-${makeId("x")}`,
      name: name.trim(),
      aliases: [],
      primary: [primary],
      secondary: [],
      equipment,
      kind,
      source: "custom",
      compound,
      frames: photoUri ? [photoUri] : undefined,
    };
    ex.defaultRestS = defaultRestFor(ex);
    save(ex);
    toast(`«${ex.name}» creado`);
    if (params.from === "picker" && router.canGoBack()) {
      handBackCreatedExercise(ex.id);
      router.back();
    } else {
      router.replace({ pathname: "/ejercicio/[id]", params: { id: ex.id } });
    }
  };

  return (
    <Screen variant="form"
      testID="screen-crear-ejercicio"
      footer={<Button testID="save-exercise" label="Crear ejercicio" size="lg" fullWidth onPress={submit} />}
    >
      <ScreenHeader title="Nuevo ejercicio" back />
      <View style={{ gap: space.lg }}>
        <TextField
          testID="cx-name"
          label="Nombre"
          value={name}
          onChangeText={setName}
          placeholder="Press Svend"
          error={tried && nameBad ? "Ponle un nombre" : undefined}
        />
        <FieldGroup label="Foto (opcional)" hint="Tuya, para reconocer el ejercicio de un vistazo. Si no pones ninguna, se queda con un icono.">
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View>
              <ExerciseThumb exercise={{ name, frames: photoUri ? [photoUri] : undefined }} size={72} />
              {uploading ? (
                <View
                  pointerEvents="none"
                  style={{ position: "absolute", inset: 0, borderRadius: radius.md, backgroundColor: c.scrim, alignItems: "center", justifyContent: "center" }}
                >
                  <ActivityIndicator color={c.onScrim} />
                </View>
              ) : null}
            </View>
            <View style={{ flex: 1, gap: space.sm }}>
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                <Button testID="cx-photo-camera" label="Tomar foto" icon="camera-outline" variant="secondary" size="sm" onPress={() => pickPhoto("camera")} />
                <Button testID="cx-photo-library" label="Galería" icon="images-outline" variant="secondary" size="sm" onPress={() => pickPhoto("library")} />
              </View>
              {photoUri ? (
                <Pressable accessibilityRole="button" onPress={() => setPhotoUri(null)} style={{ flexDirection: "row", alignItems: "center", gap: space.xs, alignSelf: "flex-start" }}>
                  <Icon name="trash-outline" size="xs" color="muted" />
                  <Text variant="caption" color="muted">
                    Quitar foto
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </FieldGroup>
        <FieldGroup label="Músculo principal">
          {GROUP_ORDER.map((g) => (
            <View key={g} style={{ gap: space.xs }}>
              <Text variant="caption" color="faint">
                {GROUP_LABEL[g]}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {MUSCLES_BY_GROUP[g].map((m) => (
                  <Chip key={m} testID={`cx-muscle-${m}`} label={MUSCLE_LABEL[m]} selected={primary === m} onPress={() => setPrimary(m)} />
                ))}
              </View>
            </View>
          ))}
          {tried && !primary ? (
            <Text variant="caption" color="danger">
              Elige el músculo principal
            </Text>
          ) : null}
        </FieldGroup>
        <FieldGroup label="Equipo">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {(Object.keys(EQUIPMENT_LABEL) as Equipment[]).map((q) => (
              <Chip key={q} label={EQUIPMENT_LABEL[q]} selected={equipment === q} onPress={() => setEquipment(q)} />
            ))}
          </View>
        </FieldGroup>
        <FieldGroup label="Cómo se registra">
          <SegmentedControl<ExerciseKind>
            value={kind}
            onChange={setKind}
            options={[
              { value: "weight_reps", label: "Peso y reps" },
              { value: "bodyweight", label: "P. corporal" },
              { value: "duration", label: "Duración" },
            ]}
          />
        </FieldGroup>
        <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center", flexWrap: "wrap" }}>
          <Chip label="Ejercicio compuesto (más descanso)" icon={compound ? "checkbox" : "square-outline"} selected={compound} onPress={() => setCompound((v) => !v)} />
        </View>
      </View>
    </Screen>
  );
}
