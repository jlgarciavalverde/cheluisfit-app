export interface Palette {
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  muted: string;
  faint: string;
  brand: string;
  /** Color de marca legible como texto sobre `bg`/`surface`. */
  brandText: string;
  onBrand: string;
  brandSoft: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  success: string;
  warning: string;
  danger: string;
  warningSoft: string;
  dangerSoft: string;
  successSoft: string;
  overlay: string;
  /** Negro puro (visor de la cámara). */
  black: string;
  /** Fondo detrás de las fotos de ejercicios (tienen fondo claro en ambos temas). */
  mediaBg: string;
  /** Fondo casi opaco para ver una foto a pantalla completa. */
  scrim: string;
  /** Texto sobre `black`/`scrim` (no cambia con el tema). */
  onScrim: string;
  onScrimMuted: string;
  shadow: string;
}

// Oscuro: gris cálido casi negro, acento naranja-rojo. Macros con tonos distintos
// entre sí y del acento: proteína rosa, hidratos ámbar, grasas azul, fibra verde.
export const dark: Palette = {
  bg: "#0F0E0D",
  surface: "#1A1816",
  surfaceAlt: "#25221F",
  border: "#332F2B",
  text: "#F6F2ED",
  muted: "#B0A79D",
  faint: "#9A9188",
  brand: "#FF5B2E",
  brandText: "#FF7A52",
  onBrand: "#1B0A03",
  brandSoft: "#3A1B10",
  protein: "#F0648F",
  carbs: "#F2B134",
  fat: "#4FB3E8",
  fiber: "#6CCB7E",
  success: "#6CCB7E",
  warning: "#F2B134",
  danger: "#FF7B7B",
  warningSoft: "#3A2E12",
  dangerSoft: "#3D1B1B",
  successSoft: "#17301C",
  overlay: "rgba(0,0,0,0.6)",
  black: "#000000",
  mediaBg: "#FFFFFF",
  scrim: "rgba(0,0,0,0.92)",
  onScrim: "#F6F2ED",
  onScrimMuted: "#CFC8BF",
  shadow: "#000000",
};

export const light: Palette = {
  bg: "#F7F3EE",
  surface: "#FFFFFF",
  surfaceAlt: "#F0EAE2",
  border: "#E2D9CE",
  text: "#1E1A17",
  muted: "#5F574F",
  faint: "#6B625A",
  brand: "#CC3E0C",
  brandText: "#B93A0B",
  onBrand: "#FFFFFF",
  brandSoft: "#FCE6DC",
  protein: "#C2185B",
  carbs: "#875800",
  fat: "#0B6FA4",
  fiber: "#26703D",
  success: "#26703D",
  warning: "#875800",
  danger: "#C62828",
  warningSoft: "#FBEFD5",
  dangerSoft: "#FBE0E0",
  successSoft: "#DDF0E1",
  overlay: "rgba(20,15,10,0.45)",
  black: "#000000",
  mediaBg: "#FFFFFF",
  scrim: "rgba(0,0,0,0.92)",
  onScrim: "#F6F2ED",
  onScrimMuted: "#CFC8BF",
  shadow: "#000000",
};

/** Escala de espacio. `hair` solo para separaciones mínimas (línea, borde). */
export const space = { hair: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
/** `xs` para barras y marcas finas; `tab` = mitad del alto del indicador de pestaña (en Android 999 no se aplicaba ahí). */
export const radius = { xs: 4, sm: 8, md: 14, tab: 16, lg: 20, xl: 28, pill: 999 } as const;

/** Tamaños de icono con nombre: no se usan números sueltos. */
export const iconSize = { xs: 14, sm: 18, md: 22, lg: 26, xl: 32, hero: 48 } as const;
export type IconSize = keyof typeof iconSize;

/** Duraciones de animación (ms). Se reducen a 0 con «reducir movimiento». */
export const motion = { fast: 150, base: 280, slow: 500, hero: 650 } as const;

/** Objetivos táctiles (dp). */
export const touch = { min: 44, comfortable: 48 } as const;

/** Estado de pulsación y de deshabilitado, iguales en todos los componentes. */
export const interaction = { pressedOpacity: 0.85, disabledOpacity: 0.5 } as const;

/** Sombras de lo que flota sobre el contenido (barra de entreno, avisos). */
export const elevation = {
  floating: {
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  toast: {
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
} as const;

export const font = {
  body: "Figtree_400Regular",
  medium: "Figtree_500Medium",
  semibold: "Figtree_600SemiBold",
  bold: "Figtree_700Bold",
  display: "BarlowCondensed_600SemiBold",
  displayBold: "BarlowCondensed_700Bold",
} as const;

export type TextVariant =
  | "displayL"
  | "numeralXL"
  | "display"
  | "numeralS"
  | "title"
  | "heading"
  | "subheading"
  | "body"
  | "bodyStrong"
  | "caption"
  | "control"
  | "tiny"
  | "micro"
  | "input"
  | "inputStrong"
  | "label";

export const typeScale: Record<
  TextVariant,
  { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing?: number; textTransform?: "uppercase" }
> = {
  // Cifras grandes (Barlow Condensed): 64 · 56 · 40 · 32.
  displayL: { fontFamily: font.displayBold, fontSize: 64, lineHeight: 64 },
  numeralXL: { fontFamily: font.displayBold, fontSize: 56, lineHeight: 58 },
  display: { fontFamily: font.displayBold, fontSize: 40, lineHeight: 42 },
  numeralS: { fontFamily: font.displayBold, fontSize: 32, lineHeight: 34 },
  title: { fontFamily: font.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.3 },
  heading: { fontFamily: font.semibold, fontSize: 19, lineHeight: 26 },
  subheading: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: font.semibold, fontSize: 16, lineHeight: 22 },
  caption: { fontFamily: font.medium, fontSize: 13, lineHeight: 18 },
  /** Texto de chips, segmentos y botones pequeños. */
  control: { fontFamily: font.semibold, fontSize: 14, lineHeight: 18 },
  /** Etiquetas pequeñas: insignias, letras de días, pestañas. */
  tiny: { fontFamily: font.medium, fontSize: 12, lineHeight: 16 },
  /** Solo para gráficos y rótulos diminutos. */
  micro: { fontFamily: font.medium, fontSize: 11, lineHeight: 13 },
  /** Texto que se escribe en campos (≥ 16 para que iOS/Android no hagan zoom). */
  input: { fontFamily: font.medium, fontSize: 17, lineHeight: 22 },
  inputStrong: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22 },
  label: {
    fontFamily: font.semibold,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
};

/** Ancho mínimo (px) a partir del cual se usa la barra lateral y dos columnas. */
export const WIDE = 1024;
export const MEDIUM = 640;
