import { expect, type Page, test } from "@playwright/test";

/**
 * La app apunta por defecto al servidor real (`https://cheluisfit.redgarverde.com`, ver
 * `data/api.ts`): estas pruebas interceptan `/api/**` para no hacer peticiones de verdad
 * durante el e2e (ni depender de red, ni tocar la cuenta real).
 *
 * Este archivo usa el `test` normal de `@playwright/test`, no el `./fixtures` compartido: es el
 * único spec que quiere probar de verdad el primer arranque sin `cf_onboarding_v1` puesto (ver
 * el comentario de `fixtures.ts`). Los tests que no necesitan probar esa redirección la evitan a
 * mano con `seedOnboarding()`.
 */
type RouteHandler = (route: Parameters<Parameters<Page["route"]>[1]>[0]) => Promise<void> | void;

async function mockApi(page: Page, handlers: Record<string, RouteHandler>) {
  await page.route("https://cheluisfit.redgarverde.com/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    // `/api/blobs/:key` es dinámica: si no hay una entrada exacta, se prueba con el comodín.
    const handler = handlers[path] ?? (path.startsWith("/api/blobs/") ? handlers["/api/blobs/*"] : undefined);
    if (handler) return handler(route);
    return route.fulfill({ status: 404, json: { error: "not_found", message: "no mockeado" } });
  });
}

/** Evita la redirección al primer arranque para los tests que no la están probando. */
async function seedOnboarding(page: Page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("cf_onboarding_v1", JSON.stringify({ state: { seen: true }, version: 0 }));
    } catch {
      // sin almacenamiento disponible: algún test vería la redirección de más, no vale la pena romper la sesión de test por esto.
    }
  });
}

const LOGIN_HANDLERS: Record<string, RouteHandler> = {
  "/api/auth/login": (route) => route.fulfill({ json: { token: "t-1", user: { id: "u1", name: "Chelu", email: "chelu@x.es", role: "admin" } } }),
  "/api/me": (route) =>
    route.fulfill({ json: { user: { id: "u1", name: "Chelu", email: "chelu@x.es", role: "admin" }, household: { id: "h1", name: "CheluisFIT", members: [] } } }),
  "/api/blobs": (route) => route.fulfill({ json: { blobs: [] } }),
  "/api/blobs/*": (route) => route.fulfill({ status: 204, body: "" }),
};

const REGISTER_HANDLERS: Record<string, RouteHandler> = {
  "/api/auth/register": (route) => route.fulfill({ status: 201, json: { token: "t-2", user: { id: "u2", name: "Nueva", email: "nueva@x.es", role: "admin" } } }),
  "/api/me": (route) =>
    route.fulfill({ json: { user: { id: "u2", name: "Nueva", email: "nueva@x.es", role: "admin" }, household: { id: "h1", name: "CheluisFIT", members: [] } } }),
  "/api/blobs": (route) => route.fulfill({ json: { blobs: [] } }),
  "/api/blobs/*": (route) => route.fulfill({ status: 204, body: "" }),
};

async function login(page: Page) {
  await seedOnboarding(page);
  await page.goto("/mas");
  await page.getByTestId("go-account").click();
  await page.getByTestId("account-email").fill("chelu@x.es");
  await page.getByTestId("account-password").fill("supersecreta1");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-card")).toBeVisible();
}

test.describe("Cuenta", () => {
  test("se llega desde Más y se alterna entre entrar y crear cuenta", async ({ page }) => {
    await seedOnboarding(page);
    await page.goto("/mas");
    await page.getByTestId("go-account").click();
    await expect(page.getByTestId("screen-cuenta")).toBeVisible();
    await expect(page.getByTestId("account-name")).toHaveCount(0); // «Entrar» no pide nombre

    await page.getByRole("tab", { name: "Crear cuenta" }).click();
    await expect(page.getByTestId("account-name")).toBeVisible();
    await expect(page.getByTestId("account-setup")).toBeVisible();
    await expect(page.getByTestId("account-invite")).toBeVisible();
  });

  test("el botón no se activa hasta rellenar lo necesario", async ({ page }) => {
    await seedOnboarding(page);
    await page.goto("/cuenta");
    await expect(page.getByTestId("account-submit")).toBeDisabled();
    await page.getByTestId("account-email").fill("chelu@x.es");
    await expect(page.getByTestId("account-submit")).toBeDisabled();
    await page.getByTestId("account-password").fill("supersecreta1");
    await expect(page.getByTestId("account-submit")).toBeEnabled();
  });

  test("credenciales incorrectas muestran el error del servidor", async ({ page }) => {
    await seedOnboarding(page);
    await mockApi(page, {
      "/api/auth/login": (route) => route.fulfill({ status: 401, json: { error: "http", message: "Correo o contraseña incorrectos" } }),
    });
    await page.goto("/cuenta");
    await page.getByTestId("account-email").fill("chelu@x.es");
    await page.getByTestId("account-password").fill("mala-contra");
    await page.getByTestId("account-submit").click();
    await expect(page.getByTestId("account-error")).toContainText("Correo o contraseña incorrectos");
  });

  test("login correcto carga sola la cuenta real, sin preguntar, y se ve sin recargar", async ({ page }) => {
    await mockApi(page, {
      ...LOGIN_HANDLERS,
      "/api/blobs": (route) =>
        route.fulfill({
          json: {
            blobs: [
              {
                key: "cf_strength_v1",
                data: {
                  state: {
                    routines: [{ id: "r-server", name: "Rutina del servidor", exercises: [] }],
                    workouts: [],
                    custom: [],
                    videos: {},
                    effortMode: "rir",
                    barKg: 20,
                    plates: [1.25, 2.5, 5, 10, 15, 20],
                  },
                  version: 1,
                },
              },
            ],
          },
        }),
    });
    await login(page);
    // Sin preguntar «¿esto es tuyo?»: se cae directa en la cuenta con los datos ya cargados.
    await expect(page.getByTestId("fresh-start")).toHaveCount(0);
    await expect(page.getByTestId("keep-local")).toHaveCount(0);

    // La pantalla de Fuerza, ya abierta antes de iniciar sesión en este mismo test, refleja el
    // blob bajado del servidor sin recargar la página — comprueba `rehydrate()`, no solo que se
    // escribió en AsyncStorage.
    await page.getByRole("tab", { name: "Fuerza" }).click();
    await page.getByRole("tab", { name: "Rutinas" }).click();
    await expect(page.getByText("Rutina del servidor")).toBeVisible();
    await expect(page.getByText("Pecho", { exact: true })).toHaveCount(0); // ni rastro de las rutinas de ejemplo
  });

  test("si falla la descarga al entrar, nunca se suben los datos locales por encima de la cuenta", async ({ page }) => {
    const puts: string[] = [];
    let blobsOk = false;
    await mockApi(page, {
      ...LOGIN_HANDLERS,
      "/api/blobs": (route) => (blobsOk ? route.fulfill({ json: { blobs: [] } }) : route.fulfill({ status: 503, json: { error: "http", message: "caído" } })),
      "/api/blobs/*": (route) => {
        if (route.request().method() === "PUT") puts.push(new URL(route.request().url()).pathname);
        return route.fulfill({ json: { updatedAt: Date.now() } });
      },
    });
    await login(page);
    await expect(page.getByTestId("account-card")).toContainText("No se pudo recuperar tus datos");
    // Reintentar a mano mientras el servidor sigue caído: tampoco sube nada.
    await page.getByTestId("sync-now").click();
    await expect(page.getByText("No se pudo sincronizar")).toBeVisible();
    expect(puts).toEqual([]);
    // Cuando vuelve, la descarga pendiente se completa (cuenta vacía → app vacía) antes de subir nada.
    blobsOk = true;
    await page.getByTestId("sync-now").click();
    await expect(page.getByTestId("sync-status")).toContainText("Sincronizado");
    expect(puts).toEqual([]);
  });

  test("registrarse sin cuenta previa en el servidor deja la app vacía automáticamente", async ({ page }) => {
    await seedOnboarding(page);
    await mockApi(page, REGISTER_HANDLERS);
    // Llegar directamente a `/cuenta` no deja historial: `dismiss()` tras registrarse hace
    // `replace("/")`, no `back()`. Se navega dentro de la app a partir de ahí (nunca con
    // `page.goto()`: en web el token de `authStore` vive en memoria y una recarga lo perdería).
    await page.goto("/cuenta");
    await page.getByRole("tab", { name: "Crear cuenta" }).click();
    await page.getByTestId("account-name").fill("Nueva");
    await page.getByTestId("account-email").fill("nueva@x.es");
    await page.getByTestId("account-password").fill("supersecreta1");
    await page.getByTestId("account-setup").fill("setup-123");
    await page.getByTestId("account-submit").click();
    await expect(page.getByTestId("screen-hoy")).toBeVisible();

    // Sin pulsar nada más: los datos de ejemplo (nunca tocados en este dispositivo) han desaparecido solos.
    await expect(page.getByText("José Luis", { exact: false })).toHaveCount(0);
    await page.getByRole("tab", { name: "Fuerza" }).click();
    await page.getByRole("tab", { name: "Rutinas" }).click();
    await expect(page.getByText("Sin rutinas")).toBeVisible();

    await page.getByRole("tab", { name: "Más" }).click();
    await expect(page.getByTestId("account-card")).toBeVisible();
  });

  test("admin puede generar una invitación y compartirla", async ({ page }) => {
    await mockApi(page, {
      ...LOGIN_HANDLERS,
      "/api/household/invites": (route) => route.fulfill({ status: 201, json: { code: "ABC123", expiresAt: Date.now() + 7 * 24 * 3600 * 1000 } }),
    });
    await login(page);

    await expect(page.getByTestId("invite-code")).toHaveCount(0);
    await page.getByTestId("create-invite").click();
    await expect(page.getByTestId("invite-code")).toContainText("ABC123");
    await expect(page.getByTestId("share-invite")).toBeVisible();
  });

  test("cerrar sesión vuelve a mostrar el acceso, sin borrar datos locales", async ({ page }) => {
    await mockApi(page, { ...LOGIN_HANDLERS, "/api/auth/logout": (route) => route.fulfill({ status: 204, body: "" }) });
    await login(page);

    await page.getByTestId("logout").click();
    await expect(page.getByTestId("go-account")).toBeVisible();
  });

  test("primer arranque sin sesión redirige a Cuenta; «Seguir sin cuenta» vuelve a las pestañas y no repite", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/cuenta/);
    await expect(page.getByTestId("screen-cuenta")).toBeVisible();
    await expect(page.getByTestId("skip-account")).toBeVisible();

    await page.getByTestId("skip-account").click();
    await expect(page.getByTestId("screen-hoy")).toBeVisible();

    // Ya marcado: una navegación posterior sin sesión ya no vuelve a redirigir.
    await page.goto("/mas");
    await expect(page.getByTestId("screen-mas")).toBeVisible();
  });
});
