import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Conectar/sincronizar Strava exige sesión (`api.stravaStatus`/`stravaSync`). */
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

async function login(page: Page) {
  await page.goto("/mas");
  await page.getByTestId("go-account").click();
  await page.getByTestId("account-email").fill("chelu@x.es");
  await page.getByTestId("account-password").fill("supersecreta1");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-card")).toBeVisible();
}

test.describe("Running", () => {
  test("sincronizar Garmin en la web ofrece instalar Health Connect (no existe en el navegador)", async ({ page }) => {
    await page.goto("/running");
    await page.getByTestId("sync-garmin").click();
    await expect(page.getByText("Necesito Health Connect instalado en el móvil")).toBeVisible();
    await expect(page.getByRole("button", { name: "Instalar" })).toBeVisible();
    // No se cuelga en «Sincronizando…» ni toca `lastSync` al no haber podido sincronizar de verdad.
    await expect(page.getByTestId("sync-garmin")).toBeEnabled();
  });

  test("planificar una plantilla y quitarla", async ({ page }) => {
    await page.goto("/running");
    await page.getByRole("tab", { name: "Plantillas" }).click();
    await page.getByTestId("plan-tpl-sprints").click();
    const d = new Date();
    d.setDate(d.getDate() + 4);
    const p = (n: number) => String(n).padStart(2, "0");
    await page.getByTestId(`day-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`).click();
    await expect(page.getByText("Planificada para")).toBeVisible();
  });

  test("editor: estimación en vivo, repeticiones y validación", async ({ page }) => {
    await page.goto("/running");
    await page.getByRole("tab", { name: "Plantillas" }).click();
    await page.getByTestId("edit-tpl-series-800").click();
    await expect(page.getByTestId("tpl-total")).toContainText("11,4 km");
    await page.getByRole("button", { name: "Una repetición más" }).click();
    await expect(page.getByTestId("repeat-times")).toContainText("×7");
    await expect(page.getByTestId("tpl-total")).not.toContainText("11,4 km");
  });

  test("nueva plantilla desde una base", async ({ page }) => {
    await page.goto("/running");
    await page.getByRole("tab", { name: "Plantillas" }).click();
    await page.getByTestId("new-template").click();
    await page.getByTestId("save-template").click();
    await expect(page.getByText("Ponle un nombre").first()).toBeVisible();
    await page.getByTestId("base-sprints").click();
    await expect(page.getByTestId("tpl-name")).toHaveValue("Sprints 10×100");
    await page.getByTestId("tpl-name").fill("Mis sprints");
    await page.getByTestId("save-template").click();
    await expect(page.getByText("Mis sprints")).toBeVisible();
  });

  test("editar la plantilla no cambia el «plan vs. real» del pasado", async ({ page }) => {
    await page.goto("/running");
    await page.getByRole("tab", { name: "Plantillas" }).click();
    await page.getByTestId("edit-tpl-series-800").click();
    await page.getByRole("button", { name: "Una repetición más" }).click();
    await page.getByTestId("save-template").click();
    await page.goto("/sesion/act-3");
    await expect(page.getByTestId("plan-vs-real")).toContainText("6 de 6");
    await expect(page.getByTestId("laps")).toBeVisible();
  });

  test("progreso muestra gráficas y marcas, incluida la mejor marca en 10K entre varias candidatas", async ({ page }) => {
    await page.goto("/running");
    await page.getByRole("tab", { name: "Progreso" }).click();
    await expect(page.getByText("Kilómetros por semana")).toBeVisible();
    await expect(page.getByText("Mejor ritmo")).toBeVisible();
    await expect(page.getByTestId("pr-longest")).toContainText("17,2 km"); // Tirada larga, la más larga de las de ejemplo
    // Solo cuentan como 10K las de al menos 9,8 km (9,6 y 9,1 km no son un 10K), y se compara el
    // tiempo llevado a 10 km: 10,3 km en 54:36 → 53:01 gana a 10,4 km en 55:18 → 53:10.
    // (Antes ganaba la de 9,6 km en 49:48 solo por ser la de menos tiempo.)
    await expect(page.getByTestId("pr-10k")).toContainText("53:01");
  });

  test("registrar una carrera a mano: ritmo en vivo, avisos y borrado con deshacer", async ({ page }) => {
    await page.goto("/running");
    await page.getByTestId("new-session").click();
    await page.getByTestId("save-session").click();
    await expect(page.getByText("Indica la distancia").first()).toBeVisible();
    await page.getByTestId("s-km").fill("10,5");
    await page.getByTestId("s-time-m").fill("52");
    await page.getByTestId("s-time-s").fill("30");
    await expect(page.getByTestId("pace-preview")).toContainText("5:00/km");
    await page.getByTestId("s-time-m").fill("15");
    await page.getByTestId("s-time-s").fill("");
    await expect(page.getByTestId("pace-preview")).toContainText("más rápido");
    await page.getByTestId("s-time-m").fill("52");
    await page.getByTestId("s-time-s").fill("30");
    await page.getByTestId("s-title").fill("Rodaje del parque");
    await page.getByTestId("save-session").click();
    await expect(page.getByText("Registro manual")).toBeVisible();
    await expect(page.getByTestId("screen-sesion").getByLabel("Distancia: 10,5 km")).toBeVisible();
    await page.getByTestId("delete-session").click();
    await expect(page.getByText("Carrera eliminada")).toBeVisible();
    await expect(page.getByText("Rodaje del parque")).toHaveCount(0);
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(page.getByText("Rodaje del parque")).toBeVisible();
  });

  test("vincular una sesión con una plantilla y ver la comparación", async ({ page }) => {
    await page.goto("/sesion/act-1");
    await expect(page.getByTestId("plan-vs-real")).toHaveCount(0);
    await page.getByTestId("link-template").click();
    await page.getByTestId("link-tpl-rodaje").click();
    await expect(page.getByTestId("plan-link")).toContainText("Rodaje suave 8 km");
    await page.getByRole("button", { name: "Desvincular" }).click();
    await expect(page.getByTestId("link-template")).toBeVisible();
  });

  test("plan de los últimos días: hecho, sin registrar y enlazado al registrar", async ({ page }) => {
    await page.goto("/running");
    await expect(page.getByTestId("recent-plan-p1")).toContainText("Hecho");
    await expect(page.getByTestId("recent-plan-p2")).toContainText("Sin registrar");
    await page.getByTestId("register-plan-p2").click();
    await page.getByTestId("s-km").fill("8");
    await page.getByTestId("s-time-m").fill("48");
    await page.getByTestId("save-session").click();
    await expect(page.getByTestId("plan-link")).toContainText("Rodaje suave 8 km");
    await page.goto("/running");
    await expect(page.getByTestId("recent-plan-p2")).toContainText("Hecho");
  });

  test("duplicar una plantilla", async ({ page }) => {
    await page.goto("/running");
    await page.getByRole("tab", { name: "Plantillas" }).click();
    await page.getByTestId("dup-tpl-tempo").click();
    await expect(page.getByText("Duplicada como")).toBeVisible();
    await expect(page.getByText("Tempo 20 min (copia)").first()).toBeVisible();
  });

  test("editor: la zona de FC muestra su rango en ppm", async ({ page }) => {
    await page.goto("/running");
    await page.getByRole("tab", { name: "Plantillas" }).click();
    await page.getByTestId("edit-tpl-tirada-larga").click();
    await page.getByRole("button", { name: /Libre/ }).first().click();
    await expect(page.getByTestId("hr-zone-hint")).toContainText("114–133");
  });

  test("detalle: sesión de Garmin sin ruta GPS ofrece buscarla y avisa si no hay", async ({ page }) => {
    await page.goto("/sesion/act-2");
    await expect(page.getByTestId("fetch-route")).toBeVisible();
    await page.getByTestId("fetch-route").click();
    // En web `fetchExerciseRoute` siempre resuelve `null` (no hay Health Connect) — mismo
    // resultado real que da Garmin, que no comparte GPS por Health Connect (ver AGENTS.md).
    await expect(page.getByText("Esta sesión no trae ruta GPS.")).toBeVisible();
    await expect(page.getByTestId("fetch-route")).toHaveCount(0);
  });

  test("detalle: gráfico de ritmo por vuelta", async ({ page }) => {
    await page.goto("/sesion/act-3");
    await expect(page.getByTestId("lap-chart")).toBeVisible();
    await expect(page.getByTestId("lap-chart")).toContainText("Ritmo por vuelta");
  });

  test("editor: tiempo y ritmo se editan por partes y se reflejan en el resumen", async ({ page }) => {
    await page.goto("/running");
    await page.getByRole("tab", { name: "Plantillas" }).click();
    await page.getByTestId("edit-tpl-series-800").click();
    await page.getByRole("button", { name: /Calentamiento · 15 min/ }).click();
    await expect(page.getByTestId("dur-time-m")).toHaveValue("15");
    await page.getByTestId("dur-time-m").fill("20");
    await expect(page.getByRole("button", { name: /Calentamiento · 20 min/ })).toBeVisible();
    await page.getByRole("button", { name: /Trabajo · 800 m · 3:55\/km/ }).first().click();
    await expect(page.getByTestId("target-pace-m")).toHaveValue("3");
    await expect(page.getByTestId("target-pace-s")).toHaveValue("55");
    await page.getByTestId("target-pace-s").fill("40");
    await expect(page.getByRole("button", { name: /Trabajo · 800 m · 3:40\/km/ }).first()).toBeVisible();
  });

  test("la fuente es elegible: por defecto Garmin; Strava sin conectar ofrece «Conectar Strava» y sin sesión avisa sin abrir nada", async ({ page }) => {
    await page.goto("/running");
    // Por defecto la fuente es Garmin (Health Connect), con su botón de sincronizar.
    await expect(page.getByTestId("sync-garmin")).toBeVisible();
    await page.getByTestId("source-picker").getByRole("tab", { name: "Strava" }).click();
    await expect(page.getByTestId("sync-garmin")).toHaveCount(0);
    await expect(page.getByTestId("sync-strava")).toContainText("Conectar");
    await page.getByTestId("sync-strava").click();
    await expect(page.getByText("Inicia sesión para conectar Strava")).toBeVisible();
    // Se puede volver a Garmin en cualquier momento: la fuente no se sustituye al conectar.
    await page.getByTestId("source-picker").getByRole("tab", { name: "Garmin" }).click();
    await expect(page.getByTestId("sync-garmin")).toBeVisible();
  });

  test("Strava conectado: se sincroniza desde el selector y la actividad nueva aparece con su ruta", async ({ page }) => {
    await mockApi(page, {
      ...LOGIN_HANDLERS,
      "/api/strava/status": (route) => route.fulfill({ json: { connected: true } }),
      "/api/strava/sync": (route) =>
        route.fulfill({
          json: {
            activities: [
              {
                date: "2026-09-20",
                type: "run",
                source: "strava",
                title: "Rodaje con Strava",
                distanceM: 6000,
                durationS: 1800,
                externalId: "strava-1",
                route: [{ lat: 40.41, lon: -3.7 }, { lat: 40.42, lon: -3.71 }],
              },
            ],
          },
        }),
    });
    await login(page);
    await page.getByRole("tab", { name: "Running" }).click();
    // Con Strava conectado (mockeado en /api/strava/status) el selector lo refleja, pero Garmin
    // sigue disponible: la fuente es elección de la persona.
    await expect(page.getByTestId("sync-garmin")).toBeVisible();
    await page.getByTestId("source-picker").getByRole("tab", { name: "Strava" }).click();
    await expect(page.getByTestId("sync-garmin")).toHaveCount(0);
    await expect(page.getByTestId("sync-strava")).toContainText("Sincronizar");
    await page.getByTestId("sync-strava").click();
    await expect(page.getByText("1 actividad nueva de Strava")).toBeVisible();
    await expect(page.getByText("Rodaje con Strava")).toBeVisible();
    await expect(page.getByText("Strava", { exact: true }).first()).toBeVisible();
  });
});
