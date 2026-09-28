import { expect, test } from "./fixtures";

// Viewport de escritorio (≥1024px = `isWide` en `theme/tokens.ts`): los demás specs corren a
// 390×844 y nunca ejercitan la barra lateral persistente ni `WorkoutBar` fuera de `(tabs)`.
// Nota: no se usa `getByRole("tablist")` a secas porque `SegmentedControl` también lo usa
// (ambiguo en pantallas con pestañas internas) — se identifica la barra por sus `testID`.
test.use({ viewport: { width: 1280, height: 800 } });

test.describe("Escritorio · barra lateral persistente", () => {
  test("la barra lateral es visible en la pestaña principal", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("tab-fuerza")).toBeVisible();
    await expect(page.getByTestId("tab-mas")).toBeVisible();
  });

  test("navegar entre pestañas con la barra lateral", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("tab-running").click();
    await expect(page).toHaveURL(/\/running/);
    await page.getByTestId("tab-index").click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("la barra lateral sigue visible al entrar en una pantalla de detalle (objetivo)", async ({ page }) => {
    await page.goto("/objetivo");
    await expect(page.getByTestId("tab-mas")).toBeVisible();
    await page.getByTestId("tab-mas").click();
    await expect(page).toHaveURL(/\/mas/);
  });

  test("la barra lateral sigue visible al entrar en una sesión de running", async ({ page }) => {
    await page.goto("/sesion/act-3");
    await expect(page.getByTestId("tab-running")).toBeVisible();
  });

  test("la barra lateral sigue visible dentro del entrenamiento en curso", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByTestId("start-empty").click();
    await expect(page.getByTestId("screen-entreno")).toBeVisible();
    await expect(page.getByTestId("tab-fuerza")).toBeVisible();
  });

  test("la barra «Entrenamiento en curso» es visible fuera del entrenamiento", async ({ page }) => {
    await page.goto("/fuerza");
    await page.getByTestId("start-empty").click();
    await expect(page.getByTestId("screen-entreno")).toBeVisible();
    await page.getByTestId("tab-running").click();
    await expect(page.getByTestId("workout-bar")).toBeVisible();
  });
});
