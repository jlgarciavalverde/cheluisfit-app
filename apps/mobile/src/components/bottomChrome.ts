// Lo que flota abajo (barra «Entrenamiento en curso» y burbuja del asistente) y lo que queda fijo
// debajo (barra de pestañas o pie de la pantalla, p. ej. «Guardar cambios»).
//
// Antes las dos capas flotantes se ponían siempre a 68 dp del borde, como si hubiera barra de
// pestañas: en una pantalla con pie quedaban encima del botón y tapaban el final del contenido
// (visto en el móvil: el editor de rutina con un entreno abierto, con «Notas» y «Eliminar rutina»
// inalcanzables). Ahora cada `Screen` enfocada publica el alto de lo fijo, y lo flotante se pone
// justo encima.
import { create } from "zustand";
import { space } from "@/theme/tokens";

/** Alto de la barra de pestañas sin el área segura. */
export const TAB_BAR_HEIGHT = 60;
/** Separación entre lo fijo y lo que flota. */
export const FLOAT_GAP = space.sm;
/** Alto de la barra de entreno en curso más su separación (lo que sube la burbuja si está). */
export const WORKOUT_BAR_SPACE = 68;
/** Hueco que deja el contenido para cada capa flotante. */
export const WORKOUT_BAR_PAD = 76;
export const AI_BUBBLE_PAD = 72;

export const useBottomChrome = create<{ height: number; setHeight: (h: number) => void }>((set) => ({
  height: TAB_BAR_HEIGHT,
  setHeight: (height) => set((s) => (s.height === height ? s : { height })),
}));

/** El entreno en curso a pantalla completa (no su resumen ni su detalle). */
export function isLiveWorkoutPath(pathname: string): boolean {
  return /^\/entreno\/[^/]+$/.test(pathname) && !pathname.startsWith("/entreno/resumen") && !pathname.startsWith("/entreno/detalle");
}

/** La barra de entreno en curso se ve en todas partes salvo en las pantallas del propio entreno. */
export function showsWorkoutBar(pathname: string): boolean {
  return !pathname.startsWith("/entreno/");
}
