// Si esto viviera en `authStore` (en memoria en web, sin `SecureStore` ahí — ver authStore.ts),
// cada recarga de página en web (y cada `page.goto()` de los e2e) volvería a verlo en `false` y
// redirigiría a `/cuenta` en bucle. Aparte, sobre AsyncStorage (== `localStorage` en web): una
// recarga de verdad no debe repetir la bienvenida.
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { guardedJSONStorage, guardRehydrate } from "./persistSafety";

interface OnboardingState {
  /** `true` en cuanto la persona ha entrado, se ha registrado, o ha elegido «seguir sin cuenta». */
  seen: boolean;
  markSeen: () => void;
}

export const useOnboarding = create<OnboardingState>()(
  persist(
    (set) => ({
      seen: false,
      markSeen: () => set({ seen: true }),
    }),
    {
      name: "cf_onboarding_v1",
      storage: guardedJSONStorage(),
      onRehydrateStorage: guardRehydrate("cf_onboarding_v1"),
    },
  ),
);
