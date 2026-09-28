// Cliente del servidor: cualquier fallo acaba como `ApiError` con un mensaje en español, nunca
// como el `SyntaxError`/`TypeError`/`AbortError` crudo que veía antes la pantalla.
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError } from "./api";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", (...args: unknown[]) => fetchMock(...args));
afterEach(() => {
  fetchMock.mockReset();
  vi.useRealTimers();
});

const res = (status: number, body: string) => new Response(body, { status, headers: { "content-type": "application/json" } });

describe("api", () => {
  it("una página de error HTML (Cloudflare) da ApiError con el status, no un SyntaxError", async () => {
    fetchMock.mockResolvedValueOnce(res(502, "<html>Bad gateway</html>"));
    const e = await api.me("t").catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect((e as ApiError).status).toBe(502);
  });

  it("un 200 con cuerpo que no es JSON también es un ApiError claro", async () => {
    fetchMock.mockResolvedValueOnce(res(200, "<html>portal cautivo</html>"));
    await expect(api.me("t")).rejects.toBeInstanceOf(ApiError);
  });

  it("sin red → ApiError(0) con mensaje en español", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    const e = (await api.me("t").catch((x: unknown) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(0);
    expect(e.message).toMatch(/Sin conexión/);
  });

  it("el 409 de un blob trae el cuerpo del servidor", async () => {
    fetchMock.mockResolvedValueOnce(res(409, JSON.stringify({ message: "cambiado", data: { state: {} }, updatedAt: 5 })));
    const e = (await api.putBlob("t", "cf_running_v1", { state: {} }, 3).catch((x: unknown) => x)) as ApiError;
    expect(e.status).toBe(409);
    expect((e.body as { updatedAt: number }).updatedAt).toBe(5);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("?base=3");
  });

  it("la IA con foto reintenta una vez un fallo de red, pero no un timeout", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Network request failed"));
    fetchMock.mockResolvedValueOnce(res(200, JSON.stringify({ items: ["Leche"] })));
    expect(await api.aiFridgeScan("t", "file://x.jpg")).toEqual({ items: ["Leche"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockReset();
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    fetchMock.mockRejectedValueOnce(abort);
    const e = (await api.aiFridgeScan("t", "file://x.jpg").catch((x: unknown) => x)) as ApiError;
    expect(e.message).toMatch(/tardó demasiado/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
