import type { Page, Route } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * Mismo patrón que `ai.spec.ts`/`cuenta.spec.ts`: se intercepta `/api/**` para no depender de
 * red real. Tras iniciar sesión, navegar por dentro de la app (pestañas), nunca con
 * `page.goto()` — en web el token de `authStore` vive en memoria (ver AGENTS.md), una
 * navegación de página completa lo perdería.
 */
type RouteHandler = (route: Route) => Promise<void> | void;

async function mockApi(page: Page, handlers: Record<string, RouteHandler>) {
  await page.route("https://cheluisfit.redgarverde.com/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const handler = handlers[path] ?? (path.startsWith("/api/blobs/") ? handlers["/api/blobs/*"] : undefined);
    if (handler) return handler(route);
    return route.fulfill({ status: 404, json: { error: "not_found", message: "no mockeado" } });
  });
}

/** Rutas sociales con segmentos dinámicos (`:id`/`:username`) — se despachan por regex. */
async function mockSocial(page: Page, dispatch: (method: string, pathname: string, route: Route) => Promise<boolean | void> | boolean | void) {
  await page.route("https://cheluisfit.redgarverde.com/api/social/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const handled = await dispatch(route.request().method(), pathname, route);
    if (handled === false) return route.fulfill({ status: 404, json: { error: "not_found", message: "no mockeado" } });
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

const post = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "p1",
  kind: "free",
  text: "Buen rodaje hoy",
  snapshot: { snapshotVersion: 1, kind: "free" },
  createdAt: Date.now() - 60_000,
  author: { id: "u2", name: "Ana", username: "ana" },
  media: [],
  likesCount: 0,
  likedByMe: false,
  commentsCount: 0,
  ...over,
});

test.describe("Social", () => {
  test("sin sesión, la pestaña Social pide iniciar sesión", async ({ page }) => {
    await page.goto("/social");
    await expect(page.getByText("Inicia sesión para ver el feed")).toBeVisible();
  });

  test("con sesión, el feed pinta los posts del servidor", async ({ page }) => {
    await mockApi(page, LOGIN_HANDLERS);
    await mockSocial(page, (method, path, route) => {
      if (method === "GET" && path === "/api/social/feed") return route.fulfill({ json: { posts: [post()], nextCursor: null } });
    });
    await login(page);
    await page.getByRole("tab", { name: "Social" }).click();
    await expect(page.getByTestId("post-p1")).toContainText("Ana");
    await expect(page.getByTestId("post-p1")).toContainText("Buen rodaje hoy");
  });

  test("dar «me gusta» cambia el contador al momento", async ({ page }) => {
    await mockApi(page, LOGIN_HANDLERS);
    let liked = false;
    await mockSocial(page, (method, path, route) => {
      if (method === "GET" && path === "/api/social/feed") return route.fulfill({ json: { posts: [post({ likesCount: liked ? 1 : 0, likedByMe: liked })], nextCursor: null } });
      if (path === "/api/social/posts/p1/like") {
        liked = method === "PUT";
        return route.fulfill({ status: method === "PUT" ? 204 : 204, body: "" });
      }
    });
    await login(page);
    await page.getByRole("tab", { name: "Social" }).click();
    await expect(page.getByTestId("post-p1")).toContainText("0");
    await page.getByTestId("like-p1").click();
    await expect(page.getByTestId("post-p1")).toContainText("1");
  });

  test("publicar una publicación libre navega al detalle", async ({ page }) => {
    await mockApi(page, LOGIN_HANDLERS);
    await mockSocial(page, (method, path, route) => {
      if (method === "GET" && path === "/api/social/feed") return route.fulfill({ json: { posts: [], nextCursor: null } });
      if (method === "POST" && path === "/api/social/posts") return route.fulfill({ status: 201, json: { id: "new-1" } });
      if (method === "GET" && path === "/api/social/posts/new-1") return route.fulfill({ json: post({ id: "new-1", text: "Mi primera publicación", author: { id: "u1", name: "Chelu", username: "chelu" } }) });
      if (method === "GET" && path === "/api/social/posts/new-1/comments") return route.fulfill({ json: { comments: [] } });
    });
    await login(page);
    await page.getByRole("tab", { name: "Social" }).click();
    await page.getByRole("button", { name: "Publicar" }).click();
    await expect(page.getByTestId("screen-publicar")).toBeVisible();
    await page.getByTestId("publish-text").fill("Mi primera publicación");
    await page.getByTestId("publish-submit").click();
    await expect(page.getByTestId("screen-post-detalle")).toContainText("Mi primera publicación");
  });

  test("comentar aparece en la lista, y se puede borrar", async ({ page }) => {
    await mockApi(page, LOGIN_HANDLERS);
    const comments: { id: string; text: string; createdAt: number; author: { id: string; name: string; username: string } }[] = [];
    await mockSocial(page, (method, path, route) => {
      if (method === "GET" && path === "/api/social/feed") return route.fulfill({ json: { posts: [post()], nextCursor: null } });
      if (method === "GET" && path === "/api/social/posts/p1") return route.fulfill({ json: post() });
      if (method === "GET" && path === "/api/social/posts/p1/comments") return route.fulfill({ json: { comments } });
      if (method === "POST" && path === "/api/social/posts/p1/comments") {
        const text = (route.request().postDataJSON() as { text: string }).text;
        const c = { id: "c1", text, createdAt: Date.now(), author: { id: "u1", name: "Chelu", username: "chelu" } };
        comments.push(c);
        return route.fulfill({ status: 201, json: { id: c.id } });
      }
      if (method === "DELETE" && path === "/api/social/comments/c1") {
        comments.length = 0;
        return route.fulfill({ status: 204, body: "" });
      }
    });
    await login(page);
    await page.getByRole("tab", { name: "Social" }).click();
    await page.getByRole("button", { name: "Ver comentarios" }).click();
    await expect(page.getByTestId("screen-post-detalle")).toBeVisible();
    await page.getByTestId("comment-input").fill("Qué crack");
    await page.getByTestId("comment-send").click();
    await expect(page.getByTestId("comment-c1")).toContainText("Qué crack");
    await page.getByTestId("comment-c1").getByRole("button", { name: "Borrar comentario" }).click();
    await page.getByTestId("confirm-delete-confirm").click();
    await expect(page.getByTestId("comment-c1")).toHaveCount(0);
  });

  test("perfil: seguir cambia el botón; perfil privado sin follow no enseña posts", async ({ page }) => {
    await mockApi(page, LOGIN_HANDLERS);
    let state: "none" | "pending" = "none";
    await mockSocial(page, (method, path, route) => {
      if (method === "GET" && path === "/api/social/feed") return route.fulfill({ json: { posts: [post()], nextCursor: null } });
      if (method === "GET" && path === "/api/social/users/ana")
        return route.fulfill({
          json: {
            profile: { id: "u2", username: "ana", name: "Ana", bio: "", isPrivate: true },
            followState: state,
            counts: { posts: 1, followers: 0, following: 0 },
            posts: state === "pending" || state === "none" ? null : [],
          },
        });
      if (method === "PUT" && path === "/api/social/follows/ana") {
        state = "pending";
        return route.fulfill({ status: 201, json: { status: "pending" } });
      }
    });
    await login(page);
    await page.getByRole("tab", { name: "Social" }).click();
    await page.getByRole("button", { name: "Ver perfil de Ana" }).click();
    await expect(page.getByText("Cuenta privada")).toBeVisible();
    await page.getByTestId("follow-toggle").click();
    await expect(page.getByTestId("follow-toggle")).toContainText("Solicitado");
  });

  test("buscador de personas: menos de 2 letras no busca, una búsqueda real enseña resultados y navega al perfil", async ({ page }) => {
    await mockApi(page, LOGIN_HANDLERS);
    await mockSocial(page, (method, path, route) => {
      if (method === "GET" && path === "/api/social/feed") return route.fulfill({ json: { posts: [], nextCursor: null } });
      if (method === "GET" && path === "/api/social/search") {
        const q = new URL(route.request().url()).searchParams.get("q");
        return route.fulfill({ json: { users: q === "ana" ? [{ username: "ana", name: "Ana", avatarUrl: null }] : [] } });
      }
    });
    await login(page);
    await page.getByRole("tab", { name: "Social" }).click();
    await page.getByRole("button", { name: "Buscar personas" }).click();
    await expect(page.getByTestId("screen-buscar-personas")).toBeVisible();

    await page.getByTestId("search-users").fill("a");
    await expect(page.getByText("Escribe al menos 2 letras")).toBeVisible();

    await page.getByTestId("search-users").fill("ana");
    await expect(page.getByTestId("user-ana")).toContainText("Ana");
    await page.getByTestId("user-ana").click();
    await expect(page).toHaveURL(/\/social\/perfil\/ana/);
  });
});
