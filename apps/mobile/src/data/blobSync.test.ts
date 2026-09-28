// Sincronización con control de versión (`syncBlobs`, `pullAllBlobs`, `adoptNewAccount`). Las
// tiendas reales usan `persist` + AsyncStorage y React Native, que no cargan en vitest (Node):
// aquí se sustituyen por dobles mínimos y AsyncStorage por un `Map` en memoria.
import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (k: string) => storage.get(k) ?? null,
    setItem: async (k: string, v: string) => void storage.set(k, v),
    removeItem: async (k: string) => void storage.delete(k),
  },
}));

const calls = { startFresh: [] as string[], rehydrate: [] as string[], clearActive: 0 };
let activeWorkout: unknown = null;
const fakeStore = (name: string) => ({
  getState: () => ({ startFresh: () => calls.startFresh.push(name), clearActive: () => calls.clearActive++, workout: activeWorkout }),
  persist: { rehydrate: async () => void calls.rehydrate.push(name) },
});
vi.mock("./store", () => ({ useNutrition: fakeStore("nutrition") }));
vi.mock("./runningStore", () => ({ useRunning: fakeStore("running") }));
vi.mock("./strengthStore", () => ({ useStrength: fakeStore("strength") }));
vi.mock("./activeWorkoutStore", () => ({
  useActiveWorkout: {
    getState: () => ({ clearActive: () => calls.clearActive++, workout: activeWorkout }),
    persist: { rehydrate: async () => void calls.rehydrate.push("active") },
  },
}));

// Servidor falso con la misma semántica que `routes/data.ts` (409 si `base` no coincide).
const server = new Map<string, { data: unknown; updatedAt: number }>();
let clock = 1000;
let failGetBlobs = false;
vi.mock("./api", () => {
  class ApiError extends Error {
    constructor(
      public status: number,
      message: string,
      public body?: unknown,
    ) {
      super(message);
    }
  }
  return {
    ApiError,
    api: {
      getBlobs: async () => {
        if (failGetBlobs) throw new ApiError(0, "sin red");
        return { blobs: [...server.entries()].map(([key, v]) => ({ key, ...v })) };
      },
      getBlob: async (_t: string, key: string) => {
        const b = server.get(key);
        if (!b) throw new ApiError(404, "Sin datos");
        return { key, ...b };
      },
      getBlobVersions: async () => ({ blobs: [...server.entries()].map(([key, v]) => ({ key, updatedAt: v.updatedAt })) }),
      putBlob: async (_t: string, key: string, data: unknown, base: number | null) => {
        const cur = server.get(key);
        if (base !== null && (cur?.updatedAt ?? 0) !== base) throw new ApiError(409, "conflicto", { data: cur?.data ?? null, updatedAt: cur?.updatedAt ?? 0 });
        const updatedAt = ++clock;
        server.set(key, { data, updatedAt });
        return { updatedAt };
      },
    },
  };
});

const { adoptNewAccount, listConflictBackups, loadMeta, pullAllBlobs, restoreConflictBackup, saveMeta, syncBlobs } = await import("./blobSync");

const blob = (n: number) => ({ state: { n }, version: 1 });
const local = (key: string) => JSON.parse(storage.get(key) ?? "null");
/** Lo que haría otro dispositivo: subir sin pasar por este móvil. */
const remoteEdit = (key: string, data: unknown) => server.set(key, { data, updatedAt: ++clock });

beforeEach(() => {
  storage.clear();
  server.clear();
  calls.startFresh = [];
  calls.rehydrate = [];
  calls.clearActive = 0;
  activeWorkout = null;
  failGetBlobs = false;
});

describe("pullAllBlobs (entrar)", () => {
  it("baja lo del servidor y vacía de verdad lo que la cuenta no tiene", async () => {
    remoteEdit("cf_nutrition_v1", blob(1));
    storage.set("cf_running_v1", JSON.stringify(blob(99))); // datos de otra sesión en este móvil
    await pullAllBlobs("t", "u1");
    expect(local("cf_nutrition_v1")).toEqual(blob(1));
    expect(calls.startFresh).toEqual(["running", "strength"]);
    const meta = await loadMeta();
    expect(meta.ownerId).toBe("u1");
    expect(meta.needsPull).toBeUndefined();
    expect(meta.keys.cf_nutrition_v1?.base).toBe(server.get("cf_nutrition_v1")!.updatedAt);
  });

  it("no pisa un entreno en curso de la misma cuenta, pero sí el de otra", async () => {
    remoteEdit("cf_active_workout_v1", blob(1));
    activeWorkout = { id: "w" };
    storage.set("cf_active_workout_v1", JSON.stringify(blob(2)));
    await saveMeta({ ownerId: "u1", keys: {} });
    await pullAllBlobs("t", "u1");
    expect(local("cf_active_workout_v1")).toEqual(blob(2));

    await saveMeta({ ownerId: "otra", keys: {} });
    await pullAllBlobs("t", "u1");
    expect(local("cf_active_workout_v1")).toEqual(blob(1));
  });
});

describe("syncBlobs (uso normal)", () => {
  it("sube solo lo que cambió aquí y no toca lo que no cambió", async () => {
    await pullAllBlobs("t", "u1");
    storage.set("cf_strength_v1", JSON.stringify(blob(5)));
    const r = await syncBlobs("t");
    expect(r.conflicts).toEqual([]);
    expect(server.get("cf_strength_v1")!.data).toEqual(blob(5));
    const before = server.get("cf_strength_v1")!.updatedAt;
    await syncBlobs("t");
    expect(server.get("cf_strength_v1")!.updatedAt).toBe(before); // sin cambios: no vuelve a subir
  });

  it("baja lo que cambió en otro dispositivo si aquí no hubo cambios", async () => {
    remoteEdit("cf_nutrition_v1", blob(1));
    await pullAllBlobs("t", "u1");
    remoteEdit("cf_nutrition_v1", blob(2)); // la web edita
    calls.rehydrate = [];
    await syncBlobs("t");
    expect(local("cf_nutrition_v1")).toEqual(blob(2));
    expect(calls.rehydrate).toContain("nutrition");
  });

  it("si cambiaron los dos lados gana el servidor y lo local queda como copia recuperable", async () => {
    remoteEdit("cf_nutrition_v1", blob(1));
    await pullAllBlobs("t", "u1");
    remoteEdit("cf_nutrition_v1", blob(2));
    storage.set("cf_nutrition_v1", JSON.stringify(blob(3)));
    const r = await syncBlobs("t");
    expect(r.conflicts).toEqual(["cf_nutrition_v1"]);
    expect(local("cf_nutrition_v1")).toEqual(blob(2));
    expect(server.get("cf_nutrition_v1")!.data).toEqual(blob(2));
    const backups = await listConflictBackups();
    expect(backups.map((b) => b.key)).toEqual(["cf_nutrition_v1"]);
    expect(JSON.parse(backups[0]!.raw)).toEqual(blob(3));

    // Recuperar: vuelve a local y la siguiente sincronización lo sube encima.
    await restoreConflictBackup("cf_nutrition_v1");
    expect(local("cf_nutrition_v1")).toEqual(blob(3));
    await syncBlobs("t");
    expect(server.get("cf_nutrition_v1")!.data).toEqual(blob(3));
    expect(await listConflictBackups()).toEqual([]);
  });

  it("un entreno en curso en este móvil nunca pierde el conflicto", async () => {
    remoteEdit("cf_active_workout_v1", blob(1));
    await pullAllBlobs("t", "u1");
    remoteEdit("cf_active_workout_v1", blob(2));
    activeWorkout = { id: "w" };
    storage.set("cf_active_workout_v1", JSON.stringify(blob(3)));
    const r = await syncBlobs("t");
    expect(r.conflicts).toEqual([]);
    expect(server.get("cf_active_workout_v1")!.data).toEqual(blob(3));
  });

  it("con la descarga pendiente (`needsPull`) baja y nunca sube lo local", async () => {
    remoteEdit("cf_strength_v1", blob(1));
    storage.set("cf_strength_v1", JSON.stringify(blob(666))); // p. ej. datos de ejemplo tocados
    await saveMeta({ needsPull: true, ownerId: "u1", keys: {} });
    const r = await syncBlobs("t");
    expect(r.pulled).toBe(true);
    expect(server.get("cf_strength_v1")!.data).toEqual(blob(1));
    expect(local("cf_strength_v1")).toEqual(blob(1));
    expect((await loadMeta()).needsPull).toBeUndefined();
  });

  it("si la descarga pendiente vuelve a fallar, sigue pendiente", async () => {
    await saveMeta({ needsPull: true, ownerId: "u1", keys: {} });
    failGetBlobs = true;
    await expect(syncBlobs("t")).rejects.toThrow();
    expect((await loadMeta()).needsPull).toBe(true);
  });

  it("sin datos de versión (recién actualizada desde una versión anterior) sube sin comprobar", async () => {
    remoteEdit("cf_running_v1", blob(1));
    storage.set("cf_running_v1", JSON.stringify(blob(2)));
    await syncBlobs("t");
    expect(server.get("cf_running_v1")!.data).toEqual(blob(2));
    expect((await loadMeta()).keys.cf_running_v1?.base).toBe(server.get("cf_running_v1")!.updatedAt);
  });
});

describe("adoptNewAccount (registro)", () => {
  it("conserva lo tocado, vacía lo nunca tocado", async () => {
    storage.set("cf_nutrition_v1", JSON.stringify(blob(7)));
    await adoptNewAccount("t", "u1");
    expect(local("cf_nutrition_v1")).toEqual(blob(7));
    expect(calls.startFresh).toEqual(["running", "strength"]);
  });

  it("si lo local es de otra cuenta que cerró sesión aquí, no lo hereda", async () => {
    storage.set("cf_nutrition_v1", JSON.stringify(blob(7)));
    await saveMeta({ ownerId: "otra", keys: {} });
    await adoptNewAccount("t", "u1");
    expect(calls.startFresh).toEqual(["nutrition", "running", "strength"]);
    expect(calls.clearActive).toBe(1);
    expect((await loadMeta()).ownerId).toBe("u1");
  });
});
