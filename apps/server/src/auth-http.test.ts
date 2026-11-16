import { describe, expect, it } from "vitest";
import { safeEqual, bearerToken, hashToken } from "./auth";
import { HttpError, toUser, perUserKey, logSafeError } from "./http";

describe("safeEqual", () => {
  it("devuelve true para cadenas iguales", () => {
    expect(safeEqual("abc123", "abc123")).toBe(true);
  });

  it("devuelve false para cadenas distintas", () => {
    expect(safeEqual("abc123", "xyz789")).toBe(false);
  });

  it("devuelve false para cadenas vacías vs no vacías", () => {
    expect(safeEqual("", "algo")).toBe(false);
  });

  it("devuelve true para dos cadenas vacías", () => {
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("bearerToken", () => {
  it("extrae el token de una cabecera válida", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
  });

  it("es case-insensitive en 'Bearer'", () => {
    expect(bearerToken("bearer abc123")).toBe("abc123");
    expect(bearerToken("BEARER abc123")).toBe("abc123");
  });

  it("devuelve undefined sin cabecera", () => {
    expect(bearerToken(undefined)).toBeUndefined();
  });

  it("devuelve undefined con formato incorrecto", () => {
    expect(bearerToken("Basic abc123")).toBeUndefined();
    expect(bearerToken("Token abc123")).toBeUndefined();
    expect(bearerToken("")).toBeUndefined();
  });
});

describe("hashToken", () => {
  it("devuelve un hash hex de 64 caracteres (SHA-256)", () => {
    const h = hashToken("test-token");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("es determinista", () => {
    expect(hashToken("foo")).toBe(hashToken("foo"));
  });

  it("produce hashes distintos para tokens distintos", () => {
    expect(hashToken("a")).not.toBe(hashToken("b"));
  });
});

describe("HttpError", () => {
  it("tiene status y message", () => {
    const err = new HttpError(404, "No encontrado");
    expect(err.status).toBe(404);
    expect(err.message).toBe("No encontrado");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("toUser", () => {
  it("extrae solo los campos de User de un row", () => {
    const row = { id: "u1", name: "Luis", email: "luis@test.com", role: "admin", household_id: "h1", password: "secret" };
    expect(toUser(row)).toEqual({ id: "u1", name: "Luis", email: "luis@test.com", role: "admin" });
  });
});

describe("perUserKey", () => {
  it("usa el hash del token si hay Authorization", () => {
    const key = perUserKey({ headers: { authorization: "Bearer tok123" }, ip: "1.2.3.4" });
    expect(key).toMatch(/^u:[0-9a-f]{32}$/);
  });

  it("cae a la IP si no hay Authorization", () => {
    const key = perUserKey({ headers: {}, ip: "1.2.3.4" });
    expect(key).toBe("ip:1.2.3.4");
  });

  it("produce claves distintas para tokens distintos", () => {
    const k1 = perUserKey({ headers: { authorization: "Bearer a" }, ip: "1.1.1.1" });
    const k2 = perUserKey({ headers: { authorization: "Bearer b" }, ip: "1.1.1.1" });
    expect(k1).not.toBe(k2);
  });
});

describe("logSafeError", () => {
  it("resume un Error normal", () => {
    const e = new Error("boom");
    e.name = "TestError";
    const result = logSafeError(e);
    expect(result).toEqual({ name: "TestError", message: "boom", statusCode: undefined, url: undefined });
  });

  it("incluye statusCode y url si existen", () => {
    const e = Object.assign(new Error("fail"), { statusCode: 502, url: "https://api.example.com" });
    const result = logSafeError(e);
    expect(result.statusCode).toBe(502);
    expect(result.url).toBe("https://api.example.com");
  });

  it("recorta mensajes largos a 500 caracteres", () => {
    const e = new Error("x".repeat(1000));
    expect(logSafeError(e).message.length).toBe(500);
  });

  it("maneja valores no-Error", () => {
    expect(logSafeError("cadena")).toEqual({ message: "cadena" });
    expect(logSafeError(42)).toEqual({ message: "42" });
    expect(logSafeError(null)).toEqual({ message: "null" });
  });
});
