import AxeBuilder from "@axe-core/playwright";
import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";

const ROUTES = [
  "/",
  "/nutricion",
  "/running",
  "/mas",
  "/anadir?meal=lunch",
  "/alimento/off-8480000205049?meal=snack",
  "/escaner",
  "/crear-alimento",
  "/objetivo",
  "/sesion/act-3",
  "/plantilla/tpl-series-800",
  "/peso",
  "/medidas",
  "/nevera",
  "/escaner-foto",
  "/sesion/nueva",
  "/fuerza",
  "/social",
  "/ejercicio/Barbell_Bench_Press_-_Medium_Grip",
  "/crear-ejercicio",
  "/rutina/rt-pecho",
  "/entreno/detalle/none",
  "/galeria",
  "/cuenta",
];

for (const scheme of ["dark", "light"] as const) {
  test.describe(`axe · tema ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    for (const route of ROUTES) {
      test(route, async ({ page }) => {
        await page.addInitScript((s) => localStorage.setItem("cf_theme", s), scheme);
        await page.goto(route);
        await page.waitForTimeout(600);
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
          .analyze();
        expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
      });
    }
  });
}

for (const scheme of ["dark", "light"] as const) {
  test.describe(`axe · entrenamiento en curso · tema ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    const audit = async (page: import("@playwright/test").Page) => {
      await page.waitForTimeout(500); // que terminen las animaciones de hojas y pantallas
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      return violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`);
    };
    const begin = async (page: import("@playwright/test").Page) => {
      await page.addInitScript((s) => localStorage.setItem("cf_theme", s), scheme);
      await page.goto("/fuerza");
      await page.getByTestId("start-rt-pecho").first().click();
      await page.getByTestId("screen-entreno").waitFor();
      await page.waitForTimeout(600);
    };

    test("pantalla principal con descanso activo", async ({ page }) => {
      await begin(page);
      await page.getByTestId("done-1").click();
      expect(await audit(page)).toEqual([]);
    });

    test("hoja de esfuerzo, de tipo de serie y menú del ejercicio", async ({ page }) => {
      await begin(page);
      await page.getByTestId("effort-1").click();
      expect(await audit(page)).toEqual([]);
      await page.getByTestId("effort-opt-2").click();
      await page.getByTestId("set-label-2").click();
      expect(await audit(page)).toEqual([]);
      await page.getByRole("button", { name: "Cerrar", exact: true }).first().click();
      await page.getByTestId("exercise-menu").click();
      expect(await audit(page)).toEqual([]);
    });

    test("selector de ejercicios, resumen y detalle", async ({ page }) => {
      await begin(page);
      await page.getByTestId("circle-add").click();
      expect(await audit(page)).toEqual([]);
      await page.getByRole("button", { name: "Cerrar" }).first().click();
      await page.getByTestId("done-1").click();
      await page.getByTestId("finish").click();
      await page.getByTestId("finish-save").click();
      await page.getByTestId("screen-resumen").waitFor();
      expect(await audit(page)).toEqual([]);
    });
  });
}

// `/social/buscar` no aparece en `ROUTES`: a diferencia del resto de la lista, la pantalla
// devuelve `null` sin sesión (`buscar.tsx`), así que necesita una sesión simulada de verdad
// (login por la interfaz, nunca `page.goto()` — en web el token de `authStore` vive en memoria).
type RouteHandler = (route: Route) => Promise<void> | void;

async function mockApi(page: Page, handlers: Record<string, RouteHandler>) {
  await page.route("https://cheluisfit.redgarverde.com/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const handler = handlers[path] ?? (path.startsWith("/api/blobs/") ? handlers["/api/blobs/*"] : undefined);
    if (handler) return handler(route);
    return route.fulfill({ status: 404, json: { error: "not_found", message: "no mockeado" } });
  });
}

for (const scheme of ["dark", "light"] as const) {
  test.describe(`axe · buscar personas · tema ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("estado inicial y resultados de búsqueda", async ({ page }) => {
      await page.addInitScript((s) => localStorage.setItem("cf_theme", s), scheme);
      await mockApi(page, {
        "/api/auth/login": (route) => route.fulfill({ json: { token: "t-1", user: { id: "u1", name: "Chelu", email: "chelu@x.es", role: "admin" } } }),
        "/api/me": (route) =>
          route.fulfill({ json: { user: { id: "u1", name: "Chelu", email: "chelu@x.es", role: "admin" }, household: { id: "h1", name: "CheluisFIT", members: [] } } }),
        "/api/blobs": (route) => route.fulfill({ json: { blobs: [] } }),
        "/api/blobs/*": (route) => route.fulfill({ status: 204, body: "" }),
        "/api/social/search": (route) => route.fulfill({ json: { users: [{ username: "ana", name: "Ana", avatarUrl: null }] } }),
      });
      await page.goto("/mas");
      await page.getByTestId("go-account").click();
      await page.getByTestId("account-email").fill("chelu@x.es");
      await page.getByTestId("account-password").fill("supersecreta1");
      await page.getByTestId("account-submit").click();
      await expect(page.getByTestId("account-card")).toBeVisible();

      await page.getByRole("tab", { name: "Social" }).click();
      await page.getByRole("button", { name: "Buscar personas" }).click();
      await page.getByTestId("screen-buscar-personas").waitFor();
      await page.waitForTimeout(500);
      const empty = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(empty.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);

      await page.getByTestId("search-users").fill("ana");
      await page.getByTestId("user-ana").waitFor();
      const withResults = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(withResults.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    });
  });
}

