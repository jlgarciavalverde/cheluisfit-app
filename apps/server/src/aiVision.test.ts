import { describe, expect, it } from "vitest";
import { coerceFridge, parseIngredientLines, FRIDGE_CATEGORIES, FRIDGE_ZONES } from "./routes/aiVision";

describe("coerceFridge", () => {
  it("deja pasar un resultado bien formado", () => {
    const raw = {
      items: [{ name: "Leche", category: "lacteo", zone: "door", level: 0, x: 0.3, depth: "front", confidence: 0.9 }],
      shelvesSeen: 3,
      doorVisible: true,
    };
    const out = coerceFridge(raw) as any;
    expect(out.items).toHaveLength(1);
    expect(out.items[0].name).toBe("Leche");
    expect(out.items[0].category).toBe("lacteo");
    expect(out.shelvesSeen).toBe(3);
    expect(out.doorVisible).toBe(true);
  });

  it("corrige categorías y zonas desconocidas", () => {
    const raw = {
      items: [{ name: "Algo", category: "inventado", zone: "main", level: 1.5, x: 2, depth: "middle", confidence: 1.5 }],
      shelvesSeen: -1,
      doorVisible: "yes",
    };
    const out = coerceFridge(raw) as any;
    const item = out.items[0];
    expect(item.category).toBe("otros");
    expect(item.zone).toBe("shelf");
    expect(item.level).toBe(2);
    expect(item.x).toBe(1);
    expect(item.depth).toBe("front");
    expect(item.confidence).toBe(1);
    expect(out.shelvesSeen).toBe(0);
    expect(out.doorVisible).toBe(false);
  });

  it("descarta items sin nombre y limita a 60", () => {
    const items = Array.from({ length: 65 }, (_, i) => ({ name: `item${i}`, category: "otros", zone: "shelf", level: 0, x: 0.5, depth: "front", confidence: 0.5 }));
    items.push({ name: "", category: "otros", zone: "shelf", level: 0, x: 0.5, depth: "front", confidence: 0.5 });
    const out = coerceFridge({ items, shelvesSeen: 0, doorVisible: false }) as any;
    expect(out.items.length).toBe(60);
  });

  it("maneja null/undefined sin error", () => {
    expect((coerceFridge(null) as any).items).toEqual([]);
    expect((coerceFridge(undefined) as any).items).toEqual([]);
    expect((coerceFridge({}) as any).items).toEqual([]);
  });
});

describe("parseIngredientLines", () => {
  it("extrae líneas limpias de una respuesta de texto", () => {
    const text = "- Leche\n- Huevos\n* Tomate\n1. Lechuga";
    expect(parseIngredientLines(text)).toEqual(["Leche", "Huevos", "Tomate", "Lechuga"]);
  });

  it("descarta preámbulos y líneas largas", () => {
    const text = "Aquí tienes los ingredientes que veo:\nLeche\nEsta es una frase muy larga que supera los sesenta caracteres y no debería ser un ingrediente";
    const lines = parseIngredientLines(text);
    expect(lines).toContain("Leche");
    expect(lines).not.toContain("Aquí tienes los ingredientes que veo:");
    expect(lines).toHaveLength(1);
  });

  it("devuelve vacío si no hay nada", () => {
    expect(parseIngredientLines("")).toEqual([]);
    expect(parseIngredientLines("\n\n")).toEqual([]);
  });
});
