import { useEffect, useState } from "react";
import { useActiveWorkout } from "./activeWorkoutStore";
import { useAuth } from "./authStore";
import { useOnboarding } from "./onboardingStore";
import { useRunning } from "./runningStore";
import { useStrength } from "./strengthStore";
import { useNutrition } from "./store";

const stores = [useNutrition, useRunning, useStrength, useActiveWorkout, useAuth, useOnboarding];

/**
 * `true` cuando todos los almacenes persistidos han cargado lo guardado.
 * Hasta entonces las pantallas verían los datos de ejemplo en su primer dibujado
 * (y los formularios que copian el estado a su `useState` se quedarían con ellos).
 */
export function useStoresHydrated(): boolean {
  const [ready, setReady] = useState(() => stores.every((s) => s.persist.hasHydrated()));
  useEffect(() => {
    if (ready) return;
    const check = () => setReady(stores.every((s) => s.persist.hasHydrated()));
    const unsubs = stores.map((s) => s.persist.onFinishHydration(check));
    check();
    return () => unsubs.forEach((u) => u());
  }, [ready]);
  return ready;
}
