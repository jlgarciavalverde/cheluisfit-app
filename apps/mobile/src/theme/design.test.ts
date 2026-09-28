import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardarraíl del sistema de diseño: falla si vuelve a aparecer un color, tamaño de fuente,
 * radio o tamaño de icono sueltos fuera de `tokens.ts`, en vez de usar los tokens/componentes
 * compartidos (`Stat`, `ListRow`, `Callout`, `Section`/`Overline`, `Stepper`…).
 * Ver la Fase 6 del plan de consolidación del sistema de diseño.
 */

const ROOTS = ["app", "components"];
const SRC = path.resolve(__dirname, "..");

// `escaner.tsx` fija el fondo negro del visor de cámara a propósito (AGENTS.md); el resto de
// tokens de tema ya cubren cualquier otro caso legítimo.
const HEX_EXCEPTIONS = new Set(["escaner.tsx"]);

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile() && (entry.name.endsWith(".tsx") || entry.name.endsWith(".ts"))) out.push(full);
  }
  return out;
}

const files = ROOTS.flatMap((r) => listFiles(path.join(SRC, r)));

describe("sistema de diseño: sin desvíos de los tokens", () => {
  it("ningún color hex o rgba() suelto fuera de tokens.ts", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (HEX_EXCEPTIONS.has(path.basename(f))) continue;
      const src = fs.readFileSync(f, "utf8");
      const matches = src.match(/#[0-9A-Fa-f]{3,6}\b|rgba?\(/g);
      if (matches) offenders.push(`${path.relative(SRC, f)}: ${matches.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("ningún fontSize/lineHeight ni borderRadius numérico en línea", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      const matches = src.match(/\b(fontSize|lineHeight|borderRadius):\s*\d/g);
      if (matches) offenders.push(`${path.relative(SRC, f)}: ${matches.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("ningún tamaño de icono numérico (usar iconSize con nombre)", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = fs.readFileSync(f, "utf8");
      // `size={44}` en <Icon>/<IconButton>; se excluyen componentes con su propio `size` en px
      // (ExerciseThumb, KcalRing…) buscando solo justo tras `<Icon` o `<IconButton`.
      const matches = src.match(/<Icon(Button)?\b[^>]*\bsize=\{?\d+\}?/g);
      if (matches) offenders.push(`${path.relative(SRC, f)}: ${matches.join(", ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("ninguna etiqueta suelta con variant=\"label\" fuera de Overline", () => {
    const offenders: string[] = [];
    for (const f of files) {
      if (path.basename(f) === "Section.tsx") continue; // ahí vive Overline
      const src = fs.readFileSync(f, "utf8");
      if (src.includes('variant="label"')) offenders.push(path.relative(SRC, f));
    }
    expect(offenders).toEqual([]);
  });
});
