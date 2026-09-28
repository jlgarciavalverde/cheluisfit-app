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
  ExerciseSegmentType: { PAUSE: 67, REST: 64 },
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

describe("importNewActivities — correcciones de la 0.13", () => {
  const agg = (recordType: string) => {
    if (recordType === "Distance") return { DISTANCE: { inMeters: 10000 } };
    if (recordType === "TotalCaloriesBurned") return { ENERGY_TOTAL: { inKilocalories: 800 } };
    if (recordType === "ActiveCaloriesBurned") return { ACTIVE_CALORIES_TOTAL: { inKilocalories: 650 } };
    if (recordType === "HeartRate") return { MEASUREMENTS_COUNT: 0 };
    return { ELEVATION_GAINED_TOTAL: { inMeters: 0 } };
  };
  const session = (id: string, extra: object = {}) => ({
    exerciseType: 56,
    startTime: "2026-09-20T08:00:00Z",
    endTime: "2026-09-20T09:00:00Z",
    metadata: { id, dataOrigin: "com.garmin.android.apps.connectmobile" },
    ...extra,
  });

  it("descuenta las pausas, usa kcal activas, pagina, filtra por origen e importa vueltas", async () => {
    const { importNewActivities } = await freshModule();
    nativeMock.readRecords
      .mockResolvedValueOnce({
        records: [
          session("a", {
            segments: [{ startTime: "2026-09-20T08:30:00Z", endTime: "2026-09-20T08:40:00Z", segmentType: 67, repetitions: 0 }],
            laps: [
              { startTime: "2026-09-20T08:00:00Z", endTime: "2026-09-20T08:25:00Z", length: { inMeters: 5000 } },
              { startTime: "2026-09-20T08:40:00Z", endTime: "2026-09-20T09:00:00Z", length: { value: 5, unit: "kilometers" } },
            ],
          }),
        ],
        pageToken: "p2",
      })
      .mockResolvedValueOnce({ records: [session("b")] });
    nativeMock.aggregateRecord.mockImplementation(async (req: { recordType: string }) => agg(req.recordType));
    const out = await importNewActivities(null);
    expect(nativeMock.readRecords).toHaveBeenCalledTimes(2);
    expect(out.map((a) => a.externalId)).toEqual(["a", "b"]);
    expect(out[0]!.durationS).toBe(3000); // 60 min − 10 min de pausa
    expect(out[0]!.kcal).toBe(650); // activas, no totales
    expect(out[0]!.laps).toEqual([
      { index: 1, distanceM: 5000, durationS: 1500 },
      { index: 2, distanceM: 5000, durationS: 1200 },
    ]);
    expect(nativeMock.aggregateRecord.mock.calls[0]![0].dataOriginFilter).toEqual(["com.garmin.android.apps.connectmobile"]);
  });

  it("no vuelve a agregar las sesiones ya importadas, y sin kcal activas resta el basal", async () => {
    const { importNewActivities } = await freshModule();
    nativeMock.readRecords.mockResolvedValueOnce({ records: [session("ya"), session("nueva")] });
    nativeMock.aggregateRecord.mockImplementation(async (req: { recordType: string }) =>
      req.recordType === "ActiveCaloriesBurned" ? Promise.reject(new Error("sin permiso")) : agg(req.recordType),
    );
    const out = await importNewActivities(null, { knownIds: new Set(["ya"]), bmrKcalPerDay: 1440 });
    expect(out.map((a) => a.externalId)).toEqual(["nueva"]);
    expect(out[0]!.kcal).toBe(800 - 60); // 1 kcal/min de basal durante 60 min
  });
});
