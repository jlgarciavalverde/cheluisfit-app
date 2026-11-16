import { describe, expect, it } from "vitest";
import { normalizeText } from "./text";

describe("normalizeText", () => {
  it("pasa a minúsculas y quita acentos", () => {
    expect(normalizeText("Pollo a la Plancha")).toBe("pollo a la plancha");
    expect(normalizeText("Jamón Ibérico")).toBe("jamon iberico");
    expect(normalizeText("Piña")).toBe("pina");
  });

  it("elimina signos de puntuación y colapsa espacios", () => {
    expect(normalizeText("press (barra)")).toBe("press barra");
    expect(normalizeText("  hola   mundo  ")).toBe("hola mundo");
    expect(normalizeText("café, leche & azúcar")).toBe("cafe leche azucar");
  });

  it("conserva dígitos", () => {
    expect(normalizeText("Pan 100% integral")).toBe("pan 100 integral");
  });

  it("devuelve vacío para una cadena solo de signos", () => {
    expect(normalizeText("---")).toBe("");
    expect(normalizeText("")).toBe("");
  });
});
