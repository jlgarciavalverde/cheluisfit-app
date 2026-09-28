import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Mismo patrón de interceptación que `cuenta.spec.ts`: la app apunta al servidor real por
 * defecto, así que se interceptan las llamadas a `/api/**` para no depender de red ni de un
 * asistente de IA de verdad (ni gastar cuota gratuita) durante los e2e.
 *
 * Importante: tras iniciar sesión hay que navegar por dentro de la app (pestañas), nunca con
 * `page.goto()` — en web `authStore` guarda el token en memoria, no en `SecureStore` (no existe
 * ahí, ver AGENTS.md), así que una navegación de página completa lo perdería y la burbuja del
 * asistente (que exige sesión) desaparecería sin que sea un fallo real.
 */
type RouteHandler = (route: Parameters<Parameters<Page["route"]>[1]>[0]) => Promise<void> | void;

async function mockApi(page: Page, handlers: Record<string, RouteHandler>) {
  await page.route("https://cheluisfit.redgarverde.com/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const handler = handlers[path] ?? (path.startsWith("/api/blobs/") ? handlers["/api/blobs/*"] : undefined);
    if (handler) return handler(route);
    return route.fulfill({ status: 404, json: { error: "not_found", message: "no mockeado" } });
  });
}

const LOGIN_HANDLERS: Record<string, RouteHandler> = {
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

test.describe("Asistente de IA", () => {
  test("sin sesión iniciada, la burbuja no aparece", async ({ page }) => {
    await page.goto("/running");
    await expect(page.getByTestId("ai-assistant-bubble")).toHaveCount(0);
  });

  test("con sesión, aparece en cualquier pantalla y muestra la sección actual", async ({ page }) => {
    await mockApi(page, LOGIN_HANDLERS);
    await login(page);

    await page.getByRole("tab", { name: "Running" }).click();
    await expect(page.getByTestId("ai-assistant-bubble")).toBeVisible();
    await page.getByTestId("ai-assistant-bubble").click();
    await expect(page.getByTestId("ai-assistant-panel")).toContainText("Running");
    await page.getByTestId("ai-assistant-panel").getByRole("button", { name: "Cerrar" }).click();

    await page.getByRole("tab", { name: "Fuerza" }).click();
    await page.getByTestId("ai-assistant-bubble").click();
    await expect(page.getByTestId("ai-assistant-panel")).toContainText("Fuerza");
  });

  test("responde y, si propone un cambio, se puede aplicar (cambia el store de verdad) o descartar", async ({ page }) => {
    await mockApi(page, {
      ...LOGIN_HANDLERS,
      "/api/ai/chat": (route) =>
        route.fulfill({
          json: {
            reply: "Te propongo una ensalada de pollo para cenar.",
            proposals: [{ type: "add_meal_entry", name: "Ensalada de pollo", meal: "dinner", grams: 350, kcal: 420, protein: 35, carbs: 15, fat: 22 }],
          },
        }),
    });
    await login(page);
    await page.getByRole("tab", { name: "Nutrición" }).click();
    await page.getByTestId("ai-assistant-bubble").click();
    await page.getByTestId("ai-input").fill("¿Qué ceno hoy?");
    await page.getByTestId("ai-send").click();

    await expect(page.getByText("Te propongo una ensalada de pollo para cenar.")).toBeVisible();
    // La tarjeta muestra el preliminar completo: nombre, cantidad, comida y macros.
    await expect(page.getByText("«Ensalada de pollo» · 350 g")).toBeVisible();
    await expect(page.getByText("Se añadirá a cena de hoy")).toBeVisible();
    await expect(page.getByText("420 kcal · P 35 g · H 15 g · G 22 g")).toBeVisible();

    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByText("Ensalada de pollo añadido a cena")).toBeVisible(); // toast
    await expect(page.getByText("✓ Aplicado")).toBeVisible();

    // Se aplicó de verdad: aparece en la comida de hoy, no solo en el chat (que puede seguir en el
    // DOM oculto tras cerrar el modal, igual que el toast que aún no ha desaparecido).
    await page.getByTestId("ai-assistant-panel").getByRole("button", { name: "Cerrar" }).click();
    await expect(page.getByTestId("screen-nutricion").getByText("Ensalada de pollo")).toBeVisible();
  });

  test("tras una respuesta con solo propuesta (texto vacío), el segundo mensaje sigue funcionando", async ({ page }) => {
    const sent: { role: string; content: string }[][] = [];
    await mockApi(page, {
      ...LOGIN_HANDLERS,
      "/api/ai/chat": (route) => {
        const body = route.request().postDataJSON() as { messages: { role: string; content: string }[] };
        sent.push(body.messages);
        if (body.messages.some((m) => m.content.trim() === "")) return route.fulfill({ status: 400, json: { error: "validation", message: "vacío" } });
        return route.fulfill({
          json:
            sent.length === 1
              ? { reply: "", proposals: [{ type: "add_meal_entry", name: "Café con leche", meal: "breakfast", grams: 250, kcal: 120, protein: 6, carbs: 10, fat: 5 }] }
              : { reply: "De nada.", proposals: [] },
        });
      },
    });
    await login(page);
    await page.getByRole("tab", { name: "Nutrición" }).click();
    await page.getByTestId("ai-assistant-bubble").click();
    await page.getByTestId("ai-input").fill("Me he tomado un café con leche");
    await page.getByTestId("ai-send").click();
    await expect(page.getByText("«Café con leche» · 250 g")).toBeVisible();
    await page.getByTestId("ai-input").fill("gracias");
    await page.getByTestId("ai-send").click();
    await expect(page.getByText("De nada.")).toBeVisible();
    expect(sent[1]!.every((m) => m.content.length > 0)).toBe(true);
  });

  test("descartar una propuesta no toca ningún dato", async ({ page }) => {
    await mockApi(page, {
      ...LOGIN_HANDLERS,
      "/api/ai/chat": (route) =>
        route.fulfill({
          json: { reply: "Vale, no cambio nada.", proposals: [{ type: "adjust_goal", field: "kcal", value: 2500 }] },
        }),
    });
    await login(page);
    await page.getByRole("tab", { name: "Nutrición" }).click();
    await page.getByTestId("ai-assistant-bubble").click();
    await page.getByTestId("ai-input").fill("Sube mi objetivo a 2500");
    await page.getByTestId("ai-send").click();

    await expect(page.getByText(/Cambiar el objetivo de kcal a 2500/)).toBeVisible();
    await page.getByRole("button", { name: "Descartar" }).click();
    await expect(page.getByText("Descartado — no se cambió nada")).toBeVisible();
  });

  test("pedir registrar un alimento muestra el preliminar aunque la IA no escriba texto", async ({ page }) => {
    // Visto de verdad contra el servidor: cuando el modelo llama a la herramienta, `reply` puede
    // venir vacío — la tarjeta de propuesta tiene que llevar todo el detalle por sí sola.
    await mockApi(page, {
      ...LOGIN_HANDLERS,
      "/api/ai/chat": (route) =>
        route.fulfill({
          json: {
            reply: "",
            proposals: [{ type: "add_meal_entry", name: "Café con leche", meal: "breakfast", grams: 250, kcal: 120, protein: 6, carbs: 10, fat: 5 }],
          },
        }),
    });
    await login(page);
    await page.getByRole("tab", { name: "Nutrición" }).click();
    await page.getByTestId("ai-assistant-bubble").click();
    await page.getByTestId("ai-input").fill("Regístrame un café con leche de 250 g");
    await page.getByTestId("ai-send").click();

    await expect(page.getByText("«Café con leche» · 250 g")).toBeVisible();
    await expect(page.getByText("Se añadirá a desayuno de hoy")).toBeVisible();
    await expect(page.getByText("120 kcal · P 6 g · H 10 g · G 5 g")).toBeVisible();
  });

  test("si el servidor falla, se ve un aviso en vez de romperse", async ({ page }) => {
    await mockApi(page, { ...LOGIN_HANDLERS, "/api/ai/chat": (route) => route.fulfill({ status: 502, json: { error: "http", message: "El asistente no responde ahora mismo" } }) });
    await login(page);
    await page.getByRole("tab", { name: "Running" }).click();
    await page.getByTestId("ai-assistant-bubble").click();
    await page.getByTestId("ai-input").fill("Hola");
    await page.getByTestId("ai-send").click();
    // El mensaje del propio servidor (502/503/429), no uno genérico.
    await expect(page.getByText("El asistente no responde ahora mismo")).toBeVisible();
  });
});
