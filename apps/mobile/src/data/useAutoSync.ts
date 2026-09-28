import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useActiveWorkout } from "./activeWorkoutStore";
import { useAuth } from "./authStore";
import { useRunning } from "./runningStore";
import { useStrength } from "./strengthStore";
import { useNutrition } from "./store";
import { syncNow } from "./sync";

/** Como mucho una sincronización por minuto al volver a primer plano. */
const MIN_INTERVAL_MS = 60_000;
/** Tras un cambio, espera a que la persona pare un momento antes de subir. */
const CHANGE_DEBOUNCE_MS = 15_000;

/**
 * Sincroniza con sesión iniciada:
 * - al entrar y cada vez que la app vuelve a primer plano (máximo una vez por minuto);
 * - al pasar a segundo plano (sin límite: es la última oportunidad antes de que el sistema la
 *   congele; en la web, `AppState` lo emite al ocultar la pestaña);
 * - ~15 s después del último cambio en cualquiera de las tiendas sincronizadas.
 * **No** mientras `syncing` esté activo: justo tras `login()`/`register()` (`authStore.ts`) hay
 * una carga inicial en marcha, y los cambios que provoca esa misma carga (rehidratar) no cuentan.
 */
export function useAutoSync() {
  const token = useAuth((s) => s.token);
  const last = useRef(0);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = (force = false) => {
    const s = useAuth.getState();
    if (!s.token || s.syncing) return;
    const now = Date.now();
    if (!force && now - last.current < MIN_INTERVAL_MS) return;
    last.current = now;
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    syncNow().catch(() => {}); // el error queda en `useAuth().syncError` para mostrarlo si hace falta
  };

  useEffect(() => {
    if (token) trigger(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") trigger();
      else if (state === "background") trigger(true);
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onChange = () => {
      const s = useAuth.getState();
      if (!s.token || s.syncing) return;
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => trigger(true), CHANGE_DEBOUNCE_MS);
    };
    const subs = [useNutrition.subscribe(onChange), useRunning.subscribe(onChange), useStrength.subscribe(onChange), useActiveWorkout.subscribe(onChange)];
    return () => {
      subs.forEach((unsub) => unsub());
      if (pending.current) clearTimeout(pending.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
