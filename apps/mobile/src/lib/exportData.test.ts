import { describe, expect, it } from "vitest";
import { parseExportJson } from "./exportParse";

const valid = JSON.stringify({
  exportedAt: "2026-01-01T12:00:00.000Z",
  app: "CheluisFIT",
  blobs: {
    cf_nutrition_v1: { state: { entries: [] }, version: 7 },
    cf_running_v1: { state: { activities: [] }, version: 7 },
  },
});

describe("parseExportJson", () => {
  it("acepta un export válido", () => {
    const r = parseExportJson(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.data.blobs)).toEqual(["cf_nutrition_v1", "cf_running_v1"]);
    }
  });

  it("rechaza JSON roto", () => {
    expect(parseExportJson("{no")).toEqual({ ok: false, message: "El archivo no es un JSON válido." });
  });

  it("rechaza otra app", () => {
    const r = parseExportJson(JSON.stringify({ app: "Otra", blobs: {} }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/CheluisFIT/);
  });

  it("rechaza clave desconocida", () => {
    const r = parseExportJson(
      JSON.stringify({
        app: "CheluisFIT",
        blobs: { cf_desconocida_v1: { state: {}, version: 1 } },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/desconocida/);
  });

  it("rechaza blob sin envoltorio persist", () => {
    const r = parseExportJson(
      JSON.stringify({
        app: "CheluisFIT",
        blobs: { cf_strength_v1: { foo: 1 } },
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/formato esperado/);
  });

  it("rechaza blobs vacíos", () => {
    const r = parseExportJson(JSON.stringify({ app: "CheluisFIT", blobs: {} }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/ningún dato/);
  });
});
