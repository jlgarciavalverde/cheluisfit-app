import { useEffect, useState } from "react";
import { useActiveWorkout } from "./activeWorkoutStore";
import { useAuth } from "./authStore";
import { useOnboarding } from "./onboardingStore";
import { hydrationFailed, markHydrationFailed, onHydrationFailure } from "./persistSafety";
import { useRunning } from "./runningStore";
import { useStrength } from "./strengthStore";
import { useNutrition } from "./store";

const stores = [useNutrition, useRunning, useStrength, useActiveWorkout, useAuth, useOnboarding];

/** Como mucho esto de pantalla de carga: un almacenamiento atascado no debe dejar la app en blanco. */
const HYDRATION_TIMEOUT_MS = 5000;

const done = (s: (typeof stores)[number]) => s.persist.hasHydrated() || hydrationFailed(s.persist.getOptions().name ?? "");

/**
 * `true` cuando todos los almacenes persistidos han cargado lo guardado **o han fallado** (ver
 * `persistSafety.ts`). Hasta entonces las pantallas verían los datos de ejemplo en su primer
 * dibujado (y los formularios que copian el estado a su `useState` se quedarían con ellos).
 * Si algo sigue sin cargar a los 5 s, se da por fallido: la app arranca y la sincronización no
 * sube esa tienda por encima de la cuenta.
 */
export function useStoresHydrated(): boolean {
  const [ready, setReady] = useState(() => stores.every(done));
  useEffect(() => {
    if (ready) return;
    const check = () => setReady(stores.every(done));
    const unsubs = [...stores.map((s) => s.persist.onFinishHydration(check)), onHydrationFailure(check)];
    const timeout = setTimeout(() => {
      for (const s of stores) if (!done(s)) markHydrationFailed(s.persist.getOptions().name ?? "?", "tiempo agotado");
      check();
    }, HYDRATION_TIMEOUT_MS);
    check();
    return () => {
      unsubs.forEach((u) => u());
      clearTimeout(timeout);
    };
  }, [ready]);
  return ready;
}
