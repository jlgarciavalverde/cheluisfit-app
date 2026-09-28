import { useReducedMotion } from "react-native-reanimated";

/** Duración de animación que respeta «reducir movimiento» del sistema. */
export function useDuration(ms: number): number {
  return useReducedMotion() ? 0 : ms;
}
