import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * 0.20: perfil público separado de lo privado, avisos, seguidores y arreglos del feed. Todo
 * `/api/**` interceptado; tras iniciar sesión se navega por dentro de la app (el token vive en
 * memoria en la web, ver `social.spec.ts`).
 */
const ME = { id: "u1", name: "José Luis García", email: "chelu@x.es", role: "admin" };

const myProfile = (over: Record<string, unknown> = {}) => ({
  username: "chelu",
  displayName: "Chelu",
  bio: "",
  city: "",
  sports: [],
  avatarMediaId: null,
  coverMediaId: null,
  isPrivate: false,
  stats: [
    { key: "kmMonth", label: "Km este mes", value: "42,5", unit: "km", visible: true },
    { key: "pr5k", label: "Mejor 5K", value: "23:10", detail: "3 oct", visible: true },
  ],
  ...over,
});

const publicProfile = (p: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  profile: {
    id: "u1",
    username: p.username,
    name: p.displayName,
    displayName: p.displayName,
    bio: p.bio,
    city: p.city,
    sports: p.sports,
    isPrivate: p.isPrivate,
    stats: (p.stats as { visible: boolean }[]).filter((s) => s.visible).map(({ visible: _v, ...s }) => s),
  },
  followState: "self",
  followsMe: false,
  counts: { posts: 0, followers: 1, following: 0 },
  posts: [],
  nextCursor: null,
  ...over,
});

async function setup(page: Page, social: (method: string, path: string, route: Route) => Promise<boolean | void> | boolean | void) {
  await page.route("https://cheluisfit.redgarverde.com/api/**", async (route) => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/auth/login") return route.fulfill({ json: { token: "t-1", user: ME } });
    if (url.pathname === "/api/me" && method === "GET") return route.fulfill({ json: { user: ME, household: { id: "h1", name: "CheluisFIT", members: [] } } });
    if (url.pathname === "/api/blobs") return route.fulfill({ json: { blobs: [] } });
    if (url.pathname.startsWith("/api/blobs/")) return route.fulfill({ json: { updatedAt: Date.now() } });
    if (url.pathname.startsWith("/api/")) {
      const handled = await social(method, url.pathname, route);
      if (handled !== false) return;
    }
    if (url.pathname === "/api/social/notifications/unread-count") return route.fulfill({ json: { count: 0 } });
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

test.describe("Perfil público y privado", () => {
  test("editar el perfil público: nombre, ciudad, deportes y qué estadística se enseña; luego se ve así", async ({ page }) => {
    let mine = myProfile();
    let saved: Record<string, unknown> | null = null;
    await setup(page, async (method, path, route) => {
      if (path === "/api/social/profile/stats") return route.fulfill({ json: { ok: true } });
      if (path === "/api/social/profile" && method === "GET") return route.fulfill({ json: mine });
      if (path === "/api/social/profile" && method === "PUT") {
        saved = route.request().postDataJSON();
        const hidden = (saved!.hiddenStats as string[]) ?? [];
        mine = { ...mine, ...(saved as object), stats: mine.stats.map((s) => ({ ...s, visible: !hidden.includes(s.key) })) };
        return route.fulfill({ json: { ok: true } });
      }
      if (path === "/api/social/users/chelu") return route.fulfill({ json: publicProfile(mine) });
      if (path === "/api/social/follows/pending") return route.fulfill({ json: { requests: [] } });
      return false;
    });
    await login(page);
    await page.getByTestId("go-edit-social-profile").click();
    await expect(page.getByTestId("screen-editar-perfil")).toBeVisible();
    await expect(page.getByText("Tu nombre real, tu correo y tus datos de salud")).toBeVisible();
    await expect(page.getByTestId("save-profile")).toBeDisabled();

    await page.getByTestId("profile-display-name-input").fill("El Rayo");
    await page.getByTestId("profile-city-input").fill("Murcia");
    await page.getByTestId("sport-running").click();
    await page.getByTestId("stat-pr5k").click(); // ocultar el récord de 5K
    await page.getByTestId("save-profile").click();
    await expect(page.getByText("Perfil guardado")).toBeVisible();
    expect(saved).toMatchObject({ displayName: "El Rayo", city: "Murcia", sports: ["running"], hiddenStats: ["pr5k"] });
    expect(saved).not.toHaveProperty("username"); // sin cambiar no se manda

    await page.getByRole("tab", { name: "Social" }).click();
    await page.getByTestId("open-my-profile").click();
    await expect(page.getByTestId("profile-display-name")).toHaveText("El Rayo");
    await expect(page.getByText("Murcia")).toBeVisible();
    await expect(page.getByTestId("profile-sports")).toContainText("Running");
    await expect(page.getByTestId("profile-stats")).toContainText("Km este mes");
    await expect(page.getByTestId("profile-stats")).not.toContainText("Mejor 5K");
  });

  test("@usuario ocupado: el error sale en el campo, no se pierde lo escrito", async ({ page }) => {
    await setup(page, async (method, path, route) => {
      if (path === "/api/social/profile/stats") return route.fulfill({ json: { ok: true } });
      if (path === "/api/social/profile" && method === "GET") return route.fulfill({ json: myProfile() });
      if (path === "/api/social/profile" && method === "PUT") return route.fulfill({ status: 409, json: { error: "conflict", message: "Ese nombre de usuario ya está en uso" } });
      return false;
    });
    await login(page);
    await page.getByTestId("go-edit-social-profile").click();
    await page.getByTestId("profile-username-input").fill("ana");
    await expect(page.getByText("los enlaces antiguos a tu perfil dejarán de funcionar")).toBeVisible();
    await page.getByTestId("save-profile").click();
    await expect(page.getByText("Ese nombre de usuario ya está en uso")).toBeVisible();
    await expect(page.getByTestId("profile-username-input")).toHaveValue("ana");
  });

  test("datos privados de la cuenta: nombre real, correo y contraseña", async ({ page }) => {
    let body: Record<string, unknown> | null = null;
    await setup(page, async (method, path, route) => {
      if (path === "/api/me" && method === "PUT") {
        body = route.request().postDataJSON();
        return route.fulfill({ json: { user: { ...ME, ...(body as object) } } });
      }
      if (path === "/api/me/password") return route.fulfill({ status: 403, json: { error: "forbidden", message: "La contraseña actual no es correcta" } });
      return false;
    });
    await login(page);
    await page.getByTestId("go-account-data").click();
    await expect(page.getByText("Esto no se enseña en Social")).toBeVisible();
    await page.getByTestId("account-name").fill("José Luis García Valverde");
    await page.getByTestId("save-account").click();
    await expect(page.getByText("Datos de la cuenta guardados")).toBeVisible();
    expect(body).toMatchObject({ name: "José Luis García Valverde", email: "chelu@x.es" });
    await page.getByTestId("password-current").fill("mala");
    await page.getByTestId("password-new").fill("nuevaclave1");
    await page.getByTestId("change-password").click();
    await expect(page.getByText("La contraseña actual no es correcta")).toBeVisible();
  });
});

test.describe("Avisos y seguidores", () => {
  const now = Date.now();
  const notifications = [
    { id: "n1", kind: "follow_request", createdAt: now - 60_000, read: false, actor: { id: "u3", name: "Bea", username: "bea" }, pending: true },
    { id: "n2", kind: "comment", createdAt: now - 3_600_000, read: false, actor: { id: "u2", name: "Ana", username: "ana" }, postId: "p1", postText: "Rodaje", commentText: "¡Qué ritmo!" },
    { id: "n3", kind: "like", createdAt: now - 10 * 86_400_000, read: true, actor: { id: "u2", name: "Ana", username: "ana" }, postId: "p1", postText: "Rodaje" },
  ];

  test("la campana enseña los nuevos; aceptar una solicitud desde la bandeja; al salir quedan leídos", async ({ page }) => {
    let accepted = false;
    let markedRead = false;
    let unread = 2;
    await setup(page, async (method, path, route) => {
      if (path === "/api/social/notifications/unread-count") return route.fulfill({ json: { count: unread } });
      if (path === "/api/social/feed") return route.fulfill({ json: { posts: [], nextCursor: null } });
      if (path === "/api/social/notifications") return route.fulfill({ json: { notifications, nextCursor: null } });
      if (path === "/api/social/notifications/read") {
        markedRead = true;
        unread = 0;
        return route.fulfill({ json: { ok: true } });
      }
      if (path === "/api/social/follows/bea/accept") {
        accepted = true;
        return route.fulfill({ status: 204, body: "" });
      }
      return false;
    });
    await login(page);
    await expect(page.getByTestId("social-unread-dot")).toBeVisible();
    await page.getByRole("tab", { name: /Social/ }).click();
    await expect(page.getByTestId("notifications-badge")).toHaveText("2");
    await page.getByTestId("open-notifications").click();
    await expect(page.getByTestId("screen-avisos")).toBeVisible();
    await expect(page.getByTestId("screen-avisos").getByText(/^hoy$/i)).toBeVisible();
    await expect(page.getByTestId("screen-avisos").getByText(/^antes$/i)).toBeVisible();
    await expect(page.getByText("quiere seguirte")).toBeVisible();
    await expect(page.getByText("«¡Qué ritmo!»")).toBeVisible();
    await page.getByTestId("accept-bea").click();
    await expect(page.getByText("Bea ya te sigue")).toBeVisible();
    expect(accepted).toBe(true);
    await expect(page.getByTestId("accept-bea")).toHaveCount(0);
    await page.getByRole("button", { name: "Volver" }).first().click();
    await expect(page.getByTestId("notifications-badge")).toHaveCount(0);
    expect(markedRead).toBe(true);
  });

  test("tocar «Seguidores» abre la lista y desde ella el perfil; dejar de seguir pide confirmación", async ({ page }) => {
    let unfollowed = false;
    const ana = {
      profile: { id: "u2", username: "ana", name: "Ana", displayName: "Ana", bio: "", city: "Lorca", sports: ["gym"], isPrivate: true, stats: [] },
      followState: "accepted",
      followsMe: true,
      counts: { posts: 0, followers: 1, following: 1 },
      posts: [],
      nextCursor: null,
    };
    await setup(page, async (method, path, route) => {
      if (path === "/api/social/feed") return route.fulfill({ json: { posts: [], nextCursor: null } });
      if (path === "/api/social/profile/stats") return route.fulfill({ json: { ok: true } });
      if (path === "/api/social/profile") return route.fulfill({ json: myProfile() });
      if (path === "/api/social/users/chelu") return route.fulfill({ json: publicProfile(myProfile()) });
      if (path === "/api/social/follows/pending") return route.fulfill({ json: { requests: [] } });
      if (path === "/api/social/users/chelu/followers") return route.fulfill({ json: { users: [{ id: "u2", username: "ana", name: "Ana", followState: "accepted" }] } });
      if (path === "/api/social/users/ana") return route.fulfill({ json: unfollowed ? { ...ana, followState: "none", posts: null } : ana });
      if (path === "/api/social/follows/ana" && method === "DELETE") {
        unfollowed = true;
        return route.fulfill({ status: 204, body: "" });
      }
      return false;
    });
    await login(page);
    await page.getByRole("tab", { name: /Social/ }).click();
    await page.getByTestId("open-my-profile").click();
    await page.getByTestId("open-followers").click();
    await expect(page.getByTestId("screen-conexiones")).toBeVisible();
    await expect(page.getByText("Le sigues")).toBeVisible();
    await page.getByTestId("connection-ana").click();
    await expect(page.getByText("@ana · Te sigue")).toBeVisible();
    await expect(page.getByText("Lorca")).toBeVisible();
    await page.getByTestId("follow-toggle").click();
    await expect(page.getByTestId("confirm-unfollow-confirm")).toBeVisible();
    await expect(page.getByText("tendrás que pedírselo otra vez")).toBeVisible();
    expect(unfollowed).toBe(false); // nada hasta confirmar
    await page.getByTestId("confirm-unfollow-confirm").click();
    await expect(page.getByText("Cuenta privada")).toBeVisible();
    expect(unfollowed).toBe(true);
  });
});
