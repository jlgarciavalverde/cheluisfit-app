import { expect, test } from "./fixtures";

/**
 * La racha de «Hoy» (`domain/streak.ts`) junta las fechas de las tres tiendas (comidas,
 * carreras, entrenos de fuerza). Con los datos de ejemplo hay registro los últimos 7 días
 * seguidos (entradas de comida de hoy a hace 6, más carreras/entrenos dentro de esa ventana),
 * así que el badge se ve con «7 días seguidos».
 */
test.describe("Hoy", () => {
  test("la racha se ve con los datos de ejemplo", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("screen-hoy")).toBeVisible();
    await expect(page.getByTestId("streak-badge")).toContainText("7 días seguidos");
  });

  test("sin nada registrado no se muestra ninguna racha", async ({ page }) => {
    // Versión 0 (vieja) fuerza el `migrate` genérico de cada tienda: parte de `initial()` — los
    // datos de ejemplo — y lo que venga en `state` pisa encima. Dejando las listas de fechas a
    // cero, las tres tiendas arrancan vacías de verdad.
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem("cf_nutrition_v1", JSON.stringify({ state: { entries: [] }, version: 0 }));
        window.localStorage.setItem("cf_running_v1", JSON.stringify({ state: { activities: [] }, version: 0 }));
        window.localStorage.setItem("cf_strength_v1", JSON.stringify({ state: { workouts: [] }, version: 0 }));
      } catch {
        // sin almacenamiento no hay nada que vaciar — el assert de abajo lo dirá
      }
    });
    await page.goto("/");
    await expect(page.getByTestId("screen-hoy")).toBeVisible();
    await expect(page.getByTestId("streak-badge")).toHaveCount(0);
  });
});
