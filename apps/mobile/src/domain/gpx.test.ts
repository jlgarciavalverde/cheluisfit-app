import { describe, expect, it } from "vitest";
import { parseGpx } from "./gpx";
import { STORED_ROUTE_POINTS } from "./route";

const MINI_GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1">
  <trk>
    <trkseg>
      <trkpt lat="40.416800" lon="-3.703800"><time>2026-09-22T10:00:00Z</time></trkpt>
      <trkpt lat="40.426800" lon="-3.703800"><time>2026-09-22T10:05:00Z</time></trkpt>
      <trkpt lat="40.436800" lon="-3.703800"><time>2026-09-22T10:10:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;

describe("parseGpx", () => {
  it("calcula distancia, duración, fecha y compacta la ruta", () => {
    const r = parseGpx(MINI_GPX, "Tirada GPX");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.activity).toMatchObject({
      title: "Tirada GPX",
      date: "2026-09-22",
      type: "run",
      source: "manual",
      durationS: 600,
      startedAt: "2026-09-22T10:00:00.000Z",
    });
    expect(r.activity.distanceM).toBeGreaterThan(2000);
    expect(r.activity.route!.length).toBeLessThanOrEqual(STORED_ROUTE_POINTS);
  });

  it("rechaza un XML vacío o sin puntos", () => {
    expect(parseGpx("").ok).toBe(false);
    expect(parseGpx("<gpx></gpx>").ok).toBe(false);
  });
});
