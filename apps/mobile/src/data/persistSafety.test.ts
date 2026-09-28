// La carga nunca se queda colgada: datos ilegibles o fallos al escribir se convierten en avisos.
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
let failWrites = false;
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => {
      if (failWrites) throw new Error("SQLITE_FULL");
      storage.set(k, v);
    },
    removeItem: async (k: string) => void storage.delete(k),
  },
}));

const { create } = await import("zustand");
const { persist } = await import("zustand/middleware");
const { guardedJSONStorage, guardRehydrate, guardedStateStorage, hydrationFailed, onStorageProblem } = await import("./persistSafety");

beforeEach(() => {
  storage.clear();
  failWrites = false;
});

function makeStore(name: string, migrate?: () => unknown) {
  return create<{ n: number }>()(
    persist(() => ({ n: 0 }), { name, version: 2, storage: guardedJSONStorage(), onRehydrateStorage: guardRehydrate(name), migrate: migrate as never }),
  );
}

describe("persistSafety", () => {
  it("un JSON corrupto no deja la tienda colgada: arranca, queda marcada y guarda una copia", async () => {
    storage.set("cf_running_v1", "{esto no es json");
    const messages: string[] = [];
    const off = onStorageProblem((m) => messages.push(m));
    const store = makeStore("cf_running_v1");
    await store.persist.rehydrate();
    expect(store.persist.hasHydrated()).toBe(true);
    expect(hydrationFailed("cf_running_v1")).toBe(true);
    expect([...storage.keys()].some((k) => k.startsWith("cf_running_v1__ilegible_"))).toBe(true);
    expect(messages[0]).toMatch(/running/);
    off();
  });

  it("un migrate que lanza marca la tienda como fallida en vez de colgarla", async () => {
    storage.set("cf_strength_v1", JSON.stringify({ state: { n: 1 }, version: 1 }));
    const store = makeStore("cf_strength_v1", () => {
      throw new Error("migración rota");
    });
    await store.persist.rehydrate();
    expect(hydrationFailed("cf_strength_v1")).toBe(true);
  });

  it("un fallo al escribir avisa en vez de perderse en silencio", async () => {
    const messages: string[] = [];
    const off = onStorageProblem((m) => messages.push(m));
    failWrites = true;
    await guardedStateStorage().setItem("cf_nutrition_v1", "{}");
    expect(messages[0]).toMatch(/No se pudieron guardar/);
    off();
  });

  it("no copia la sesión ilegible (lleva el token) fuera de SecureStore", async () => {
    storage.set("cf_auth_v1", "{roto");
    await guardedStateStorage().getItem("cf_auth_v1");
    expect([...storage.keys()].some((k) => k.startsWith("cf_auth_v1__"))).toBe(false);
  });
});
