// Tipos de dominio de CheluisFIT. Puros (sin React Native) para poder moverlos
// al paquete compartido con el servidor cuando empiece el backend.

export type Sex = "male" | "female";
export type GoalType = "maintain" | "lose" | "gain";
export type MealSlot = "breakfast" | "midmorning" | "lunch" | "snack" | "dinner";

export const MEAL_SLOTS: readonly MealSlot[] = [
  "breakfast",
  "midmorning",
  "lunch",
  "snack",
  "dinner",
];

export const MEAL_LABEL: Record<MealSlot, string> = {
  breakfast: "Desayuno",
  midmorning: "Media mañana",
  lunch: "Comida",
  snack: "Merienda",
  dinner: "Cena",
};

/** Nutrientes en gramos (kcal en kcal; sal en g). Por 100 g en `Food`, por cantidad en `Entry`. */
export interface Nutrients {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugars: number;
  satFat: number;
  salt: number;
}

export type FoodSource = "off" | "usda" | "user";
/** Fiabilidad de los datos (solo aplica a Open Food Facts). */
export type Reliability = "verified" | "community" | "incomplete";

export interface Serving {
  label: string;
  grams: number;
}

export interface Food {
  id: string;
  name: string;
  brand?: string;
  barcode?: string;
  source: FoodSource;
  reliability?: Reliability;
  per100: Nutrients;
  servings: Serving[];
  /** Cantidad neta del envase, texto libre («4 × 125 g»). */
  packageInfo?: string;
  imageUrl?: string;
  /**
   * Gramos de alcohol por 100 g/ml (solo bebidas, `offClient.ts`). Aparte de `per100`: solo lo
   * usa `nutrientIssues()` para no confundir la energía real de una bebida alcohólica con un
   * error de la ficha — no se muestra en pantalla.
   */
  alcoholPer100?: number;
  /**
   * Solo en alimentos propios: id del alimento (de Open Food Facts/USDA/ejemplo) que esta versión
   * corrige. El original deja de salir en búsquedas y el escáner encuentra esta versión.
   */
  replaces?: string;
}

export interface Entry {
  id: string;
  /** YYYY-MM-DD en hora local. */
  date: string;
  meal: MealSlot;
  foodId: string;
  name: string;
  brand?: string;
  grams: number;
  /** Copia de los nutrientes de esta cantidad: editar el alimento no cambia el histórico. */
  nutrients: Nutrients;
}

export type ActivityLevel = 1.2 | 1.375 | 1.55 | 1.725 | 1.9;

export interface Profile {
  name: string;
  /** Frecuencia cardiaca máxima; si falta se estima como 220 − edad. */
  maxHr?: number;
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  activity: ActivityLevel;
  goal: GoalType;
}

export interface Targets {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  /** Límites orientativos (máximos). */
  sugarsMax: number;
  satFatMax: number;
  saltMax: number;
  /** Reparto de kcal por comida en %, suma 100. */
  mealSplit: Record<MealSlot, number>;
}

/** Una comida guardada («Mi desayuno de siempre»): se añade de golpe a cualquier comida. */
export interface SavedMeal {
  id: string;
  name: string;
  items: { foodId: string; name: string; brand?: string; grams: number; nutrients: Nutrients }[];
}

export interface WeightEntry {
  /** YYYY-MM-DD */
  date: string;
  kg: number;
}

export type MeasurementKind = "waist" | "chest" | "arm" | "thigh" | "hip";

export interface MeasurementEntry {
  /** YYYY-MM-DD */
  date: string;
  kind: MeasurementKind;
  cm: number;
}
