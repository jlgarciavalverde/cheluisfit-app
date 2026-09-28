import { describe, expect, it } from "vitest";
import { countLabel, effectiveQuery, searchStatusText } from "./search";

describe("reglas comunes de los buscadores", () => {
  const noun = ["resultado", "resultados"] as const;
  it("misma línea de estado en todos", () => {
    expect(searchStatusText("", false, null, noun)).toBeNull();
    expect(searchStatusText("  ", false, 3, noun)).toBeNull();
    expect(searchStatusText("a", false, 3, noun)).toBe("Escribe al menos 2 letras");
    expect(searchStatusText("ar", true, null, noun)).toBe("Buscando…");
    expect(searchStatusText("arroz", false, 1, noun)).toBe("1 resultado");
    expect(searchStatusText("arroz", false, 0, noun)).toBe("0 resultados");
  });
  it("con una letra no se filtra", () => {
    expect(effectiveQuery("p")).toBe("");
    expect(effectiveQuery(" press ")).toBe("press");
    expect(countLabel(1, ["ejercicio", "ejercicios"])).toBe("1 ejercicio");
  });
});
