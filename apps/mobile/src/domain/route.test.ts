import { describe, expect, it } from "vitest";
import { compactRoute, downsample, STORED_ROUTE_POINTS } from "./route";
import { mergeImportedActivities, type Activity } from "./running";
import { runSnapshot } from "./socialSnapshot";

/** Recorrido en línea recta hacia el norte: ~1,1 m entre puntos, `n` puntos. */
const line = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: 40 + i * 0.00001, lon: -3.123456789 }));

describe("recorridos GPS", () => {
  it("downsample conserva primero y último y no pasa del máximo", () => {
    const pts = line(1000);
    const out = downsample(pts, 50);
    expect(out).toHaveLength(50);
    expect(out[0]).toEqual(pts[0]);
    expect(out[49]).toEqual(pts[999]);
    expect(downsample(pts.slice(0, 10), 50)).toHaveLength(10);
  });

  it("compactRoute redondea a 5 decimales y descarta recorridos de un punto", () => {
    const r = compactRoute(line(5000))!;
    expect(r).toHaveLength(STORED_ROUTE_POINTS);
    expect(r[0]!.lon).toBe(-3.12346);
    expect(compactRoute([{ lat: 1, lon: 1 }])).toBeUndefined();
    expect(compactRoute(undefined)).toBeUndefined();
  });

  it("una carrera larga con recorrido cabe en el tope de 8 KB del snapshot", () => {
    // ~11 km en línea recta, con 10.000 puntos como una sesión real de Strava sin reducir.
    const activity: Activity = { id: "a", date: "2026-09-20", type: "run", source: "strava", title: "Tirada larga", distanceM: 11000, durationS: 3600, route: line(10000) };
    const snap = runSnapshot(activity, true);
    expect(snap.route!.length).toBeGreaterThan(10);
    expect(JSON.stringify(snap).length).toBeLessThan(8192);
  });

  it("al importar se compacta el recorrido y no vuelven las actividades borradas", () => {
    const imported = [
      { date: "2026-09-20", type: "run" as const, source: "strava" as const, title: "A", distanceM: 5000, durationS: 1500, externalId: "s-1", route: line(4000) },
      { date: "2026-09-21", type: "run" as const, source: "strava" as const, title: "B", distanceM: 5000, durationS: 1500, externalId: "s-2" },
    ];
    let n = 0;
    const r = mergeImportedActivities([], imported, () => `id-${++n}`, ["s-2"]);
    expect(r.addedCount).toBe(1);
    expect(r.activities[0]!.externalId).toBe("s-1");
    expect(r.activities[0]!.route).toHaveLength(STORED_ROUTE_POINTS);
  });
});
