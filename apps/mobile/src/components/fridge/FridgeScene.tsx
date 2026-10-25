/* eslint-disable react/no-unknown-property -- props de react-three-fiber (position, args…), no del DOM */
// Escena 3D de la Nevera: carcasa hueca, congelador, baldas de cristal, cajones y puerta con
// estantes, montada solo con primitivas (sin modelos que descargar). Cada alimento es una forma
// según su categoría (`shapeFor`), colocada con `itemPosition` de `domain/fridge.ts`. La cámara
// orbita alrededor de la nevera según `view` (lo controla `Fridge3D.tsx` con gestos y botones).
import { useRef } from "react";
import type { Group, PerspectiveCamera } from "three";
import { FRIDGE_DIMS, itemPosition, shapeFor, shelfHeights, type FridgeItem, type FridgeLayout, type ItemShape } from "@/domain/fridge";
import { fridgeScene } from "@/theme/tokens";
import { useFrame } from "./FridgeCanvas";

export interface FridgeView {
  /** Giro horizontal alrededor de la nevera (radianes, 0 = de frente). */
  yaw: number;
  /** Inclinación (radianes, positivo = desde arriba). */
  pitch: number;
  /** Distancia de la cámara al centro. */
  distance: number;
}

export const VIEW_LIMITS = { yaw: 1.2, pitchMin: -0.15, pitchMax: 0.6, distMin: 12, distMax: 36 } as const;
export const DEFAULT_VIEW: FridgeView = { yaw: -0.5, pitch: 0.2, distance: 31 };

const D = FRIDGE_DIMS;
const TARGET_Y = D.height / 2;
/** Con la puerta abierta el conjunto ocupa más a la derecha: la cámara mira algo desplazada. */
const TARGET_X = 1.8;
const DOOR_OPEN = (100 * Math.PI) / 180;

/** Medidas (ancho, alto, fondo) de cada forma: con ellas se apoya en la balda, no flota ni se hunde. */
const SHAPE_SIZE: Record<ItemShape, [number, number, number]> = {
  bottle: [0.6, 1.5, 0.6],
  carton: [0.75, 1.3, 0.75],
  box: [1, 0.6, 0.8],
  round: [0.85, 0.85, 0.85],
  jar: [0.7, 0.7, 0.7],
  tray: [1.3, 0.4, 0.9],
};

function ItemMesh({ item, layout, selected, onSelect, inDoor }: { item: FridgeItem; layout: FridgeLayout; selected: boolean; onSelect: (id: string) => void; inDoor: boolean }) {
  const shape = shapeFor(item.category);
  const [w, h, d] = SHAPE_SIZE[shape];
  const [x, y, z] = itemPosition(item, layout);
  // Dentro de la puerta: coordenadas relativas a la bisagra (ver `Door`).
  const pos: [number, number, number] = inDoor ? [x - D.width / 2, y + h / 2, -D.doorDepth / 2 - 0.05] : [x, y + h / 2, z];
  const color = fridgeScene.category[item.category];
  const scale = selected ? 1.3 : 1;
  const material = <meshStandardMaterial color={color} roughness={0.55} emissive={color} emissiveIntensity={selected ? 0.6 : 0} />;
  const select = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    onSelect(item.id);
  };
  return (
    <group position={pos} scale={scale}>
      {shape === "bottle" || shape === "jar" ? (
        <mesh onClick={select}>
          <cylinderGeometry args={[w / 2, w / 2, h, 20]} />
          {material}
        </mesh>
      ) : shape === "round" ? (
        <mesh onClick={select}>
          <sphereGeometry args={[w / 2, 20, 16]} />
          {material}
        </mesh>
      ) : (
        <mesh onClick={select}>
          <boxGeometry args={[w, h, d]} />
          {material}
        </mesh>
      )}
      {shape === "bottle" ? (
        <mesh position={[0, h / 2 + 0.12, 0]}>
          <cylinderGeometry args={[0.12, 0.12, 0.25, 12]} />
          <meshStandardMaterial color={color} roughness={0.4} />
        </mesh>
      ) : null}
    </group>
  );
}

function Panel({ size, position, color, opacity = 1 }: { size: [number, number, number]; position: [number, number, number]; color: string; opacity?: number }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial color={color} roughness={0.7} transparent={opacity < 1} opacity={opacity} />
    </mesh>
  );
}

/** Puerta(s) con bisagra a la derecha: el grupo está en la bisagra y se gira sobre Y. */
function Door({ open, scheme, layout, items, selectedId, onSelect, instant }: { open: boolean; scheme: "light" | "dark"; layout: FridgeLayout; items: FridgeItem[]; selectedId: string | null; onSelect: (id: string) => void; instant: boolean }) {
  const ref = useRef<Group>(null);
  const col = fridgeScene[scheme];
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const target = open ? DOOR_OPEN : 0;
    g.rotation.y = instant ? target : g.rotation.y + (target - g.rotation.y) * 0.15;
  });
  const bodyBottom = D.wall + layout.drawers * D.drawerH;
  const bodyTop = D.height - D.freezerH;
  const mainH = D.height - D.freezerH;
  const span = (bodyTop - bodyBottom) / layout.doorShelves;
  return (
    <group ref={ref} position={[D.width / 2, 0, D.depth / 2]}>
      {/* Puerta principal y del congelador (una rendija entre las dos). */}
      <Panel size={[D.width, mainH - 0.05, 0.3]} position={[-D.width / 2, mainH / 2, 0.15]} color={col.body} />
      <Panel size={[D.width, D.freezerH - 0.05, 0.3]} position={[-D.width / 2, mainH + D.freezerH / 2, 0.15]} color={col.body} />
      {/* Tiradores. */}
      <Panel size={[0.18, 1.6, 0.25]} position={[-D.width + 0.4, mainH - 1.3, 0.42]} color={col.edge} />
      <Panel size={[0.18, 0.9, 0.25]} position={[-D.width + 0.4, mainH + 0.7, 0.42]} color={col.edge} />
      {/* Estantes de la puerta (cara interior). */}
      {Array.from({ length: layout.doorShelves }, (_, i) => (
        <group key={i}>
          <Panel size={[D.width - 0.6, 0.08, D.doorDepth]} position={[-D.width / 2, bodyTop - (i + 1) * span, -D.doorDepth / 2]} color={col.glass} opacity={0.5} />
          <Panel size={[D.width - 0.6, 0.45, 0.06]} position={[-D.width / 2, bodyTop - (i + 1) * span + 0.25, -D.doorDepth + 0.03]} color={col.glass} opacity={0.35} />
        </group>
      ))}
      {items.map((it) => (
        <ItemMesh key={it.id} item={it} layout={layout} selected={it.id === selectedId} onSelect={onSelect} inDoor />
      ))}
    </group>
  );
}

function CameraRig({ view, instant }: { view: FridgeView; instant: boolean }) {
  useFrame(({ camera }) => {
    const cam = camera as PerspectiveCamera;
    const tx = TARGET_X + Math.sin(view.yaw) * Math.cos(view.pitch) * view.distance;
    const ty = TARGET_Y + Math.sin(view.pitch) * view.distance;
    const tz = Math.cos(view.yaw) * Math.cos(view.pitch) * view.distance;
    const k = instant ? 1 : 0.18;
    cam.position.set(cam.position.x + (tx - cam.position.x) * k, cam.position.y + (ty - cam.position.y) * k, cam.position.z + (tz - cam.position.z) * k);
    cam.lookAt(TARGET_X, TARGET_Y - 0.5, 0);
  });
  return null;
}

export function FridgeScene({
  items,
  layout,
  view,
  doorOpen,
  selectedId,
  onSelect,
  scheme,
  instant,
}: {
  items: FridgeItem[];
  layout: FridgeLayout;
  view: FridgeView;
  doorOpen: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  scheme: "light" | "dark";
  /** «Reducir movimiento»: sin transiciones suaves de cámara ni de puerta. */
  instant: boolean;
}) {
  const col = fridgeScene[scheme];
  const bodyBottom = D.wall + layout.drawers * D.drawerH;
  const bodyTop = D.height - D.freezerH;
  const innerW = D.width - 2 * D.wall;
  const shelfDepth = D.depth - D.doorDepth - D.wall;
  const shelfZ = -D.depth / 2 + D.wall + shelfDepth / 2;
  const bodyItems = items.filter((i) => i.zone !== "door");
  const doorItems = items.filter((i) => i.zone === "door");

  return (
    <>
      <color attach="background" args={[col.background]} />
      <ambientLight intensity={1.1} />
      <hemisphereLight args={[col.light, col.edge, 0.6]} />
      <directionalLight position={[-6, 14, 12]} intensity={1.4} />
      <directionalLight position={[8, 6, 4]} intensity={0.5} />
      {/* Luz interior: se enciende al abrir, como una nevera de verdad. */}
      {doorOpen ? <pointLight position={[0, bodyTop - 0.6, 0.5]} intensity={18} distance={14} color={col.light} /> : null}
      <CameraRig view={view} instant={instant} />

      {/* Carcasa hueca: fondo, laterales, techo y suelo. */}
      <Panel size={[D.width, D.height, D.wall]} position={[0, D.height / 2, -D.depth / 2 + D.wall / 2]} color={col.inner} />
      <Panel size={[D.wall, D.height, D.depth]} position={[-D.width / 2 + D.wall / 2, D.height / 2, 0]} color={col.body} />
      <Panel size={[D.wall, D.height, D.depth]} position={[D.width / 2 - D.wall / 2, D.height / 2, 0]} color={col.body} />
      <Panel size={[D.width, D.wall, D.depth]} position={[0, D.height - D.wall / 2, 0]} color={col.body} />
      <Panel size={[D.width, D.wall, D.depth]} position={[0, D.wall / 2, 0]} color={col.body} />
      {/* Separación del congelador. */}
      <Panel size={[innerW, 0.25, D.depth - D.wall]} position={[0, bodyTop, D.wall / 2]} color={col.edge} />

      {/* Baldas de cristal. */}
      {shelfHeights(layout)
        .slice(0, -1)
        .map((y, i) => (
          <Panel key={i} size={[innerW, 0.08, shelfDepth]} position={[0, y, shelfZ]} color={col.glass} opacity={0.45} />
        ))}
      {/* Cajones: frente translúcido para ver lo que hay dentro. */}
      {Array.from({ length: layout.drawers }, (_, i) => {
        const y = bodyBottom - (i + 1) * D.drawerH;
        return (
          <group key={i}>
            <Panel size={[innerW - 0.2, 0.08, shelfDepth]} position={[0, y + 0.05, shelfZ]} color={col.drawer} />
            <Panel size={[innerW - 0.2, D.drawerH - 0.25, 0.08]} position={[0, y + D.drawerH / 2, shelfZ + shelfDepth / 2]} color={col.drawer} opacity={0.35} />
          </group>
        );
      })}
      <Panel size={[innerW, 0.12, shelfDepth]} position={[0, bodyBottom, shelfZ]} color={col.glass} opacity={0.5} />

      {bodyItems.map((it) => (
        <ItemMesh key={it.id} item={it} layout={layout} selected={it.id === selectedId} onSelect={onSelect} inDoor={false} />
      ))}
      <Door open={doorOpen} scheme={scheme} layout={layout} items={doorItems} selectedId={selectedId} onSelect={onSelect} instant={instant} />
    </>
  );
}
