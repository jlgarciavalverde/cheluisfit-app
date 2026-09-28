import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * El escáner llama a Open Food Facts en vivo cuando no encuentra el código en local
 * (`src/data/offClient.ts`) — se intercepta para no depender de la red real en los tests.
 */
async function mockOff(page: Page, handler: (route: Route) => Promise<void> | void) {
  await page.route("https://world.openfoodfacts.org/**", handler);
}

/** El buscador de texto consulta USDA FoodData Central en vivo (`src/data/usdaClient.ts`). */
async function mockUsda(page: Page, handler: (route: Route) => Promise<void> | void) {
  await page.route("https://api.nal.usda.gov/**", handler);
}

/** Nevera y escaneo por foto exigen sesión (`data/api.ts`'s `aiFridgeScan`/`aiProductScan`). */
async function mockApi(page: Page, handlers: Record<string, (route: Route) => Promise<void> | void>) {
  await page.route("https://cheluisfit.redgarverde.com/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const handler = handlers[path];
    if (handler) return handler(route);
    return route.fulfill({ status: 404, json: { error: "not_found", message: "no mockeado" } });
  });
}

const LOGIN_HANDLERS: Record<string, (route: Route) => Promise<void> | void> = {
  "/api/auth/login": (route) => route.fulfill({ json: { token: "t-1", user: { id: "u1", name: "Chelu", email: "chelu@x.es", role: "admin" } } }),
  "/api/me": (route) =>
    route.fulfill({ json: { user: { id: "u1", name: "Chelu", email: "chelu@x.es", role: "admin" }, household: { id: "h1", name: "CheluisFIT", members: [] } } }),
  "/api/blobs": (route) => route.fulfill({ json: { blobs: [] } }),
  "/api/blobs/*": (route) => route.fulfill({ status: 204, body: "" }),
};

/**
 * Siembra `cf_nutrition_v1` con datos que garantizan una propuesta de TDEE al abrir Nutrición:
 * 14 días registrados con un déficit enorme (1200 kcal/día, muy por debajo de cualquier
 * mantenimiento real) pero un peso completamente plano — el desajuste es tan grande que no hace
 * falta replicar la fórmula de Mifflin-St Jeor para saber que va a proponer subir el objetivo
 * (mismo caso, con los mismos números, que `domain/tdee.test.ts`). Se ejecuta en el propio
 * navegador (mismo huso horario que `todayKey()`), así que las fechas siempre coinciden con las
 * que verá la app real.
 */
async function seedForTdeeProposal(page: Page, overrides: { targetsOverride?: unknown } = {}) {
  await page.addInitScript((overrides) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const addDays = (key: string, days: number) => {
      const [y, m, d] = key.split("-").map(Number);
      const dt = new Date(y, m - 1, d, 12);
      dt.setDate(dt.getDate() + days);
      return toKey(dt);
    };
    const today = toKey(new Date());
    const nutrients = { kcal: 1200, protein: 80, carbs: 100, fat: 30, fiber: 10, sugars: 10, satFat: 5, salt: 2 };
    const entries = Array.from({ length: 14 }, (_, i) => ({
      id: `e-${i}`,
      date: addDays(today, -i),
      meal: "lunch",
      foodId: "x",
      name: "Comida de prueba",
      grams: 500,
      nutrients,
    }));
    const weights = [0, 4, 8, 13].map((offset) => ({ date: addDays(today, -offset), kg: 80 }));
    const state = {
      profile: { name: "Test", sex: "male", age: 30, heightCm: 180, weightKg: 80, activity: 1.55, goal: "lose" },
      targetsOverride: overrides.targetsOverride ?? null,
      entries,
      weights,
      tdee: { kcalAdjustment: 0, enabled: true, lastCheckedAt: null, pending: null },
    };
    window.localStorage.setItem("cf_nutrition_v1", JSON.stringify({ state, version: 4 }));
  }, overrides);
}

/** Llama antes a `mockApi(page, {...LOGIN_HANDLERS, ...extra})` — este helper solo hace los pasos de la interfaz. */
async function login(page: Page) {
  await page.goto("/mas");
  await page.getByTestId("go-account").click();
  await page.getByTestId("account-email").fill("chelu@x.es");
  await page.getByTestId("account-password").fill("supersecreta1");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-card")).toBeVisible();
}

test.describe("Nutrición", () => {
  test.beforeEach(async ({ page }) => {
    // Por defecto, sin resultados de USDA — así los tests existentes no dependen de la red real
    // ni de lo que USDA devuelva ese día. El merge con resultados de verdad se prueba aparte.
    await mockUsda(page, (route) => route.fulfill({ json: { foods: [] } }));
  });

  test("buscar, elegir cantidad y añadir a la merienda", async ({ page }) => {
    await page.goto("/nutricion");
    const before = await page.getByTestId("kcal-left").innerText();
    await page.getByTestId("add-snack").click();
    await page.getByTestId("food-search").fill("lentejas");
    await expect(page.getByTestId("food-off-8480017588098")).toBeVisible();
    await expect(page.getByTestId("food-off-8431876115895")).toBeVisible();
    await page.getByTestId("food-off-8480017588098").click();
    await page.getByTestId("grams-input").fill("200");
    await expect(page.getByTestId("food-kcal")).toHaveText("174");
    await page.getByTestId("meal-chip-snack").click();
    await page.getByTestId("submit-food").click();
    // Vuelve al buscador para seguir añadiendo; «Listo» cierra y lleva al diario.
    await expect(page.getByTestId("screen-anadir")).toBeVisible();
    await page.getByTestId("add-done").click();
    await expect(page.getByTestId("meal-snack")).toContainText("Lentejas cocidas");
    expect(await page.getByTestId("kcal-left").innerText()).not.toBe(before);
  });

  test("buscar añade resultados en vivo de USDA y se pueden elegir sin perderse", async ({ page }) => {
    await mockUsda(page, (route) =>
      route.fulfill({
        json: {
          foods: [
            { fdcId: 999111, description: "SOUP, LENTIL", foodNutrients: [{ nutrientId: 1008, value: 60 }, { nutrientId: 1003, value: 3.8 }, { nutrientId: 1005, value: 10.2 }, { nutrientId: 1004, value: 0.7 }] },
          ],
        },
      }),
    );
    await page.goto("/nutricion");
    await page.getByTestId("add-snack").click();
    await page.getByTestId("food-search").fill("lentejas");
    await expect(page.getByTestId("food-usda-999111")).toContainText("Soup, Lentil");
    await page.getByTestId("food-usda-999111").click();
    // Un resultado en vivo (no estaba en local) se guarda antes de navegar, si no esta pantalla
    // no lo encontraría por id — mismo bug que se dio con el escáner de códigos de barras.
    await expect(page.getByTestId("screen-alimento")).toContainText("Soup, Lentil");
  });

  test("añadido rápido con «+» y deshacer", async ({ page }) => {
    await page.goto("/nutricion");
    await page.getByTestId("add-dinner").click();
    await page.getByTestId("food-search").fill("tortilla");
    await page.getByTestId("quick-add-user-tortilla").click();
    await expect(page.getByText("añadido a cena")).toBeVisible();
    await page.getByRole("button", { name: "Deshacer" }).click();
    await page.getByTestId("add-done").click();
    await expect(page.getByTestId("meal-dinner")).not.toContainText("Tortilla");
  });

  test("escáner: código inválido, encontrado en local y no encontrado (ni en local ni en OFF)", async ({ page }) => {
    await mockOff(page, (route) => route.fulfill({ json: { status: 0 } }));
    await page.goto("/nutricion");
    await page.getByTestId("add-dinner").click();
    await page.getByTestId("open-scanner").click();
    await page.getByTestId("manual-code").fill("8480000205040");
    await page.getByTestId("manual-search").click();
    await expect(page.getByText("Código no válido")).toBeVisible();
    await page.getByTestId("manual-code").fill("8480000205049");
    await page.getByTestId("manual-search").click();
    await expect(page.getByTestId("scan-result")).toContainText("Yogur griego fresa");
    await page.getByRole("button", { name: /No es este/ }).click();
    await page.getByTestId("manual-code").fill("8410000000009");
    await page.getByTestId("manual-search").click();
    await expect(page.getByTestId("scan-notfound")).toBeVisible();
  });

  test("escáner: encuentra en vivo en Open Food Facts y queda cacheado localmente", async ({ page }) => {
    await mockOff(page, (route) =>
      route.fulfill({
        json: {
          status: 1,
          product: {
            product_name: "Atún claro en aceite de oliva",
            brands: "Hacendado",
            quantity: "3 x 52 g",
            completeness: 0.9,
            nutriments: {
              "energy-kcal_100g": 200,
              proteins_100g: 25,
              carbohydrates_100g: 0,
              fat_100g: 12,
              fiber_100g: 0,
              sugars_100g: 0,
              "saturated-fat_100g": 2,
              salt_100g: 1.1,
            },
          },
        },
      }),
    );
    await page.goto("/nutricion");
    await page.getByTestId("add-dinner").click();
    await page.getByTestId("open-scanner").click();
    await page.getByTestId("manual-code").fill("8410000000009");
    await page.getByTestId("manual-search").click();
    await expect(page.getByTestId("scan-result")).toContainText("Atún claro en aceite de oliva");
    // El resultado en vivo se guarda antes de navegar, si no esta pantalla no lo encontraría por id.
    await page.getByTestId("scan-pick").click();
    await expect(page.getByTestId("screen-alimento")).toContainText("Atún claro en aceite de oliva");
  });

  test("escáner: ficha de OFF sin datos nutricionales avisa antes de añadirla, con acceso directo a corregirla", async ({ page }) => {
    // Reproduce un caso real: muchas fichas comunitarias de OFF no tienen `nutriments` en
    // absoluto (encontrado escaneando una Estrella de Levante de verdad — varios códigos de
    // barras del mismo producto en OFF no tienen ni las kcal rellenas).
    await mockOff(page, (route) =>
      route.fulfill({
        json: {
          status: 1,
          product: { product_name: "Estrella de Levante", brands: "Estrella de Levante", completeness: 0.26 },
        },
      }),
    );
    await page.goto("/nutricion");
    await page.getByTestId("add-dinner").click();
    await page.getByTestId("open-scanner").click();
    await page.getByTestId("manual-code").fill("8410000000009");
    await page.getByTestId("manual-search").click();
    await expect(page.getByTestId("scan-result")).toContainText("Estrella de Levante");
    await expect(page.getByTestId("scan-warning")).toContainText("no tiene las kcal ni los macros");
    await page.getByTestId("scan-warning").getByRole("button", { name: "Corregir con la etiqueta" }).click();
    await expect(page.getByTestId("screen-crear")).toBeVisible();
    await expect(page.getByTestId("f-name")).toHaveValue("Estrella de Levante");
  });

  test("escáner: si Open Food Facts no responde, ofrece reintentar y crear a mano", async ({ page }) => {
    let calls = 0;
    await mockOff(page, (route) => {
      calls++;
      return route.fulfill({ status: 503, json: {} });
    });
    await page.goto("/nutricion");
    await page.getByTestId("add-dinner").click();
    await page.getByTestId("open-scanner").click();
    await page.getByTestId("manual-code").fill("8410000000009");
    await page.getByTestId("manual-search").click();
    await expect(page.getByTestId("scan-error")).toContainText("No se pudo consultar Open Food Facts");
    await page.getByTestId("scan-retry").click();
    await expect(page.getByTestId("scan-error")).toBeVisible();
    expect(calls).toBeGreaterThan(1);
    await page.getByRole("button", { name: "Crear alimento a mano" }).click();
    await expect(page.getByTestId("screen-crear")).toBeVisible();
  });

  test("escáner: si OFF responde con una petición mal formada, se trata como error, no como «no encontrado»", async ({ page }) => {
    // Reproduce la respuesta real de OFF cuando el código no llega bien construido
    // (`status_verbose: "no code or invalid code"`) — antes se confundía con "no está en la
    // base de datos" porque `offClient.ts` descartaba `status_verbose` sin mirarlo.
    await mockOff(page, (route) => route.fulfill({ json: { code: null, status: 0, status_verbose: "no code or invalid code" } }));
    await page.goto("/nutricion");
    await page.getByTestId("add-dinner").click();
    await page.getByTestId("open-scanner").click();
    await page.getByTestId("manual-code").fill("8410000000009");
    await page.getByTestId("manual-search").click();
    await expect(page.getByTestId("scan-error")).toBeVisible();
    await expect(page.getByTestId("scan-notfound")).toHaveCount(0);
    await expect(page.getByTestId("scan-error-detail")).toContainText("no code or invalid code");
  });

  test("crear un alimento con aviso de coherencia", async ({ page }) => {
    await page.goto("/crear-alimento");
    await page.getByTestId("f-name").fill("Barrita casera");
    await page.getByTestId("f-kcal").fill("400");
    await page.getByTestId("f-protein").fill("5");
    await page.getByTestId("f-carbs").fill("20");
    await page.getByTestId("f-fat").fill("2");
    await expect(page.getByTestId("create-warning")).toContainText("no cuadran");
    await page.getByTestId("f-kcal").fill("110");
    await expect(page.getByTestId("create-warning")).toHaveCount(0);
    await page.getByTestId("save-food").click();
    await expect(page.getByTestId("food-name")).toHaveText("Barrita casera");
  });

  test("objetivo: cálculo por defecto y validación del reparto", async ({ page }) => {
    await page.goto("/objetivo");
    await expect(page.getByTestId("goal-kcal")).toHaveText("2.300");
    await page.getByTestId("g-weight").fill("90");
    await expect(page.getByTestId("goal-kcal")).not.toHaveText("2.300");
  });

  test("tira semanal: elegir ayer cambia el día", async ({ page }) => {
    await page.goto("/nutricion");
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const p2 = (n: number) => String(n).padStart(2, "0");
    // Si hoy es lunes, ayer cae en la semana anterior: se usa la flecha.
    if (y.getDay() === 0) await page.getByRole("button", { name: "Día anterior" }).click();
    else await page.getByTestId(`strip-${y.getFullYear()}-${p2(y.getMonth() + 1)}-${p2(y.getDate())}`).click();
    await expect(page.getByTestId("day-label")).toHaveText("Ayer");
  });

  test("vista semanal: media, días en objetivo y macros", async ({ page }) => {
    await page.goto("/nutricion");
    await page.getByRole("tab", { name: "Semana" }).click();
    await expect(page.getByTestId("week-view")).toBeVisible();
    await expect(page.getByTestId("week-avg")).toContainText("kcal");
    await expect(page.getByTestId("week-ontarget")).toContainText(" de ");
  });

  test("guardar una comida y añadirla de golpe a otra", async ({ page }) => {
    await page.goto("/nutricion");
    await page.getByTestId("save-meal-breakfast").click();
    await expect(page.getByTestId("sheet-input")).toHaveValue("Mi desayuno");
    await page.getByTestId("sheet-input").fill("Desayuno de campeón");
    await page.getByTestId("sheet-confirm").click();
    await expect(page.getByText("guardada en Mis comidas")).toBeVisible();
    await page.getByTestId("add-snack").click();
    await page.getByTestId("tab-meals").click();
    await page.getByText("Desayuno de campeón").first().click();
    await expect(page.getByText("añadida a merienda")).toBeVisible();
    await page.getByTestId("add-done").click();
    await expect(page.getByTestId("meal-snack")).toContainText("Yogur griego fresa");
    await expect(page.getByTestId("meal-snack")).toContainText("Copos de avena");
  });

  test("cantidad: botones de más, menos, mitad y doble", async ({ page }) => {
    await page.goto("/alimento/usda-avena?meal=breakfast");
    const input = page.getByTestId("grams-input");
    await expect(input).toHaveValue("40");
    await page.getByTestId("grams-plus").click();
    await expect(input).toHaveValue("50");
    await page.getByTestId("grams-minus").click();
    await page.getByTestId("grams-minus").click();
    await expect(input).toHaveValue("30");
    await page.getByTestId("grams-double").click();
    await expect(input).toHaveValue("60");
    await page.getByTestId("grams-half").click();
    await expect(input).toHaveValue("30");
  });

  test("peso: validación, guardado y perfil actualizado", async ({ page }) => {
    await page.goto("/peso");
    await expect(page.getByTestId("last-weight")).toContainText("78");
    await page.getByTestId("weight-input").fill("780");
    await expect(page.getByText("Entre 30 y 250 kg")).toBeVisible();
    await expect(page.getByTestId("weight-save")).toBeDisabled();
    await page.getByTestId("weight-input").fill("77,3");
    await page.getByTestId("weight-save").click();
    await expect(page.getByTestId("last-weight")).toContainText("77,3");
    await page.goto("/objetivo");
    await expect(page.getByTestId("g-weight")).toHaveValue("77,3");
  });

  test("medidas corporales: se llega desde Peso, cada zona lleva su propio historial, y se puede borrar con deshacer", async ({ page }) => {
    await page.goto("/peso");
    await page.getByRole("button", { name: "Medidas corporales" }).click();
    await expect(page.getByTestId("screen-medidas")).toBeVisible();
    await expect(page.getByTestId("last-measurement")).toContainText("—");

    await page.getByTestId("measurement-input").fill("500");
    await expect(page.getByText("Entre 10 y 200 cm")).toBeVisible();
    await expect(page.getByTestId("measurement-save")).toBeDisabled();

    await page.getByTestId("measurement-input").fill("92");
    await page.getByTestId("measurement-save").click();
    await expect(page.getByTestId("last-measurement")).toContainText("92");

    // El pecho es una zona distinta: no ve la medida de cintura que acabamos de guardar.
    await page.getByTestId("kind-chest").click();
    await expect(page.getByTestId("last-measurement")).toContainText("—");
    await page.getByTestId("measurement-input").fill("104");
    await page.getByTestId("measurement-save").click();
    await expect(page.getByTestId("last-measurement")).toContainText("104");

    // Volver a cintura: sigue ahí, sin mezclarse con el pecho.
    await page.getByTestId("kind-waist").click();
    await expect(page.getByTestId("last-measurement")).toContainText("92");
    await page.getByTestId("measurement-history").getByRole("button", { name: /Borrar cintura/ }).click();
    await expect(page.getByText("Cintura borrada")).toBeVisible();
    await expect(page.getByTestId("last-measurement")).toContainText("—");
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(page.getByTestId("last-measurement")).toContainText("92");
  });

  test("exportar mis datos: descarga un JSON con los blobs guardados", async ({ page }) => {
    await page.goto("/mas");
    // `AsyncStorage` solo se escribe cuando una tienda cambia de verdad (`persist` no vuelca el
    // estado inicial hasta el primer `set()`) — se fuerza ese primer `set()` antes de exportar,
    // si no los datos de ejemplo que ya se ven en pantalla todavía no estarían en el disco.
    await page.getByTestId("reset-demo").click();
    await page.getByTestId("confirm-reset-confirm").click();
    const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-data").click()]);
    expect(download.suggestedFilename()).toMatch(/^cheluisfit-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import("node:fs/promises");
    const content = JSON.parse(await fs.readFile(path!, "utf8"));
    expect(content.app).toBe("CheluisFIT");
    expect(Object.keys(content.blobs).length).toBeGreaterThan(0); // hay datos de ejemplo que exportar
  });

  test("recordatorio de comidas: el interruptor se puede activar y desactivar sin errores", async ({ page }) => {
    await page.goto("/mas");
    const toggle = page.getByTestId("toggle-remind-meals");
    await expect(toggle).toBeVisible();
    await toggle.click(); // en el navegador no hay notificaciones reales (ver lib/notifications.ts); solo se guarda la preferencia
    await toggle.click();
  });

  test("calorías de ejercicio: se suman al objetivo del día", async ({ page }) => {
    await page.goto("/objetivo");
    await page.getByRole("button", { name: "Ajustes avanzados. Expandir" }).click();
    await page.getByTestId("toggle-exercise").click();
    await page.getByTestId("save-goal").click();
    await page.goto("/nutricion");
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const p2 = (n: number) => String(n).padStart(2, "0");
    if (y.getDay() === 0) await page.getByRole("button", { name: "Día anterior" }).click();
    else await page.getByTestId(`strip-${y.getFullYear()}-${p2(y.getMonth() + 1)}-${p2(y.getDate())}`).click();
    await expect(page.getByText("Ejercicio")).toBeVisible();
    await expect(page.getByText("+610")).toBeVisible();
  });

  test("añadir alimento: identificar con foto está visible desde el principio, junto al escáner", async ({ page }) => {
    await page.goto("/nutricion");
    await page.getByTestId("add-dinner").click();
    await expect(page.getByTestId("open-scanner")).toBeVisible();
    await page.getByTestId("open-photo-scan").click();
    await expect(page.getByTestId("screen-escaner-foto")).toBeVisible();
  });

  test("crear alimento: datos propuestos por IA llegan prellenados, con aviso para revisarlos", async ({ page }) => {
    await page.goto(
      "/crear-alimento?name=Yogur%20griego%20natural&brand=Marca&kcal=120&protein=9&carbs=4&fat=8&fiber=0&sugars=4&satFat=5&salt=0,1&aiProposed=1",
    );
    await expect(page.getByTestId("ai-proposed-warning")).toContainText("Datos leídos con IA");
    await expect(page.getByTestId("f-name")).toHaveValue("Yogur griego natural");
    await expect(page.getByTestId("f-kcal")).toHaveValue("120");
    await expect(page.getByTestId("f-protein")).toHaveValue("9");
    await page.getByTestId("save-food").click();
    await expect(page.getByTestId("food-name")).toHaveText("Yogur griego natural");
  });

  test("nevera: sin sesión, escanear avisa sin abrir la cámara", async ({ page }) => {
    await page.goto("/nutricion");
    await page.getByRole("button", { name: "Nevera" }).click();
    await expect(page.getByTestId("screen-nevera")).toBeVisible();
    await expect(page.getByText("Todavía no has escaneado la nevera")).toBeVisible();
    await page.getByTestId("scan-fridge").click();
    await expect(page.getByText("Inicia sesión para escanear la nevera")).toBeVisible();
  });

  test("nevera: con sesión, el botón de escanear queda listo para usarse", async ({ page }) => {
    await mockApi(page, LOGIN_HANDLERS);
    await login(page);
    await page.getByRole("tab", { name: "Nutrición" }).click();
    await page.getByRole("button", { name: "Nevera" }).click();
    await expect(page.getByTestId("screen-nevera")).toBeVisible();
    await expect(page.getByTestId("scan-fridge")).toBeEnabled();
  });

  test("TDEE: comiendo muy por debajo del objetivo sin perder peso, propone bajarlo; Aplicar lo deja fijo en Objetivo", async ({ page }) => {
    // Peso completamente plano pese a un déficit enorme (1200 kcal/día): el mantenimiento real
    // es más bajo de lo que calculaba la fórmula, así que toca bajar el objetivo, no subirlo
    // (mismo caso y mismo signo que "perdiendo más despacio de lo esperado" en `tdee.test.ts`).
    await seedForTdeeProposal(page);
    await page.goto("/nutricion");
    await expect(page.getByTestId("tdee-proposal")).toContainText("menos energía");

    const kcalBefore = await page.getByTestId("kcal-left").innerText();
    await page.getByTestId("tdee-apply").click();
    await expect(page.getByText("Objetivo actualizado")).toBeVisible();
    await expect(page.getByTestId("tdee-proposal")).toHaveCount(0);
    expect(await page.getByTestId("kcal-left").innerText()).not.toBe(kcalBefore); // el objetivo cambió de verdad

    // El mismo ajuste se ve en Objetivo, no solo en Nutrición (los dos sitios calculan igual) —
    // navegación dentro de la app, no `page.goto()`: el estado ya está en memoria, no hace falta
    // esperar a que `persist` termine de escribir en `localStorage` para verlo reflejado.
    await page.getByRole("button", { name: "Objetivo y ajustes de nutrición" }).click();
    await expect(page.getByTestId("tdee-adjustment-info")).toContainText("-70 kcal/día");
  });

  test("TDEE: Descartar quita el aviso sin tocar el objetivo", async ({ page }) => {
    await seedForTdeeProposal(page);
    await page.goto("/nutricion");
    await expect(page.getByTestId("tdee-proposal")).toBeVisible();
    const kcalBefore = await page.getByTestId("kcal-left").innerText();
    await page.getByTestId("tdee-dismiss").click();
    await expect(page.getByTestId("tdee-proposal")).toHaveCount(0);
    expect(await page.getByTestId("kcal-left").innerText()).toBe(kcalBefore);
  });

  test("TDEE: con un objetivo puesto a mano, no propone nada (el motor queda en pausa)", async ({ page }) => {
    await seedForTdeeProposal(page, {
      targetsOverride: { kcal: 2000, protein: 150, carbs: 200, fat: 60, fiber: 30, sugarsMax: 50, satFatMax: 22, saltMax: 6, mealSplit: { breakfast: 25, midmorning: 10, lunch: 30, snack: 10, dinner: 25 } },
    });
    await page.goto("/nutricion");
    await expect(page.getByTestId("tdee-proposal")).toHaveCount(0);
  });
});
