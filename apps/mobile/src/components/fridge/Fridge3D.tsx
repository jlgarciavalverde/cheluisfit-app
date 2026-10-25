// Vista 3D de la Nevera: el lienzo (`FridgeCanvas`, WebGL en la web y expo-gl en el móvil) más los
// gestos y los botones. Arrastrar con un dedo gira la cámara (acotado, para no perder la nevera de
// vista), pellizcar acerca o aleja, y tocar un alimento lo selecciona. Los botones de abajo hacen
// lo mismo sin gestos (accesibilidad). Se carga diferida desde `nevera.tsx` (`React.lazy`).
import { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, View, type GestureResponderEvent } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { IconButton } from "@/components/ui";
import { groupByPlace, type Fridge } from "@/domain/fridge";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { Canvas } from "./FridgeCanvas";
import { DEFAULT_VIEW, FridgeScene, VIEW_LIMITS, type FridgeView } from "./FridgeScene";

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function touchDistance(e: GestureResponderEvent): number | null {
  const t = e.nativeEvent.touches;
  if (!t || t.length < 2) return null;
  return Math.hypot(t[0].pageX - t[1].pageX, t[0].pageY - t[1].pageY);
}

/** Resumen por sitios para el lector de pantalla (la escena en sí no es accesible). */
export function fridgeA11ySummary(fridge: Fridge): string {
  if (fridge.items.length === 0) return "Nevera vacía";
  return `Nevera en 3D. ${groupByPlace(fridge.items)
    .map((g) => `${g.label}: ${g.items.map((i) => i.name).join(", ")}`)
    .join(". ")}.`;
}

export default function Fridge3D({ fridge, selectedId, onSelect, height = 420 }: { fridge: Fridge; selectedId: string | null; onSelect: (id: string | null) => void; height?: number }) {
  const { c, scheme } = useTheme();
  const reduce = useReducedMotion();
  const [view, setView] = useState<FridgeView>(DEFAULT_VIEW);
  const [doorOpen, setDoorOpen] = useState(true);
  const start = useRef({ view: DEFAULT_VIEW, pinch: null as number | null });
  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  // Los manejadores solo leen las refs al moverse el dedo, nunca al pintar.
  // eslint-disable-next-line react-hooks/refs
  const pan = useMemo(
    () =>
      PanResponder.create({
        // Solo se queda el gesto al moverse: un toque quieto llega al lienzo y selecciona.
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 4 || Math.abs(g.dy) > 4 || g.numberActiveTouches > 1,
        onPanResponderGrant: (e) => {
          start.current = { view: viewRef.current, pinch: touchDistance(e) };
        },
        onPanResponderMove: (e, g) => {
          const s = start.current;
          const dist = touchDistance(e);
          if (dist != null) {
            if (s.pinch == null) s.pinch = dist;
            const distance = clamp((s.view.distance * s.pinch) / dist, VIEW_LIMITS.distMin, VIEW_LIMITS.distMax);
            setView((v) => ({ ...v, distance }));
            return;
          }
          setView({
            ...s.view,
            yaw: clamp(s.view.yaw - g.dx * 0.008, -VIEW_LIMITS.yaw, VIEW_LIMITS.yaw),
            pitch: clamp(s.view.pitch + g.dy * 0.004, VIEW_LIMITS.pitchMin, VIEW_LIMITS.pitchMax),
          });
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [],
  );

  const zoom = (factor: number) => setView((v) => ({ ...v, distance: clamp(v.distance * factor, VIEW_LIMITS.distMin, VIEW_LIMITS.distMax) }));
  const turn = (delta: number) => setView((v) => ({ ...v, yaw: clamp(v.yaw + delta, -VIEW_LIMITS.yaw, VIEW_LIMITS.yaw) }));

  return (
    <View style={{ gap: space.sm }}>
      <View
        testID="fridge-3d"
        accessible
        accessibilityRole="image"
        accessibilityLabel={fridgeA11ySummary(fridge)}
        style={{ height, borderRadius: radius.lg, overflow: "hidden", backgroundColor: c.surfaceAlt }}
        {...pan.panHandlers}
      >
        <Canvas camera={{ fov: 40, position: [0, 9, 19], near: 0.1, far: 100 }} onPointerMissed={() => onSelect(null)}>
          <FridgeScene
            items={fridge.items}
            layout={fridge.layout}
            view={view}
            doorOpen={doorOpen}
            selectedId={selectedId}
            onSelect={(id) => onSelect(id === selectedId ? null : id)}
            scheme={scheme}
            instant={!!reduce}
          />
        </Canvas>
      </View>
      <View style={{ flexDirection: "row", justifyContent: "center", gap: space.xs, flexWrap: "wrap" }}>
        <IconButton testID="fridge-turn-left" icon="arrow-back" label="Girar a la izquierda" size="md" onPress={() => turn(0.35)} />
        <IconButton testID="fridge-turn-right" icon="arrow-forward" label="Girar a la derecha" size="md" onPress={() => turn(-0.35)} />
        <IconButton testID="fridge-zoom-in" icon="add" label="Acercar" size="md" onPress={() => zoom(0.85)} />
        <IconButton testID="fridge-zoom-out" icon="remove" label="Alejar" size="md" onPress={() => zoom(1.18)} />
        <IconButton testID="fridge-door" icon={doorOpen ? "contract-outline" : "expand-outline"} label={doorOpen ? "Cerrar la puerta" : "Abrir la puerta"} size="md" onPress={() => setDoorOpen((o) => !o)} />
        <IconButton testID="fridge-reset-view" icon="refresh" label="Volver a la vista inicial" size="md" onPress={() => setView(DEFAULT_VIEW)} />
      </View>
    </View>
  );
}
