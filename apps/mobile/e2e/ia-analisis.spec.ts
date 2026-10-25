import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * 0.18: asistente con más contexto (perfil, Hoy), conversación que no se pierde al cerrar,
 * reintentar, sugerencias; análisis con IA de carreras y de la semana. Todo `/api/**` va
 * interceptado (sin red ni cuota de IA). Tras iniciar sesión se navega por dentro de la app: en la
 * web el token vive en memoria y un `page.goto()` lo perdería (ver `ai.spec.ts`).
 */
type Handler = (route: Route) => Promise<void> | void;

const pad = (n: number) => String(n).padStart(2, "0");
const d = new Date();
const TODAY = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const ACTIVITY = { id: "run-hoy", date: TODAY, type: "run", source: "garmin", title: "Rodaje del río", distanceM: 8000, durationS: 2640, avgHr: 152, externalId: "hc-1" };

const ANALYSIS = { headline: "Rodaje sólido y regular", highlights: ["Ritmo estable a 5:30/km"], warnings: [], nextTime: ["Añade 1 km la próxima semana"], score: 8 };

function blobs() {
  return {
    blobs: [
      { key: "cf_running_v1", updatedAt: 1, data: { state: { activities: [ACTIVITY], templates: [], planned: [] }, version: 6 } },
      {
        key: "cf_nutrition_v1",
        updatedAt: 1,
        data: { state: { profile: { name: "Chelu", sex: "male", age: 34, heightCm: 178, weightKg: 77, activity: 1.55, goal: "lose" } }, version: 7 },
      },
    ],
  };
}

async function mockApi(page: Page, handlers: Record<string, Handler>) {
  await page.route("https://cheluisfit.redgarverde.com/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const all: Record<string, Handler> = {
      "/api/auth/login": (r) => r.fulfill({ json: { token: "t-1", user: { id: "u1", name: "Chelu", email: "chelu@x.es", role: "admin" } } }),
      "/api/me": (r) => r.fulfill({ json: { user: { id: "u1", name: "Chelu", email: "chelu@x.es", role: "admin" }, household: { id: "h1", name: "CheluisFIT", members: [] } } }),
      "/api/blobs": (r) => r.fulfill({ json: blobs() }),
      ...handlers,
    };
    if (all[path]) return all[path](route);
    if (path.startsWith("/api/blobs/")) return route.fulfill({ json: { updatedAt: Date.now() } });
    return route.fulfill({ status: 404, json: { error: "not_found", message: "no mockeado" } });
  });
}

async function login(page: Page) {
  await page.goto("/mas");
  await page.getByTestId("go-account").click();
  await page.getByTestId("account-email").fill("chelu@x.es");
  await page.getByTestId("account-password").fill("supersecreta1");
  await page.getByTestId("account-submit").click();
  await expect(page.getByTestId("account-card")).toBeVisible();
}

test.describe("Asistente de IA (0.18)", () => {
  test("sugerencias, contexto con perfil y Hoy, y la conversación sigue al cerrar y volver", async ({ page }) => {
    const bodies: { context: string; messages: { content: string }[] }[] = [];
    await mockApi(page, {
      "/api/ai/chat": async (route) => {
        bodies.push(route.request().postDataJSON());
        await route.fulfill({ json: { reply: `Respuesta ${bodies.length}`, proposals: [] } });
      },
    });
    await login(page);
    await page.getByRole("tab", { name: "Hoy" }).click();
    await page.getByTestId("ai-assistant-bubble").click();
    const panel = page.getByTestId("ai-assistant-panel");
    await panel.getByRole("button", { name: "¿Cómo va mi semana?" }).click();
    await expect(panel.getByText("Respuesta 1")).toBeVisible();
    expect(bodies[0].context).toContain(`Hoy es ${TODAY}`);
    expect(bodies[0].context).toContain("hombre, 34 años");
    expect(bodies[0].context).toContain("Últimos 7 días:");
    expect(bodies[0].context).toContain("1 carreras (8 km)");

    await panel.getByRole("button", { name: "Cerrar" }).click();
    await page.getByTestId("ai-assistant-bubble").click();
    await expect(panel.getByText("Respuesta 1")).toBeVisible(); // no se ha borrado
    await panel.getByTestId("ai-new-conversation").click();
    await expect(panel.getByText("Respuesta 1")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: "¿Cómo va mi semana?" })).toBeVisible();
  });

  test("si falla, «Reintentar» vuelve a mandar el mismo mensaje sin duplicarlo", async ({ page }) => {
    let calls = 0;
    const lastMessages: string[][] = [];
    await mockApi(page, {
      "/api/ai/chat": async (route) => {
        calls++;
        lastMessages.push((route.request().postDataJSON().messages as { content: string }[]).map((m) => m.content));
        if (calls === 1) return route.fulfill({ status: 502, json: { error: "bad_gateway", message: "La IA no responde ahora mismo, prueba en un rato" } });
        await route.fulfill({ json: { reply: "Ahora sí.", proposals: [] } });
      },
    });
    await login(page);
    await page.getByRole("tab", { name: "Running" }).click();
    await page.getByTestId("ai-assistant-bubble").click();
    const panel = page.getByTestId("ai-assistant-panel");
    await page.getByTestId("ai-input").fill("¿Qué tal mi última carrera?");
    await page.getByTestId("ai-send").click();
    await expect(panel.getByText("La IA no responde ahora mismo")).toBeVisible();
    await panel.getByRole("button", { name: "Reintentar" }).click();
    await expect(panel.getByText("Ahora sí.")).toBeVisible();
    await expect(panel.getByText("La IA no responde ahora mismo")).toHaveCount(0);
    expect(lastMessages[1]).toEqual(["¿Qué tal mi última carrera?"]);
  });

  test("una nota desde la sesión abierta va a esa sesión", async ({ page }) => {
    let context = "";
    await mockApi(page, {
      "/api/ai/analyze": (route) => route.fulfill({ json: { analysis: ANALYSIS } }),
      "/api/ai/chat": async (route) => {
        context = route.request().postDataJSON().context;
        await route.fulfill({ json: { reply: "", proposals: [{ type: "add_note", note: "Piernas cargadas" }] } });
      },
    });
    await login(page);
    await page.getByRole("tab", { name: "Running" }).click();
    await page.getByTestId("activity-run-hoy").click();
    await expect(page.getByTestId("screen-sesion")).toBeVisible();
    await page.getByTestId("ai-assistant-bubble").click();
    await page.getByTestId("ai-input").fill("Apunta que tenía las piernas cargadas");
    await page.getByTestId("ai-send").click();
    await page.getByTestId("ai-assistant-panel").getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByText("Nota añadida a esta sesión")).toBeVisible();
    expect(context).toContain("Pantalla actual: la sesión «Rodaje del río»");
  });
});

test.describe("Análisis con IA", () => {
  test("una carrera reciente se analiza sola al abrirla y no se vuelve a pedir", async ({ page }) => {
    let calls = 0;
    let body: { kind: string; data: string; goal: string } | null = null;
    await mockApi(page, {
      "/api/ai/analyze": async (route) => {
        calls++;
        body = route.request().postDataJSON();
        await route.fulfill({ json: { analysis: ANALYSIS } });
      },
    });
    await login(page);
    await page.getByRole("tab", { name: "Running" }).click();
    await page.getByTestId("activity-run-hoy").click();
    const card = page.getByTestId("analysis-card");
    await expect(card.getByText("Rodaje sólido y regular")).toBeVisible();
    await expect(card.getByText("8/10")).toBeVisible();
    await expect(card.getByText("Añade 1 km la próxima semana")).toBeVisible();
    expect(body!.kind).toBe("run");
    expect(body!.data).toContain("Carrera «Rodaje del río»");
    expect(body!.data).toContain("FC media 152 ppm");
    expect(body!.goal).toContain("Bajar peso");

    await page.goBack();
    await page.getByTestId("activity-run-hoy").click();
    await expect(card.getByText("Rodaje sólido y regular")).toBeVisible();
    expect(calls).toBe(1); // guardado con la sesión
  });

  test("informe semanal: gráficos y análisis de la semana, que luego sale en Hoy", async ({ page }) => {
    await mockApi(page, {
      "/api/ai/analyze": (route) => route.fulfill({ json: { analysis: { ...ANALYSIS, headline: "Semana constante" } } }),
    });
    await login(page);
    await page.getByTestId("go-informe").click();
    await expect(page.getByTestId("screen-informe")).toBeVisible();
    await expect(page.getByTestId("week-title")).toHaveText("Esta semana");
    await expect(page.getByText("Minutos por zona de pulso")).toBeVisible();
    await page.getByTestId("week-analysis-run").click();
    await expect(page.getByTestId("week-analysis").getByText("Semana constante")).toBeVisible();
    await page.getByTestId("week-prev").click();
    await expect(page.getByTestId("week-title")).toHaveText("La semana pasada");
    await expect(page.getByTestId("week-analysis-run")).toBeVisible();

    await page.getByRole("button", { name: "Volver" }).first().click();
    await page.getByRole("tab", { name: "Hoy" }).click();
    await expect(page.getByTestId("hoy-informe")).toContainText("Semana constante");
  });
});
