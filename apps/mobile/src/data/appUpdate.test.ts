import { describe, expect, it, vi } from "vitest";

vi.mock("react-native", () => ({ Platform: { OS: "android" }, AppState: { addEventListener: () => ({ remove() {} }) } }));
vi.mock("expo-constants", () => ({ default: { expoConfig: { android: { versionCode: 1100 } } } }));
vi.mock("./api", () => ({ API_BASE: "https://x" }));

const { newerThanInstalled } = await import("./appUpdate");

describe("aviso de APK nueva", () => {
  it("solo avisa si el versionCode publicado es mayor, con la URL que evita la caché de Cloudflare", () => {
    expect(newerThanInstalled({ version: "0.12.0", versionCode: 1200 }, 1100)).toEqual({ version: "0.12.0", url: "https://x/app.apk?v=0.12.0" });
    expect(newerThanInstalled({ version: "0.11.0", versionCode: 1100 }, 1100)).toBeNull();
    expect(newerThanInstalled({ version: "0.10.0", versionCode: 1000 }, 1100)).toBeNull();
    expect(newerThanInstalled(null, 1100)).toBeNull();
    expect(newerThanInstalled({ version: "0.12.0", versionCode: 1200 }, undefined)).toBeNull();
  });
});
