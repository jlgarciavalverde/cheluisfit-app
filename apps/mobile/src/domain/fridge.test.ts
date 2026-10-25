import { describe, expect, it } from "vitest";
import {
  autoPlace,
  DEFAULT_LAYOUT,
  EMPTY_FRIDGE,
  FRIDGE_DIMS,
  fridgeContext,
  groupByPlace,
  itemKey,
  itemPosition,
  mergeScan,
  migrateFridge,
  shelfHeights,
  type FridgeScan,
} from "./fridge";

const scanItem = (name: string, extra: Partial<FridgeScan["items"][number]> = {}): FridgeScan["items"][number] => ({
  name,
  category: "otros",
  zone: "shelf",
  level: 0,
  x: 0.5,
  depth: "front",
  confidence: 0.9,
  ...extra,
});
const scan = (items: FridgeScan["items"], extra: Partial<FridgeScan> = {}): FridgeScan => ({ items, shelvesSeen: 3, doorVisible: true, positioned: true, ...extra });
const NOW = "2026-10-25T10:00:00.000Z";

describe("itemKey", () => {
  it("trata igual singular y plural, mayúsculas y acentos", () => {
    expect(itemKey("Tomates")).toBe(itemKey("tomate"));
    expect(itemKey("Plátanos")).toBe(itemKey("platano"));
    expect(itemKey("Leche")).toBe(itemKey("leche"));
  });
});

describe("migrateFridge", () => {
  it("convierte la lista antigua de nombres en alimentos sin sitio, colocados y sin duplicados", () => {
    const f = migrateFridge({ items: ["Leche", "Tomates", "tomate"], lastScannedAt: "2026-10-20" });
    expect(f.items).toHaveLength(2);
    expect(f.items.every((i) => !i.positioned)).toBe(true);
    expect(f.layout).toEqual(DEFAULT_LAYOUT);
    expect(f.lastScannedAt).toBe("2026-10-20");
  });

  it("es idempotente con el formato nuevo y tolera basura", () => {
    const once = migrateFridge({ items: ["Leche"], lastScannedAt: null });
    expect(migrateFridge(once).items.map((i) => i.id)).toEqual(once.items.map((i) => i.id));
    expect(migrateFridge(undefined)).toEqual(EMPTY_FRIDGE);
    expect(migrateFridge("x")).toEqual(EMPTY_FRIDGE);
  });
});

describe("mergeScan", () => {
  it("replace deja solo lo de la foto con su sitio", () => {
    const before = mergeScan(EMPTY_FRIDGE, scan([scanItem("Queso")]), "replace", NOW);
    const after = mergeScan(before, scan([scanItem("Leche", { zone: "door", level: 1, x: 0.3 })]), "replace", NOW);
    expect(after.items.map((i) => i.name)).toEqual(["Leche"]);
    expect(after.items[0]).toMatchObject({ zone: "door", level: 1, x: 0.3, positioned: true, seenAt: NOW });
    expect(after.lastScannedAt).toBe(NOW);
  });

  it("add conserva lo demás y actualiza lo repetido sin cambiarle el id ni el nombre editado", () => {
    const before = mergeScan(EMPTY_FRIDGE, scan([scanItem("Queso fresco"), scanItem("Tomates", { category: "verdura" })]), "replace", NOW);
    const tomateId = before.items.find((i) => i.name === "Tomates")!.id;
    const after = mergeScan(before, scan([scanItem("tomate", { zone: "drawer", level: 0, quantity: 4, unit: "ud" })]), "add", NOW);
    expect(after.items).toHaveLength(2);
    const tomate = after.items.find((i) => i.id === tomateId)!;
    expect(tomate).toMatchObject({ name: "Tomates", zone: "drawer", quantity: 4, unit: "ud", category: "verdura" });
  });

  it("acota la balda a las que hay y nunca baja de 2 baldas", () => {
    const f = mergeScan(EMPTY_FRIDGE, scan([scanItem("Yogur", { level: 3 })], { shelvesSeen: 0 }), "replace", NOW);
    expect(f.layout.shelves).toBe(4); // la balda 3 (cuarta) existe
    const g = mergeScan(EMPTY_FRIDGE, scan([scanItem("Yogur", { level: 0 })], { shelvesSeen: 0 }), "replace", NOW);
    expect(g.layout.shelves).toBe(2);
  });

  it("sin posiciones (plan B en texto) coloca por categoría y conserva el sitio que ya tenía", () => {
    const first = mergeScan(EMPTY_FRIDGE, scan([scanItem("Leche", { zone: "door", level: 2 })]), "replace", NOW);
    const after = mergeScan(first, scan([scanItem("leche"), scanItem("Pan")], { positioned: false }), "replace", NOW);
    expect(after.items.find((i) => i.name === "Leche")).toMatchObject({ zone: "door", level: 2, positioned: true });
    expect(after.items.find((i) => i.name === "Pan")?.positioned).toBe(false);
  });
});

describe("autoPlace", () => {
  it("manda bebidas a la puerta y fruta a los cajones, repartiendo por huecos", () => {
    const f = autoPlace({
      ...EMPTY_FRIDGE,
      items: [
        { id: "1", name: "Agua", category: "bebida", zone: "shelf", level: 0, x: 0.5, depth: "front", positioned: false, seenAt: NOW },
        { id: "2", name: "Manzana", category: "fruta", zone: "shelf", level: 0, x: 0.5, depth: "front", positioned: false, seenAt: NOW },
        { id: "3", name: "Pera", category: "fruta", zone: "shelf", level: 0, x: 0.5, depth: "front", positioned: false, seenAt: NOW },
      ],
    });
    expect(f.items[0].zone).toBe("door");
    expect(f.items[1].zone).toBe("drawer");
    expect(f.items[1].level).not.toBe(f.items[2].level); // dos cajones: uno en cada uno
    expect(f.items.every((i) => i.x >= 0 && i.x <= 1)).toBe(true);
  });
});

describe("groupByPlace y fridgeContext", () => {
  const f = mergeScan(
    EMPTY_FRIDGE,
    scan([scanItem("Leche", { zone: "door", level: 0, quantity: 1, unit: "l" }), scanItem("Queso", { level: 1, x: 0.8 }), scanItem("Jamón", { level: 1, x: 0.1 }), scanItem("Helado", { zone: "freezer" })]),
    "replace",
    NOW,
  );

  it("agrupa de arriba abajo y de izquierda a derecha", () => {
    const g = groupByPlace(f.items);
    expect(g.map((x) => x.label)).toEqual(["Congelador", "Balda 2", "Puerta 1"]);
    expect(g[1].items.map((i) => i.name)).toEqual(["Jamón", "Queso"]);
  });

  it("resume por sitios con cantidades y respeta el tope de caracteres", () => {
    const text = fridgeContext(f, new Date("2026-10-26T12:00:00.000Z"))!;
    expect(text).toContain("vista hace 1 día");
    expect(text).toContain("Puerta 1: Leche 1 l");
    expect(fridgeContext(f, new Date(NOW), 40)!.length).toBeLessThanOrEqual(40);
    expect(fridgeContext(EMPTY_FRIDGE)).toBeNull();
  });
});

describe("geometría", () => {
  it("las baldas quedan entre los cajones y el congelador, de arriba abajo", () => {
    const h = shelfHeights(DEFAULT_LAYOUT);
    expect(h).toHaveLength(4);
    expect(h[0]).toBeLessThan(FRIDGE_DIMS.height - FRIDGE_DIMS.freezerH);
    expect([...h].sort((a, b) => b - a)).toEqual(h);
  });

  it("cada alimento cae dentro de la nevera y más arriba cuanto menor es la balda", () => {
    const top = itemPosition({ zone: "shelf", level: 0, x: 0, depth: "front" }, DEFAULT_LAYOUT);
    const low = itemPosition({ zone: "shelf", level: 3, x: 1, depth: "back" }, DEFAULT_LAYOUT);
    expect(top[1]).toBeGreaterThan(low[1]);
    for (const p of [top, low]) {
      expect(Math.abs(p[0])).toBeLessThan(FRIDGE_DIMS.width / 2);
      expect(p[1]).toBeGreaterThan(0);
      expect(p[1]).toBeLessThan(FRIDGE_DIMS.height);
    }
    // Una balda que no existe se acota a la última, no se sale por abajo.
    expect(itemPosition({ zone: "shelf", level: 9, x: 0.5, depth: "front" }, DEFAULT_LAYOUT)[1]).toBe(itemPosition({ zone: "shelf", level: 3, x: 0.5, depth: "front" }, DEFAULT_LAYOUT)[1]);
  });
});
