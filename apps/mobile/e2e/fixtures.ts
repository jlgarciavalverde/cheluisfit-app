import { test as base, expect } from "@playwright/test";

/**
 * Desde que existe la redirección al primer arranque (`_layout.tsx`: sin sesión y sin
 * `cf_onboarding_v1` → `/cuenta`), cualquier spec que navegue sin sesión iniciada necesita que
 * esa marca ya esté puesta — si no, cada `page.goto()` aterrizaría en `/cuenta` en vez de en la
 * ruta pedida. `AsyncStorage` en web escribe tal cual en `localStorage` (sin envoltorio propio,
 * comprobado en el paquete instalado), y zustand `persist` guarda `{state, version}` — de ahí el
 * formato exacto de abajo. Los specs que SÍ quieren probar el flujo de bienvenida (`cuenta.spec.ts`)
 * usan el `test` normal de `@playwright/test`, no este.
 */
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("cf_onboarding_v1", JSON.stringify({ state: { seen: true }, version: 0 }));
      } catch {
        // almacenamiento no disponible (p. ej. contexto privado) — sin marca, algún test vería
        // la redirección a /cuenta, pero no merece la pena que esto rompa la propia sesión de test.
      }
    });
    await use(page);
  },
});

export { expect };
