import {
  type ActivityLevel,
  type Entry,
  type GoalType,
  type MealSlot,
  MEAL_SLOTS,
  type Nutrients,
  type Profile,
  type Targets,
} from "./types";

export const GOAL_LABEL: Record<GoalType, string> = {
  lose: "Bajar peso",
  maintain: "Mantener peso",
  gain: "Ganar masa muscular",
};

export const ZERO: Nutrients = {
  kcal: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  fiber: 0,
  sugars: 0,
  satFat: 0,
  salt: 0,
};

export const DEFAULT_MEAL_SPLIT: Record<MealSlot, number> = {
  breakfast: 25,
  midmorning: 10,
  lunch: 30,
  snack: 10,
  dinner: 25,
};

export const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: 1.2, label: "Sedentario", hint: "Poco o nada de ejercicio" },
  { value: 1.375, label: "Ligero", hint: "1-3 días de ejercicio a la semana" },
  { value: 1.55, label: "Moderado", hint: "3-5 días a la semana" },
  { value: 1.725, label: "Alto", hint: "6-7 días a la semana" },
  { value: 1.9, label: "Muy alto", hint: "Entrenas dos veces al día o trabajo físico" },
];

const round1 = (n: number) => Math.round(n * 10) / 10;
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

/** Tasa metabólica basal, Mifflin-St Jeor. */
export function bmr(p: Pick<Profile, "sex" | "weightKg" | "heightCm" | "age">): number {
  return 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age + (p.sex === "male" ? 5 : -161);
}

/** Gasto diario total estimado (mantenimiento). */
export function tdee(p: Profile): number {
  return bmr(p) * p.activity;
}

export const GOAL_ADJUST: Record<Profile["goal"], number> = {
  maintain: 0,
  lose: -0.15,
  gain: 0.1,
};

/**
 * Objetivos diarios sugeridos. Estimación orientativa, no consejo médico:
 * proteína por kg, grasa por kg (mínimo 20 % de las kcal), hidratos el resto,
 * fibra ≈ 14 g por cada 1.000 kcal.
 */
export function calcTargets(p: Profile, adjust: number = GOAL_ADJUST[p.goal]): Targets {
  const kcal = roundTo(tdee(p) * (1 + adjust), 10);
  const proteinPerKg = p.goal === "lose" ? 2.0 : 1.8;
  const protein = Math.round(p.weightKg * proteinPerKg);
  const fat = Math.round(Math.max(p.weightKg * 0.9, (kcal * 0.2) / 9));
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return {
    kcal,
    protein,
    carbs,
    fat,
    fiber: Math.round((14 * kcal) / 1000),
    sugarsMax: Math.round((kcal * 0.1) / 4),
    satFatMax: Math.round((kcal * 0.1) / 9),
    saltMax: 5,
    mealSplit: { ...DEFAULT_MEAL_SPLIT },
  };
}

/** Nutrientes para una cantidad en gramos a partir de los valores por 100 g. */
export function scaleNutrients(per100: Nutrients, grams: number): Nutrients {
  const f = grams / 100;
  return {
    kcal: Math.round(per100.kcal * f),
    protein: round1(per100.protein * f),
    carbs: round1(per100.carbs * f),
    fat: round1(per100.fat * f),
    fiber: round1(per100.fiber * f),
    sugars: round1(per100.sugars * f),
    satFat: round1(per100.satFat * f),
    salt: round1(per100.salt * f),
  };
}

export function sumNutrients(list: readonly Nutrients[]): Nutrients {
  const t = { ...ZERO };
  for (const n of list) {
    t.kcal += n.kcal;
    t.protein += n.protein;
    t.carbs += n.carbs;
    t.fat += n.fat;
    t.fiber += n.fiber;
    t.sugars += n.sugars;
    t.satFat += n.satFat;
    t.salt += n.salt;
  }
  return {
    kcal: Math.round(t.kcal),
    protein: round1(t.protein),
    carbs: round1(t.carbs),
    fat: round1(t.fat),
    fiber: round1(t.fiber),
    sugars: round1(t.sugars),
    satFat: round1(t.satFat),
    salt: round1(t.salt),
  };
}

export function totalsByMeal(entries: readonly Entry[]): Record<MealSlot, Nutrients> {
  const out = {} as Record<MealSlot, Nutrients>;
  for (const slot of MEAL_SLOTS) {
    out[slot] = sumNutrients(entries.filter((e) => e.meal === slot).map((e) => e.nutrients));
  }
  return out;
}

export function mealTargetKcal(targets: Targets, slot: MealSlot): number {
  return Math.round((targets.kcal * targets.mealSplit[slot]) / 100);
}

/**
 * Comprobación de coherencia de una ficha (por 100 g). Devuelve los problemas
 * encontrados; lista vacía = parece coherente.
 * Energía ≈ 4·P + 4·H + 9·G + 7·alcohol (±20 %). La fibra NO se suma aparte: las tablas USDA la
 * cuentan dentro de los hidratos y las etiquetas de la UE, fuera; con este margen
 * valen ambos criterios. `alcoholPer100` es aparte de `Nutrients` (solo lo rellena
 * `offClient.ts`, ver `Food.alcoholPer100`) — sin él, cualquier bebida alcohólica real (una
 * cerveza, un vino, un licor) dispara un falso «las kcal no cuadran» porque casi toda su
 * energía viene del alcohol, no de los macros — comprobado con datos reales de OFF (whisky:
 * 254 kcal/100g con macros ≈ 0).
 */
export function nutrientIssues(n: Nutrients, alcoholPer100 = 0): string[] {
  const issues: string[] = [];
  if (!(n.kcal > 0) && n.protein + n.carbs + n.fat === 0) {
    issues.push("Faltan los valores nutricionales");
    return issues;
  }
  if (n.kcal > 900) issues.push("Más de 900 kcal por 100 g");
  if (n.protein + n.carbs + n.fat > 100.5) {
    issues.push("Los nutrientes suman más de 100 g por 100 g");
  }
  const expected = 4 * n.protein + 4 * n.carbs + 9 * n.fat + 7 * alcoholPer100;
  if (n.kcal >= 20 && Math.abs(n.kcal - expected) / n.kcal > 0.2) {
    issues.push(`Las kcal no cuadran con los macros (≈ ${Math.round(expected)} kcal)`);
  }
  if (n.sugars > n.carbs + 0.5) issues.push("Hay más azúcares que hidratos");
  return issues;
}

export interface WeekDay {
  date: string;
  totals: Nutrients;
  /** Hay al menos un alimento registrado ese día. */
  logged: boolean;
}

export interface WeekSummary {
  days: WeekDay[];
  /** Media de los días con registro (los vacíos no cuentan). */
  average: Nutrients;
  loggedDays: number;
  /** Días registrados con kcal dentro de ±`tolerance` del objetivo. */
  onTargetDays: number;
}

/** ¿Está el día dentro del margen del objetivo de kcal? */
export function isOnTarget(kcal: number, target: number, tolerance = 0.1): boolean {
  return target > 0 && Math.abs(kcal - target) <= target * tolerance;
}

export function weekSummary(
  entries: readonly Entry[],
  dates: readonly string[],
  targetKcal: number,
  tolerance = 0.1,
): WeekSummary {
  const days: WeekDay[] = dates.map((date) => {
    const day = entries.filter((e) => e.date === date);
    return { date, totals: sumNutrients(day.map((e) => e.nutrients)), logged: day.length > 0 };
  });
  const logged = days.filter((d) => d.logged);
  const n = logged.length || 1;
  const sum = sumNutrients(logged.map((d) => d.totals));
  const average: Nutrients = {
    kcal: Math.round(sum.kcal / n),
    protein: round1(sum.protein / n),
    carbs: round1(sum.carbs / n),
    fat: round1(sum.fat / n),
    fiber: round1(sum.fiber / n),
    sugars: round1(sum.sugars / n),
    satFat: round1(sum.satFat / n),
    salt: round1(sum.salt / n),
  };
  return {
    days,
    average: logged.length ? average : { ...ZERO },
    loggedDays: logged.length,
    onTargetDays: logged.filter((d) => isOnTarget(d.totals.kcal, targetKcal, tolerance)).length,
  };
}
