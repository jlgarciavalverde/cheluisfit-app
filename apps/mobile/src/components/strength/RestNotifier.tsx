import { useEffect, useRef } from "react";
import { toast } from "@/components/ui/Toast";
import { haptic } from "@/components/ui/haptics";
import { useActiveWorkout } from "@/data/activeWorkoutStore";
import { isRestOver } from "@/domain/strength";
import { isRestScreenVisible, notificationsAvailable } from "@/lib/notifications";
import { cancelRestNotification, scheduleRestNotification } from "@/lib/restTimer";
import { useNow } from "@/lib/useNow";

/**
 * Sin interfaz, siempre montado (`_layout.tsx`): mantiene programada la notificación de fin de
 * descanso mientras haya un temporizador activo, y la cancela o reprograma al cambiarlo (±15 s,
 * saltar, terminar). El id es fijo (ver `lib/restTimer.ts`), así que sobrevive a cerrar la app.
 * Donde no hay notificaciones reales (web, Expo Go) y no se está viendo la barra de descanso,
 * avisa aquí con vibración y un toast — antes, fuera de la pantalla del entreno no avisaba nadie.
 */
export function RestNotifier() {
  const rest = useActiveWorkout((s) => s.rest);
  const workout = useActiveWorkout((s) => s.workout);
  const current = useActiveWorkout((s) => s.current);
  const key = rest ? `${rest.startedAt}:${rest.endsAt}` : "";
  const name = workout?.exercises[current]?.name;
  const now = useNow(1000, !!rest && !notificationsAvailable());
  const alerted = useRef<number | null>(null);

  useEffect(() => {
    if (!rest) {
      cancelRestNotification().catch(() => {});
      return;
    }
    scheduleRestNotification(rest.endsAt, name ? `Toca la siguiente serie de ${name}.` : "Toca la siguiente serie.").catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!rest || notificationsAvailable() || isRestScreenVisible()) return;
    if (isRestOver(rest, now) && alerted.current !== rest.endsAt) {
      alerted.current = rest.endsAt;
      haptic.success();
      toast(name ? `Descanso terminado: toca ${name}` : "Descanso terminado");
    }
  }, [rest, now, name]);

  return null;
}
