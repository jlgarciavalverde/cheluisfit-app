/** Utilidades de códigos de barras (EAN-13, EAN-8, UPC-A, GTIN-14). */

const VALID_LENGTHS = [8, 12, 13, 14];

export function onlyDigits(code: string): string {
  return code.replace(/\D/g, "");
}

/** Dígito de control GS1 de un código completo (último dígito incluido). */
export function isValidGtin(code: string): boolean {
  const d = onlyDigits(code);
  if (d !== code.trim() || !VALID_LENGTHS.includes(d.length)) return false;
  const digits = d.split("").map(Number);
  const check = digits.pop() as number;
  let sum = 0;
  // Se pesa 3,1,3,1… empezando por la derecha del cuerpo del código.
  for (let i = digits.length - 1, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += digits[i] * w;
  }
  return (10 - (sum % 10)) % 10 === check;
}

/** GTIN-13: rellena con ceros a la izquierda (UPC-A y EAN-8 incluidos). */
export function normalizeGtin13(code: string): string | null {
  const d = onlyDigits(code);
  if (!isValidGtin(d)) return null;
  if (d.length === 14) return d.startsWith("0") ? d.slice(1) : null;
  return d.padStart(13, "0");
}

/**
 * Variantes con las que buscar en Open Food Facts, que guarda algunos códigos
 * con ceros de más o de menos (p. ej. «20512» y «00020512»).
 */
export function gtinVariants(code: string): string[] {
  const d = onlyDigits(code);
  if (!isValidGtin(d)) return [];
  const set = new Set<string>([d]);
  // GTIN-14 → GTIN-13: quitar el dígito indicador (packs/cajas), sea «0» o no. El `replace`
  // de abajo solo quita ceros iniciales, así que un indicador 1-9 (caso real de códigos de
  // caja/palé) nunca generaba el GTIN-13 de 13 dígitos que Open Food Facts sí tiene guardado.
  if (d.length === 14) set.add(d.slice(1));
  const stripped = d.replace(/^0+/, "");
  for (const len of [8, 12, 13]) {
    if (stripped.length <= len) set.add(stripped.padStart(len, "0"));
  }
  set.add(stripped);
  return [...set];
}
