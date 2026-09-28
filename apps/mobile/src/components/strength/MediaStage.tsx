import { useEventListener } from "expo";
import { Image } from "expo-image";
import { VideoView, useVideoPlayer } from "expo-video";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import type { Exercise } from "@/domain/strength";
import { useTheme } from "@/theme/ThemeProvider";
import { radius } from "@/theme/tokens";
import { Icon } from "../ui/Icon";

function VideoStage({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  useEventListener(player, "statusChange", () => {});
  return <VideoView player={player} nativeControls={false} contentFit="cover" allowsPictureInPicture={false} style={{ width: "100%", height: "100%" }} />;
}

/** Las 2 fotos (posición inicial y final) alternando: efecto GIF sin archivos extra. */
function FrameStage({ frames, label }: { frames: string[]; label: string }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce || frames.length < 2) return;
    const t = setInterval(() => setI((x) => (x + 1) % frames.length), 950);
    return () => clearInterval(t);
  }, [reduce, frames.length]);
  return (
    <Image
      source={{ uri: frames[i] }}
      contentFit="cover"
      transition={reduce ? 0 : 280}
      accessibilityLabel={label}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

/**
 * GIF animado (ExerciseDB, 180×180): entero y centrado (`contain`; recortarlo lo estropea) y sin
 * el ciclo de fotogramas. Con «reducir movimiento», parado en su primer fotograma. Caché en disco:
 * se descarga una vez por ejercicio.
 */
function GifStage({ uri, label }: { uri: string; label: string }) {
  const reduce = useReducedMotion();
  return (
    <Image
      testID="exercise-gif"
      source={{ uri }}
      contentFit="contain"
      autoplay={!reduce}
      cachePolicy="disk"
      accessibilityLabel={label}
      style={{ width: "100%", height: "100%" }}
    />
  );
}

/** Foto/GIF/vídeo del ejercicio: vídeo propio → fotos alternando → GIF → marcador. */
export function MediaStage({
  exercise,
  height = 190,
  onPress,
  rounded = true,
}: {
  exercise: Pick<Exercise, "name" | "frames" | "video" | "gif">;
  height?: number;
  onPress?: () => void;
  rounded?: boolean;
}) {
  const { c } = useTheme();
  const label = `Demostración de ${exercise.name}`;
  const body = (
    <View
      style={{
        height,
        width: "100%",
        overflow: "hidden",
        borderRadius: rounded ? radius.lg : 0,
        backgroundColor: c.mediaBg, // las fotos del catálogo tienen fondo claro
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {exercise.video ? (
        <VideoStage uri={exercise.video} />
      ) : exercise.frames && exercise.frames.length > 0 ? (
        <FrameStage frames={exercise.frames} label={label} />
      ) : exercise.gif ? (
        <GifStage uri={exercise.gif} label={label} />
      ) : (
        <View style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceAlt }}>
          <Icon name="barbell-outline" size="hero" color="faint" />
        </View>
      )}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}. Ampliar`} onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>
      {body}
    </Pressable>
  );
}

/** Miniatura cuadrada (primera foto o vídeo no: solo foto/placeholder para listas ligeras). */
export function ExerciseThumb({ exercise, size = 56 }: { exercise: Pick<Exercise, "name" | "frames" | "gif">; size?: number }) {
  const { c } = useTheme();
  return (
    <View
      style={{ width: size, height: size, borderRadius: radius.md, overflow: "hidden", backgroundColor: c.mediaBg, alignItems: "center", justifyContent: "center" }}
    >
      {exercise.frames?.[0] ? (
        <Image source={{ uri: exercise.frames[0] }} contentFit="cover" accessibilityLabel={exercise.name} style={{ width: "100%", height: "100%" }} />
      ) : exercise.gif ? (
        // Parado: una lista de 50 ejercicios no debe reproducir 50 GIF a la vez.
        <Image source={{ uri: exercise.gif }} contentFit="contain" autoplay={false} cachePolicy="disk" accessibilityLabel={exercise.name} style={{ width: "100%", height: "100%" }} />
      ) : (
        <Icon name="barbell-outline" size={size >= 56 ? "lg" : "md"} color="faint" />
      )}
      <View pointerEvents="none" style={{ position: "absolute", inset: 0, borderRadius: radius.md, borderWidth: 1, borderColor: c.border }} />
    </View>
  );
}
