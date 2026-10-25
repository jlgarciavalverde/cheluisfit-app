// Nevera: alimentos con su sitio (zona, balda, posición horizontal) para la vista 3D y para el
// contexto del asistente de IA. El servidor (`routes/aiVision.ts`) devuelve cada foto ya
// estructurada; aquí se fusiona con lo que ya había, se colocan los que llegan sin sitio y se
// traduce el sitio a coordenadas 3D. Todo puro, sin estado (ver `fridge.test.ts`).
import { normalizeText } from "./text";

export const FRIDGE_CATEGORIES = ["lacteo", "carne", "pescado", "fruta", "verdura", "bebida", "salsa", "huevos", "sobras", "otros"] as const;
export type FridgeCategory = (typeof FRIDGE_CATEGORIES)[number];
export const FRIDGE_ZONES = ["shelf", "drawer", "door", "freezer"] as const;
export type FridgeZone = (typeof FRIDGE_ZONES)[number];

export const CATEGORY_LABEL: Record<FridgeCategory, string> = {
  lacteo: "Lácteos",
  carne: "Carne",
  pescado: "Pescado",
  fruta: "Fruta",
  verdura: "Verdura",
  bebida: "Bebidas",
  salsa: "Salsas",
  huevos: "Huevos",
  sobras: "Sobras y táperes",
  otros: "Otros",
};

export const ZONE_LABEL: Record<FridgeZone, string> = { shelf: "Balda", drawer: "Cajón", door: "Puerta", freezer: "Congelador" };

export interface FridgeItem {
  id: string;
  name: string;
  category: FridgeCategory;
  quantity?: number;
  unit?: string;
  zone: FridgeZone;
  /** Balda/estante/cajón contando desde arriba, empezando en 0. */
  level: number;
  /** 0 = izquierda, 1 = derecha. */
  x: number;
  depth: "front" | "back";
  expiresHint?: string;
  /** `false` si nadie dijo dónde está (lista antigua, plan B en texto, añadido a mano sin sitio). */
  positioned: boolean;
  /** ISO completo: cuándo se vio o se añadió por última vez. */
  seenAt: string;
}

export interface FridgeLayout {
  shelves: number;
  drawers: number;
  doorShelves: number;
}

export interface Fridge {
  items: FridgeItem[];
  layout: FridgeLayout;
  /** ISO completo (antes de la v7 de la tienda era solo YYYY-MM-DD; las dos se leen bien). */
  lastScannedAt: string | null;
}

export const DEFAULT_LAYOUT: FridgeLayout = { shelves: 4, drawers: 2, doorShelves: 3 };
export const EMPTY_FRIDGE: Fridge = { items: [], layout: DEFAULT_LAYOUT, lastScannedAt: null };

/** Lo que devuelve `POST /api/ai/vision/fridge` en `scan`. */
export interface FridgeScan {
  items: { name: string; category: FridgeCategory; quantity?: number; unit?: string; zone: FridgeZone; level: number; x: number; depth: "front" | "back"; confidence: number; expiresHint?: string }[];
  shelvesSeen: number;
  doorVisible: boolean;
  positioned: boolean;
}

const uid = () => `f-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Clave para detectar duplicados: «Tomates» y «tomate» son lo mismo. */
export function itemKey(name: string): string {
  // Plural español aproximado, palabra a palabra: «limones» → «limon», «tomates» → «tomate».
  return normalizeText(name)
    .split(" ")
    .map((w) => (w.length > 4 && /[lnrdj]es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
    .join(" ");
}

export function capitalize(s: string): string {
  const t = s.trim();
  return t ? t[0].toUpperCase() + t.slice(1) : t;
}

/** Nevera antigua (`items: string[]`, fecha corta) → formato actual, sin sitio conocido. */
export function migrateFridge(old: unknown): Fridge {
  if (!old || typeof old !== "object") return EMPTY_FRIDGE;
  const o = old as { items?: unknown; layout?: FridgeLayout; lastScannedAt?: string | null };
  const items = Array.isArray(o.items) ? o.items : [];
  const seenAt = o.lastScannedAt ? new Date(o.lastScannedAt).toISOString() : new Date().toISOString();
  const converted: FridgeItem[] = items.map((it) =>
    typeof it === "string"
      ? { id: uid(), name: it, category: "otros", zone: "shelf", level: 0, x: 0.5, depth: "front", positioned: false, seenAt }
      : (it as FridgeItem),
  );
  return autoPlace({ items: dedupe(converted), layout: o.layout ?? DEFAULT_LAYOUT, lastScannedAt: o.lastScannedAt ?? null });
}

function dedupe(items: FridgeItem[]): FridgeItem[] {
  const seen = new Map<string, FridgeItem>();
  for (const it of items) seen.set(itemKey(it.name), it); // el último gana (el más reciente)
  return [...seen.values()];
}

/**
 * Añade una foto a la nevera. `replace` la deja solo con lo de la foto; `add` (una balda, la
 * puerta…) conserva lo demás y, si un alimento ya estaba, actualiza su sitio y su cantidad sin
 * cambiarle el `id` (no se pierde lo que se editó a mano: nombre y categoría se quedan).
 */
export function mergeScan(fridge: Fridge, scan: FridgeScan, mode: "replace" | "add", now: string = new Date().toISOString()): Fridge {
  const byKey = new Map(fridge.items.map((it) => [itemKey(it.name), it]));
  const incoming: FridgeItem[] = [];
  for (const s of scan.items) {
    const key = itemKey(s.name);
    const prev = byKey.get(key);
    const pos = scan.positioned
      ? { zone: s.zone, level: Math.max(0, Math.round(s.level)), x: clamp(s.x, 0, 1), depth: s.depth, positioned: true }
      : prev
        ? { zone: prev.zone, level: prev.level, x: prev.x, depth: prev.depth, positioned: prev.positioned }
        : { zone: "shelf" as const, level: 0, x: 0.5, depth: "front" as const, positioned: false };
    incoming.push({
      id: prev?.id ?? uid(),
      name: prev?.name ?? capitalize(s.name),
      category: prev && prev.category !== "otros" ? prev.category : s.category,
      quantity: s.quantity ?? prev?.quantity,
      unit: s.quantity != null ? s.unit : prev?.unit,
      expiresHint: s.expiresHint,
      ...pos,
      seenAt: now,
    });
  }
  const incomingKeys = new Set(incoming.map((it) => itemKey(it.name)));
  const kept = mode === "add" ? fridge.items.filter((it) => !incomingKeys.has(itemKey(it.name))) : [];
  const maxLevel = Math.max(-1, ...incoming.filter((i) => i.zone === "shelf" && i.positioned).map((i) => i.level));
  const shelves = clamp(Math.max(mode === "add" ? fridge.layout.shelves : 2, scan.shelvesSeen || 0, maxLevel + 1, 2), 2, 6);
  return autoPlace({ items: dedupe([...kept, ...incoming]), layout: { ...fridge.layout, shelves }, lastScannedAt: now });
}

/** Zona por defecto según la categoría, para los alimentos que llegan sin sitio. */
export function defaultZone(category: FridgeCategory): FridgeZone {
  if (category === "bebida" || category === "salsa" || category === "huevos") return "door";
  if (category === "fruta" || category === "verdura") return "drawer";
  return "shelf";
}

function levelsFor(zone: FridgeZone, layout: FridgeLayout): number {
  return zone === "shelf" ? layout.shelves : zone === "drawer" ? layout.drawers : zone === "door" ? layout.doorShelves : 1;
}

/**
 * Coloca los alimentos sin sitio (`positioned: false`): zona según categoría, el hueco con menos
 * cosas de esa zona y repartidos a lo ancho. Los que ya tienen sitio solo se acotan al número de
 * baldas real (una IA que dice «balda 7» en una nevera de 4).
 */
export function autoPlace(fridge: Fridge): Fridge {
  const { layout } = fridge;
  const fixed = fridge.items.map((it) => (it.positioned ? { ...it, level: clamp(it.level, 0, levelsFor(it.zone, layout) - 1) } : it));
  const count = new Map<string, number>();
  for (const it of fixed) if (it.positioned) count.set(`${it.zone}:${it.level}`, (count.get(`${it.zone}:${it.level}`) ?? 0) + 1);
  const placed = fixed.map((it) => {
    if (it.positioned) return it;
    const zone = it.zone !== "shelf" || it.category === "otros" ? (it.category === "otros" ? "shelf" : it.zone) : defaultZone(it.category);
    const levels = levelsFor(zone, layout);
    let best = 0;
    for (let l = 1; l < levels; l++) if ((count.get(`${zone}:${l}`) ?? 0) < (count.get(`${zone}:${best}`) ?? 0)) best = l;
    const k = `${zone}:${best}`;
    const n = count.get(k) ?? 0;
    count.set(k, n + 1);
    return { ...it, zone, level: best, x: ((n * 0.37 + 0.15) % 0.8) + 0.1 };
  });
  return { ...fridge, items: placed };
}

/** Grupos para la vista de lista y el resumen accesible: «Balda 1», «Puerta 2»… */
export function groupByPlace(items: readonly FridgeItem[]): { label: string; zone: FridgeZone; level: number; items: FridgeItem[] }[] {
  const order: FridgeZone[] = ["freezer", "shelf", "drawer", "door"];
  const groups = new Map<string, { label: string; zone: FridgeZone; level: number; items: FridgeItem[] }>();
  for (const it of items) {
    const key = `${it.zone}:${it.level}`;
    if (!groups.has(key)) groups.set(key, { label: it.zone === "freezer" ? ZONE_LABEL.freezer : `${ZONE_LABEL[it.zone]} ${it.level + 1}`, zone: it.zone, level: it.level, items: [] });
    groups.get(key)!.items.push(it);
  }
  return [...groups.values()]
    .sort((a, b) => order.indexOf(a.zone) - order.indexOf(b.zone) || a.level - b.level)
    .map((g) => ({ ...g, items: [...g.items].sort((a, b) => a.x - b.x) }));
}

export function fmtQuantity(it: Pick<FridgeItem, "quantity" | "unit">): string {
  if (it.quantity == null) return "";
  const q = Number.isInteger(it.quantity) ? String(it.quantity) : it.quantity.toFixed(1).replace(".", ",");
  return it.unit ? `${q} ${it.unit}` : q;
}

/** Días completos desde el último escaneo (acepta fecha corta o ISO). */
export function daysSinceScan(lastScannedAt: string | null, now: Date = new Date()): number | null {
  if (!lastScannedAt) return null;
  return Math.max(0, Math.floor((now.getTime() - Date.parse(lastScannedAt)) / 86_400_000));
}

/** Resumen compacto para el asistente, por sitios, acotado a `maxChars`. */
export function fridgeContext(fridge: Fridge, now: Date = new Date(), maxChars = 700): string | null {
  if (fridge.items.length === 0) return null;
  const days = daysSinceScan(fridge.lastScannedAt, now);
  const head = `En la nevera${days != null ? ` (vista hace ${days} ${days === 1 ? "día" : "días"})` : ""}: `;
  const parts = groupByPlace(fridge.items).map(
    (g) => `${g.label}: ${g.items.map((it) => [it.name, fmtQuantity(it), it.expiresHint].filter(Boolean).join(" ")).join(", ")}`,
  );
  let out = head + parts.join("; ") + ".";
  if (out.length > maxChars) out = `${out.slice(0, maxChars - 1)}…`;
  return out;
}

// ------------------------------------------------------------------ Geometría 3D

/** Medidas de la nevera en unidades de escena (≈ decímetros). Compartidas con `Fridge3D.tsx`. */
export const FRIDGE_DIMS = { width: 6, height: 12, depth: 5, wall: 0.15, freezerH: 2.6, drawerH: 1.6, doorDepth: 1 } as const;

/**
 * Centro del alimento en la escena: origen en el centro de la base de la nevera, X a la derecha,
 * Y hacia arriba, Z hacia quien mira. Los de la puerta se dan en coordenadas **de la puerta**
 * (se giran con ella en `Fridge3D.tsx`): X sobre el ancho de la puerta, Z = 0 en su cara interior.
 */
export function itemPosition(it: Pick<FridgeItem, "zone" | "level" | "x" | "depth">, layout: FridgeLayout): [number, number, number] {
  const d = FRIDGE_DIMS;
  const innerW = d.width - 2 * d.wall;
  const x = -innerW / 2 + 0.5 + it.x * (innerW - 1);
  const z = it.depth === "back" ? -d.depth / 4 : d.depth / 6;
  const bodyBottom = d.wall + layout.drawers * d.drawerH;
  const bodyTop = d.height - d.freezerH;
  if (it.zone === "freezer") return [x, bodyTop + 0.4, z];
  if (it.zone === "drawer") {
    const level = clamp(it.level, 0, layout.drawers - 1);
    return [x, bodyBottom - (level + 1) * d.drawerH + 0.35, z];
  }
  if (it.zone === "door") {
    const span = (bodyTop - bodyBottom) / layout.doorShelves;
    const level = clamp(it.level, 0, layout.doorShelves - 1);
    return [x, bodyTop - (level + 1) * span + 0.05, d.doorDepth / 2];
  }
  const span = (bodyTop - bodyBottom) / layout.shelves;
  const level = clamp(it.level, 0, layout.shelves - 1);
  return [x, bodyTop - (level + 1) * span + 0.05, z];
}

/** Altura (Y) de cada balda del cuerpo, de arriba abajo; la última es el techo de los cajones. */
export function shelfHeights(layout: FridgeLayout): number[] {
  const d = FRIDGE_DIMS;
  const bodyBottom = d.wall + layout.drawers * d.drawerH;
  const bodyTop = d.height - d.freezerH;
  const span = (bodyTop - bodyBottom) / layout.shelves;
  return Array.from({ length: layout.shelves }, (_, i) => bodyTop - (i + 1) * span);
}

export type ItemShape = "bottle" | "carton" | "box" | "round" | "jar" | "tray";

export function shapeFor(category: FridgeCategory): ItemShape {
  switch (category) {
    case "bebida":
      return "bottle";
    case "lacteo":
      return "carton";
    case "fruta":
    case "verdura":
    case "huevos":
      return "round";
    case "salsa":
      return "jar";
    case "carne":
    case "pescado":
      return "tray";
    default:
      return "box";
  }
}
