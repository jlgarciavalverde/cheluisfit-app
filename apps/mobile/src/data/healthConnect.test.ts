import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `healthConnect.ts` importa `Platform`/`Linking` de "react-native" (necesario para el código
// real) — en vitest (entorno Node, sin el transform de Metro) cargar el paquete real revienta
// por su sintaxis Flow, igual que pasó con `expo-constants` en `offClient.ts`. Se sustituye
// entero por un mock antes de que nada lo importe.
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  Linking: { openURL: vi.fn(), openSettings: vi.fn() },
}));

const nativeMock = {
  getSdkStatus: vi.fn(),
  initialize: vi.fn(),
  getGrantedPermissions: vi.fn(),
  requestPermission: vi.fn(),
  readRecords: vi.fn(),
  aggregateRecord: vi.fn(),
  requestExerciseRoute: vi.fn(),
  openHealthConnectSettings: vi.fn(),
  SdkAvailabilityStatus: { SDK_UNAVAILABLE: 1, SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED: 2, SDK_AVAILABLE: 3 },
  ExerciseType: { RUNNING: 56, RUNNING_TREADMILL: 57, WALKING: 79, HIKING: 37, SOCCER: 64 },
};
vi.mock("react-native-health-connect", () => nativeMock);

// `ensureInitialized()` guarda `initialized` en una variable de módulo — se reimporta el módulo
// entero en cada test (`vi.resetModules` + `import()` dinámico) para que un test no arrastre
// el "ya inicializado" de otro.
async function freshModule() {
  vi.resetModules();
  return import("./healthConnect");
}

beforeEach(() => {
  for (const fn of Object.values(nativeMock)) if (typeof fn === "function" && "mockReset" in fn) (fn as ReturnType<typeof vi.fn>).mockReset();
  nativeMock.initialize.mockResolvedValue(true);
});
afterEach(() => vi.unstubAllGlobals());

describe("checkHealthConnectStatus", () => {
  it("distingue disponible / no instalado / necesita actualizarse (no solo dos casos)", async () => {
    const { checkHealthConnectStatus } = await freshModule();
    nativeMock.getSdkStatus.mockResolvedValueOnce(nativeMock.SdkAvailabilityStatus.SDK_AVAILABLE);
    expect(await checkHealthConnectStatus()).toBe("available");

    const { checkHealthConnectStatus: check2 } = await freshModule();
    nativeMock.getSdkStatus.mockResolvedValueOnce(nativeMock.SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED);
    expect(await check2()).toBe("update_required");

    const { checkHealthConnectStatus: check3 } = await freshModule();
    nativeMock.getSdkStatus.mockResolvedValueOnce(nativeMock.SdkAvailabilityStatus.SDK_UNAVAILABLE);
    expect(await check3()).toBe("not_installed");
  });
});

describe("requestHealthConnectPermissions", () => {
  it("si el permiso esencial ya estaba concedido, no vuelve a pedirlo", async () => {
    const { requestHealthConnectPermissions } = await freshModule();
    nativeMock.getGrantedPermissions.mockResolvedValueOnce([{ accessType: "read", recordType: "ExerciseSession" }]);
    expect(await requestHealthConnectPermissions()).toBe(true);
    expect(nativeMock.requestPermission).not.toHaveBeenCalled();
  });

  it("pide permiso si no estaba concedido, y basta con que se conceda el esencial (no los 5)", async () => {
    const { requestHealthConnectPermissions } = await freshModule();
    nativeMock.getGrantedPermissions.mockResolvedValueOnce([]);
    nativeMock.requestPermission.mockResolvedValueOnce([{ accessType: "read", recordType: "ExerciseSession" }]);
    expect(await requestHealthConnectPermissions()).toBe(true);
    expect(nativeMock.requestPermission).toHaveBeenCalledTimes(1);
  });

  it("si ni siquiera el esencial se concede, devuelve false", async () => {
    const { requestHealthConnectPermissions } = await freshModule();
    nativeMock.getGrantedPermissions.mockResolvedValueOnce([]);
    nativeMock.requestPermission.mockResolvedValueOnce([{ accessType: "read", recordType: "Distance" }]);
    expect(await requestHealthConnectPermissions()).toBe(false);
  });
});

describe("importNewActivities", () => {
  const baseSession = (overrides: Partial<{ exerciseType: number; startTime: string; endTime: string; title?: string; metadata: { id: string } }> = {}) => ({
    exerciseType: nativeMock.ExerciseType.RUNNING,
    startTime: "2026-09-22T10:00:00.000Z",
    endTime: "2026-09-22T10:30:00.000Z",
    metadata: { id: "hc-1" },
    ...overrides,
  });

  function mockEmptyAggregates() {
    nativeMock.aggregateRecord.mockRejectedValue(new Error("sin datos"));
  }

  it("ignora tipos de ejercicio no soportados (fútbol y otros) sin romper la importación", async () => {
    const { importNewActivities } = await freshModule();
    mockEmptyAggregates();
    nativeMock.readRecords.mockResolvedValueOnce({
      records: [baseSession({ exerciseType: nativeMock.ExerciseType.SOCCER }), baseSession({ exerciseType: nativeMock.ExerciseType.RUNNING, metadata: { id: "hc-2" } })],
    });
    const out = await importNewActivities(null);
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe("run");
  });

  it("descarta sesiones con duración cero o negativa", async () => {
    const { importNewActivities } = await freshModule();
    mockEmptyAggregates();
    nativeMock.readRecords.mockResolvedValueOnce({
      records: [baseSession({ startTime: "2026-09-22T10:00:00.000Z", endTime: "2026-09-22T10:00:00.000Z" })],
    });
    expect(await importNewActivities(null)).toHaveLength(0);
  });

  it("mapea caminatas y senderismo a \"walk\", carreras a \"run\"", async () => {
    const { importNewActivities } = await freshModule();
    mockEmptyAggregates();
    nativeMock.readRecords.mockResolvedValueOnce({
      records: [baseSession({ exerciseType: nativeMock.ExerciseType.WALKING, metadata: { id: "hc-3" } })],
    });
    const out = await importNewActivities(null);
    expect(out[0].type).toBe("walk");
  });

  it("lanza HealthConnectError (no un Error genérico) si Health Connect no está disponible", async () => {
    const { importNewActivities, HealthConnectError } = await freshModule();
    nativeMock.initialize.mockResolvedValueOnce(false);
    await expect(importNewActivities(null)).rejects.toBeInstanceOf(HealthConnectError);
  });
});

describe("fetchExerciseRoute", () => {
  it("devuelve null (no lanza) si no hay puntos de ruta", async () => {
    const { fetchExerciseRoute } = await freshModule();
    nativeMock.requestExerciseRoute.mockResolvedValueOnce([]);
    expect(await fetchExerciseRoute("hc-1")).toBeNull();
  });

  it("devuelve null (no lanza) si la librería nativa rechaza (sin consentimiento, por ejemplo)", async () => {
    const { fetchExerciseRoute } = await freshModule();
    nativeMock.requestExerciseRoute.mockRejectedValueOnce(new Error("denegado"));
    expect(await fetchExerciseRoute("hc-1")).toBeNull();
  });

  it("mapea latitude/longitude a lat/lon", async () => {
    const { fetchExerciseRoute } = await freshModule();
    nativeMock.requestExerciseRoute.mockResolvedValueOnce([{ latitude: 37.98, longitude: -1.13, time: "2026-09-22T10:00:00.000Z" }]);
    expect(await fetchExerciseRoute("hc-1")).toEqual([{ lat: 37.98, lon: -1.13 }]);
  });
});
