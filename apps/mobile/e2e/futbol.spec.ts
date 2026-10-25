import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

test.describe("Fútbol", () => {
  test("registrar un partido a mano con resultado y goles, verlo en la lista y en el resumen del mes", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("hoy-futbol").click();
    await expect(page.getByTestId("screen-futbol")).toBeVisible();
    await expect(page.getByText("Aún no hay partidos")).toBeVisible();

    await page.getByTestId("new-match").click();
    await page.getByTestId("m-title").fill("Pachanga del jueves");
    await page.getByTestId("m-km").fill("6,4");
    await page.getByTestId("m-add-score").click();
    await page.getByRole("button", { name: "Más tu equipo", exact: true }).click();
    await page.getByRole("button", { name: "Más tu equipo", exact: true }).click();
    await page.getByRole("button", { name: "Más rival", exact: true }).click();
    await page.getByRole("button", { name: "Más tus goles", exact: true }).click();
    await page.getByTestId("m-pos-medio").click();
    await page.getByTestId("save-match").click();

    await expect(page.getByTestId("screen-partido")).toBeVisible();
    await expect(page.getByTestId("match-score")).toContainText("2 – 1");
    await expect(page.getByTestId("match-score")).toContainText("Victoria");
    await expect(page.getByTestId("match-score")).toContainText("1 gol");
    await expect(page.getByTestId("match-score")).toContainText("Medio");

    await page.getByRole("button", { name: "Volver" }).first().click();
    await expect(page.getByTestId("screen-futbol")).toBeVisible();
    await expect(page.getByTestId("fb-matches")).toContainText("1");
    await expect(page.getByTestId("fb-goals")).toContainText("1");
    await expect(page.getByTestId("match-list")).toContainText("Pachanga del jueves");
  });

  test("apuntar el resultado después y borrar con «Deshacer»", async ({ page }) => {
    await page.goto("/futbol");
    await page.getByTestId("new-match").click();
    await page.getByTestId("save-match").click();
    await expect(page.getByTestId("match-score")).toContainText("Sin resultado");
    await page.getByTestId("edit-match").click();
    await page.getByTestId("m-add-score").click();
    await page.getByRole("button", { name: "Más rival", exact: true }).click();
    await page.getByTestId("save-match-info").click();
    await expect(page.getByTestId("match-score")).toContainText("0 – 1");
    await expect(page.getByTestId("match-score")).toContainText("Derrota");

    await page.getByRole("button", { name: "Borrar partido" }).click();
    await expect(page.getByText("Partido borrado")).toBeVisible();
    await page.getByRole("button", { name: "Deshacer" }).click();
    await expect(page.getByTestId("match-list")).toContainText("Partido");
  });
});

test.describe("Recuperar el acceso", () => {
  async function mock(page: Page, onReset: (body: Record<string, string>) => { status: number; json: unknown }) {
    await page.route("https://cheluisfit.redgarverde.com/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/api/auth/reset" || path === "/api/auth/admin-recovery") {
        const r = onReset({ ...route.request().postDataJSON(), path });
        return route.fulfill({ status: r.status, json: r.json });
      }
      if (path === "/api/me") return route.fulfill({ json: { user: { id: "u2", name: "Ana", email: "ana@x.es", role: "member" }, household: { id: "h1", name: "C", members: [] } } });
      if (path === "/api/blobs") return route.fulfill({ json: { blobs: [] } });
      if (path.startsWith("/api/blobs/")) return route.fulfill({ json: { updatedAt: 1 } });
      return route.fulfill({ status: 404, json: { error: "not_found", message: "no mockeado" } });
    });
  }

  test("con el código del administrador se pone una contraseña nueva y se entra", async ({ page }) => {
    let sent: Record<string, string> | null = null;
    await mock(page, (body) => {
      sent = body;
      return body.code === "ABCD2345"
        ? { status: 200, json: { token: "t-2", user: { id: "u2", name: "Ana", email: "ana@x.es", role: "member" } } }
        : { status: 400, json: { error: "bad_request", message: "El código no es válido o ha caducado" } };
    });
    await page.goto("/mas");
    await page.getByTestId("go-account").click();
    await page.getByTestId("forgot-password").click();
    await expect(page.getByTestId("recover-help")).toBeVisible();
    await page.getByTestId("reset-code").fill("zzzz9999");
    await page.getByTestId("account-password").fill("nuevaclave1");
    await page.getByTestId("account-submit").click();
    await expect(page.getByTestId("account-error")).toContainText("no es válido");
    await page.getByTestId("reset-code").fill("abcd2345");
    await page.getByTestId("account-submit").click();
    await expect(page.getByText("Contraseña cambiada. Ya estás dentro.")).toBeVisible();
    expect(sent).toMatchObject({ code: "ABCD2345", password: "nuevaclave1" });
    await expect(page.getByTestId("account-card")).toBeVisible();
  });

  test("el administrador usa su correo y el código de configuración", async ({ page }) => {
    let sent: Record<string, string> | null = null;
    await mock(page, (body) => {
      sent = body;
      return { status: 200, json: { token: "t-3", user: { id: "u1", name: "Chelu", email: "chelu@x.es", role: "admin" } } };
    });
    await page.goto("/mas");
    await page.getByTestId("go-account").click();
    await page.getByTestId("forgot-password").click();
    await page.getByRole("radio", { name: "Soy el administrador" }).click();
    await page.getByTestId("account-email").fill("Chelu@x.es");
    await page.getByTestId("recover-setup").fill("secreto");
    await page.getByTestId("account-password").fill("nuevaclave1");
    await page.getByTestId("account-submit").click();
    await expect(page.getByText("Contraseña cambiada. Ya estás dentro.")).toBeVisible();
    expect(sent).toMatchObject({ path: "/api/auth/admin-recovery", email: "chelu@x.es", setupCode: "secreto" });
  });
});
