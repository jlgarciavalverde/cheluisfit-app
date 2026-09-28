import { useEffect, useRef } from "react";
import { useActiveWorkout } from "@/data/activeWorkoutStore";
import { cancelRestNotification, scheduleRestNotification } from "@/lib/restTimer";

/**
 * Sin interfaz: mantiene programada la notificación de fin de descanso mientras haya
 * un temporizador activo, y la cancela o reprograma al cambiarlo (±15 s, saltar, terminar).
 */
export function RestNotifier() {
  const rest = useActiveWorkout((s) => s.rest);
  const workout = useActiveWorkout((s) => s.workout);
  const current = useActiveWorkout((s) => s.current);
  const id = useRef<string | null>(null);
  const key = rest ? `${rest.startedAt}:${rest.endsAt}` : "";
  const name = workout?.exercises[current]?.name;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prev = id.current;
      id.current = null;
      await cancelRestNotification(prev);
      if (cancelled || !rest) return;
      const next = await scheduleRestNotification(rest.endsAt, name ? `Toca la siguiente serie de ${name}.` : "Toca la siguiente serie.");
      if (cancelled) await cancelRestNotification(next);
      else id.current = next;
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}
