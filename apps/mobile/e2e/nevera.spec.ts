import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";

// PNG de 2×2: lo justo para que el selector de fotos y el redimensionado de la web lo acepten.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVQYV2P8z8DwnwEIGBkZGRgYAAAhBwMBn0lQ2wAAAABJRU5ErkJggg==", "base64");

const SCAN = {
  items: ["Leche", "Queso", "Tomates"],
  scan: {
    positioned: true,
    shelvesSeen: 3,
    doorVisible: true,
    items: [
      { name: "Leche", category: "lacteo", zone: "door", level: 1, x: 0.3, depth: "front", confidence: 0.9, quantity: 1, unit: "l" },
      { name: "Queso", category: "lacteo", zone: "shelf", level: 0, x: 0.7, depth: "front", confidence: 0.9 },
      { name: "Tomates", category: "verdura", zone: "drawer", level: 0, x: 0.5, depth: "front", confidence: 0.8, quantity: 4, unit: "ud" },
    ],
  },
};

const LOGIN: Record<string, (route: Route) => Promise<void> | void> = {
  "/api/auth/login": (route) => route.fulfill({ json: { token: "t-1", user: { id: "u1", name: "Chelu", email: "chelu@x.es", role: "admin" } } }),
  "/api/me": (route) => route.fulfill({ json: { user: { id: "u1", name: "Chelu", email: "chelu@x.es", role: "admin" }, household: { id: "h1", name: "CheluisFIT", members: [] } } }),
  "/api/blobs": (route) => route.fulfill({ json: { blobs: [] } }),
};

async function mockApi(page: Page, handlers: Record<string, (route: Route) => Promise<void> | void>) {
  await page.route("https://cheluisfit.redgarverde.com/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (handlers[path]) return handlers[path](route);
    if (path.startsWith("/api/blobs/")) return route.fulfill({ json: { updatedAt: Date.now() } });
    return route.fulfill({ status: 404, json: { error: "not_found", message: "no mockeado" } });
  });
}

async function loginAndOpenFridge(page: Page) {
  await page.goto("/mas");
  await page.getByTestId("go-account").click();
  await page.getByTestId("account-email").fill("chelu@x.es");
  await page.getByTestId("account-password").fill("supersecreta1");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-card")).toBeVisible();
  await page.getByRole("tab", { name: "Nutrición" }).click();
  await page.getByRole("button", { name: "Nevera" }).click();
  await expect(page.getByTestId("screen-nevera")).toBeVisible();
}

async function scanFromLibrary(page: Page) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByTestId("scan-fridge-library").click();
  await (await chooser).setFiles({ name: "nevera.png", mimeType: "image/png", buffer: PNG });
}

test.describe("Nevera", () => {
  test("escanear desde la galería coloca cada alimento en su sitio (3D y lista)", async ({ page }) => {
    await mockApi(page, { ...LOGIN, "/api/ai/vision/fridge": (route) => route.fulfill({ json: SCAN }) });
    await loginAndOpenFridge(page);
    await scanFromLibrary(page);
    await expect(page.getByText("3 alimentos en la nevera")).toBeVisible();

    // La vista 3D se pinta (o, sin WebGL, avisa y ofrece la lista: las dos son válidas).
    await expect(page.getByTestId("fridge-3d").or(page.getByTestId("fridge-3d-unavailable"))).toBeVisible();
    if (await page.getByTestId("fridge-3d").isVisible()) {
      await expect(page.getByTestId("fridge-3d")).toHaveAttribute("aria-label", /Puerta 2: Leche/);
      await expect(page.getByTestId("fridge-3d").locator("canvas")).toBeVisible();
    }

    await page.getByTestId("fridge-view").getByText("Lista").click();
    const items = page.getByTestId("fridge-items");
    await expect(items.getByText("Balda 1")).toBeVisible();
    await expect(items.getByText("Cajón 1")).toBeVisible();
    await expect(items.getByText("Puerta 2")).toBeVisible();
    await expect(items.getByText("Lácteos · 1 l")).toBeVisible();
  });

  test("una segunda foto pregunta si es toda la nevera o una parte, y «una parte» suma", async ({ page }) => {
    let call = 0;
    await mockApi(page, {
      ...LOGIN,
      "/api/ai/vision/fridge": (route) => {
        call++;
        return route.fulfill({
          json:
            call === 1
              ? SCAN
              : { items: ["Yogur"], scan: { positioned: true, shelvesSeen: 1, doorVisible: false, items: [{ name: "Yogur", category: "lacteo", zone: "shelf", level: 1, x: 0.2, depth: "front", confidence: 0.9 }] } },
        });
      },
    });
    await loginAndOpenFridge(page);
    await scanFromLibrary(page);
    await expect(page.getByText("3 alimentos en la nevera")).toBeVisible();
    // Con algo ya en la nevera, primero la hoja de «qué sale en la foto» y luego el selector.
    await page.getByTestId("scan-fridge-library").click();
    const chooser = page.waitForEvent("filechooser");
    await page.getByTestId("scan-mode-add").click();
    await (await chooser).setFiles({ name: "balda.png", mimeType: "image/png", buffer: PNG });
    await expect(page.getByText("1 alimento añadido")).toBeVisible();
    await page.getByTestId("fridge-view").getByText("Lista").click();
    await expect(page.getByTestId("fridge-items").getByText("Yogur")).toBeVisible();
    await expect(page.getByTestId("fridge-items").getByText("Queso")).toBeVisible();
  });

  test("añadir a mano, corregir y quitar con «Deshacer»", async ({ page }) => {
    await mockApi(page, LOGIN);
    await loginAndOpenFridge(page);
    await page.getByTestId("fridge-add-manual").click();
    await page.getByTestId("fridge-item-name").fill("huevos camperos");
    await page.getByRole("button", { name: "Huevos" }).click();
    await page.getByTestId("fridge-item-qty").fill("6");
    await page.getByTestId("fridge-item-save").click();
    await expect(page.getByText("«Huevos camperos» añadido")).toBeVisible();

    await page.getByTestId("fridge-view").getByText("Lista").click();
    const items = page.getByTestId("fridge-items");
    await expect(items.getByText("Puerta 1")).toBeVisible(); // los huevos van a la puerta por defecto
    await items.getByText("Huevos camperos").click();
    await page.getByTestId("fridge-item-qty").fill("4");
    await page.getByTestId("fridge-item-save").click();
    await expect(items.getByText("Huevos · 4")).toBeVisible();

    await page.getByRole("button", { name: "Quitar Huevos camperos" }).click();
    await expect(items).toHaveCount(0);
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(page.getByText("Huevos camperos")).toBeVisible();
  });

  test("«¿Qué cocino?» abre el asistente y le pregunta con la nevera en el contexto", async ({ page }) => {
    let body: { messages: { content: string }[]; context: string; section: string } | null = null;
    await mockApi(page, {
      ...LOGIN,
      "/api/ai/vision/fridge": (route) => route.fulfill({ json: SCAN }),
      "/api/ai/chat": async (route) => {
        body = route.request().postDataJSON();
        await route.fulfill({ json: { reply: "Tortilla de queso con tomate.", proposals: [] } });
      },
    });
    await loginAndOpenFridge(page);
    await scanFromLibrary(page);
    await page.getByTestId("fridge-what-to-cook").click();
    await expect(page.getByTestId("ai-assistant-panel")).toBeVisible();
    await expect(page.getByText("Tortilla de queso con tomate.")).toBeVisible();
    expect(body!.section).toBe("nutrition");
    expect(body!.context).toContain("En la nevera");
    expect(body!.context).toContain("Leche 1 l");
    expect(body!.messages.at(-1)!.content).toContain("¿Qué puedo cocinar hoy");
  });
});
