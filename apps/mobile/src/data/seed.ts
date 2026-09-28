// DATOS DE EJEMPLO para la fase de diseño del frontend (sin servidor todavía).
// Los productos con marca y código de barras real son los consultados en Open Food
// Facts (kcal/macros reales de la ficha; el resto de campos son aproximados).
// Los genéricos usan valores típicos de tablas (USDA).
import { addDays, todayKey } from "@/domain/dates";
import { scaleNutrients } from "@/domain/nutrition";
import type { Entry, Food, MealSlot, Nutrients, Profile, WeightEntry } from "@/domain/types";

const n = (
  kcal: number,
  protein: number,
  carbs: number,
  fat: number,
  fiber = 0,
  sugars = 0,
  satFat = 0,
  salt = 0,
): Nutrients => ({ kcal, protein, carbs, fat, fiber, sugars, satFat, salt });

const g = (label: string, grams: number) => ({ label, grams });

export const SEED_FOODS: Food[] = [
  {
    id: "off-8480000205049",
    name: "Yogur griego fresa",
    brand: "Hacendado",
    barcode: "8480000205049",
    source: "off",
    reliability: "verified",
    per100: n(139, 3.3, 13.8, 7.8, 0, 13.2, 5.2, 0.1),
    servings: [g("1 yogur (125 g)", 125)],
    packageInfo: "4 × 125 g",
  },
  {
    id: "off-8480000209047",
    name: "Yogur griego stracciatella",
    brand: "Hacendado",
    barcode: "8480000209047",
    source: "off",
    reliability: "community",
    per100: n(171, 3.3, 18.4, 9.3, 0, 17.5, 6.1, 0.1),
    servings: [g("1 yogur (125 g)", 125)],
    packageInfo: "4 × 125 g",
  },
  {
    id: "off-yogur-griego-ligero",
    name: "Yogur griego ligero",
    brand: "Hacendado",
    source: "off",
    reliability: "community",
    per100: n(60, 5.8, 4.7, 2, 0, 4.7, 1.4, 0.1),
    servings: [g("1 yogur (125 g)", 125)],
    packageInfo: "4 × 125 g",
  },
  {
    id: "off-8480017588098",
    name: "Lentejas cocidas",
    brand: "Dia",
    barcode: "8480017588098",
    source: "off",
    reliability: "verified",
    per100: n(87, 6.7, 11, 0.6, 3.5, 0.6, 0.1, 0.5),
    servings: [g("½ bote (200 g)", 200)],
    packageInfo: "Bote 400 g",
  },
  {
    id: "off-8431876115895",
    name: "Lentejas cocidas sin sal añadida",
    brand: "Carrefour",
    barcode: "8431876115895",
    source: "off",
    reliability: "verified",
    per100: n(86, 6.5, 11, 0.5, 3.6, 0.5, 0.1, 0.02),
    servings: [g("½ bote (200 g)", 200)],
    packageInfo: "Bote 400 g",
  },
  {
    id: "off-yogur-natural-sin-datos",
    name: "Yogur natural desnatado",
    brand: "Marca blanca",
    barcode: "8480000123459",
    source: "off",
    reliability: "incomplete",
    per100: n(0, 0, 0, 0),
    servings: [g("1 yogur (125 g)", 125)],
    packageInfo: "4 × 125 g",
  },
  { id: "usda-pollo-plancha", name: "Pechuga de pollo a la plancha", source: "usda", per100: n(165, 31, 0, 3.6, 0, 0, 1, 0.2), servings: [g("1 filete (150 g)", 150)] },
  { id: "usda-pollo-crudo", name: "Pechuga de pollo cruda", source: "usda", per100: n(120, 22.5, 0, 2.6, 0, 0, 0.6, 0.2), servings: [g("1 filete (180 g)", 180)] },
  { id: "usda-arroz-cocido", name: "Arroz blanco cocido", source: "usda", per100: n(130, 2.7, 28.2, 0.3, 0.4, 0.1, 0.1, 0), servings: [g("1 plato (200 g)", 200)] },
  { id: "usda-arroz-crudo", name: "Arroz blanco crudo", source: "usda", per100: n(365, 7.1, 80, 0.7, 1.3, 0.1, 0.2, 0), servings: [g("1 ración (70 g)", 70)] },
  { id: "usda-huevo", name: "Huevo entero cocido", source: "usda", per100: n(155, 12.6, 1.1, 10.6, 0, 1.1, 3.3, 0.4), servings: [g("1 huevo (55 g)", 55)] },
  { id: "usda-avena", name: "Copos de avena", source: "usda", per100: n(389, 16.9, 66.3, 6.9, 10.6, 0, 1.2, 0), servings: [g("1 cucharón (40 g)", 40)] },
  { id: "usda-platano", name: "Plátano", source: "usda", per100: n(89, 1.1, 22.8, 0.3, 2.6, 12.2, 0.1, 0), servings: [g("1 pieza (120 g)", 120)] },
  { id: "usda-manzana", name: "Manzana", source: "usda", per100: n(52, 0.3, 13.8, 0.2, 2.4, 10.4, 0, 0), servings: [g("1 pieza (180 g)", 180)] },
  { id: "usda-aove", name: "Aceite de oliva virgen extra", source: "usda", per100: n(884, 0, 0, 100, 0, 0, 13.8, 0), servings: [g("1 cucharada (10 g)", 10)] },
  { id: "usda-pan-integral", name: "Pan integral", source: "usda", per100: n(247, 13, 41, 3.4, 7, 6, 0.7, 1.2), servings: [g("1 rebanada (30 g)", 30)] },
  { id: "usda-leche-semi", name: "Leche semidesnatada", source: "usda", per100: n(46, 3.4, 4.8, 1.6, 0, 4.8, 1, 0.1), servings: [g("1 vaso (250 g)", 250)] },
  { id: "usda-atun", name: "Atún al natural (lata)", source: "usda", per100: n(116, 25.5, 0, 0.8, 0, 0, 0.2, 0.8), servings: [g("1 lata (56 g)", 56)] },
  { id: "usda-garbanzos", name: "Garbanzos cocidos", source: "usda", per100: n(164, 8.9, 27.4, 2.6, 7.6, 4.8, 0.3, 0), servings: [g("1 plato (200 g)", 200)] },
  { id: "usda-almendras", name: "Almendras", source: "usda", per100: n(579, 21.2, 21.6, 49.9, 12.5, 4.4, 3.8, 0), servings: [g("1 puñado (25 g)", 25)] },
  { id: "usda-brocoli", name: "Brócoli cocido", source: "usda", per100: n(35, 2.4, 7.2, 0.4, 3.3, 1.4, 0.1, 0), servings: [g("1 ración (120 g)", 120)] },
  { id: "usda-salmon", name: "Salmón cocinado", source: "usda", per100: n(206, 22.1, 0, 12.4, 0, 0, 2.5, 0.1), servings: [g("1 filete (150 g)", 150)] },
  { id: "usda-pasta-cocida", name: "Pasta cocida", source: "usda", per100: n(158, 5.8, 30.9, 0.9, 1.8, 0.6, 0.2, 0), servings: [g("1 plato (220 g)", 220)] },
  { id: "usda-patata-cocida", name: "Patata cocida", source: "usda", per100: n(87, 1.9, 20.1, 0.1, 1.8, 0.9, 0, 0), servings: [g("1 patata (170 g)", 170)] },
  { id: "usda-tomate", name: "Tomate", source: "usda", per100: n(18, 0.9, 3.9, 0.2, 1.2, 2.6, 0, 0), servings: [g("1 pieza (120 g)", 120)] },
  { id: "usda-jamon-serrano", name: "Jamón serrano", source: "usda", per100: n(241, 30, 0, 13, 0, 0, 4.7, 4.5), servings: [g("2 lonchas (30 g)", 30)] },
  // Platos caseros españoles: ni Open Food Facts (solo productos envasados) ni USDA (en inglés,
  // no encuentra "lentejas con chorizo" aunque tenga 600.000 alimentos) los cubren por su
  // nombre en español — valores de tablas, orientativos, varían según la receta de cada casa.
  { id: "usda-lentejas-chorizo", name: "Lentejas con chorizo", source: "usda", per100: n(145, 7.5, 15, 6.5, 4.5, 1.5, 2.2, 0.8), servings: [g("1 plato (350 g)", 350)] },
  { id: "usda-macarrones-atun", name: "Macarrones con atún", source: "usda", per100: n(145, 6.5, 20, 4.5, 1.5, 3, 1, 0.6), servings: [g("1 plato (300 g)", 300)] },
  { id: "usda-tostada-atun", name: "Tostada de atún", source: "usda", per100: n(220, 10, 22, 10, 2, 2, 1.5, 1), servings: [g("1 tostada (120 g)", 120)] },
  { id: "usda-paella", name: "Paella (pollo y verduras)", source: "usda", per100: n(150, 7, 20, 4.5, 1, 1, 0.8, 0.8), servings: [g("1 plato (350 g)", 350)] },
  { id: "usda-fabada", name: "Fabada asturiana", source: "usda", per100: n(180, 9, 14, 10, 5, 1, 3.5, 1), servings: [g("1 plato (350 g)", 350)] },
  { id: "usda-cocido", name: "Cocido madrileño", source: "usda", per100: n(150, 10, 10, 8, 3, 1, 3, 0.9), servings: [g("1 plato (400 g)", 400)] },
  { id: "usda-gazpacho", name: "Gazpacho", source: "usda", per100: n(35, 0.8, 4, 1.8, 0.8, 3, 0.3, 0.4), servings: [g("1 vaso (250 g)", 250)] },
  { id: "usda-ensaladilla", name: "Ensaladilla rusa", source: "usda", per100: n(180, 4, 12, 13, 1.5, 2, 2, 0.9), servings: [g("1 ración (200 g)", 200)] },
  { id: "usda-arroz-pollo", name: "Arroz con pollo", source: "usda", per100: n(150, 8, 20, 4, 1, 1, 1, 0.7), servings: [g("1 plato (350 g)", 350)] },
  { id: "usda-croquetas-jamon", name: "Croquetas de jamón", source: "usda", per100: n(260, 7, 20, 17, 1, 3, 5, 1), servings: [g("3 unidades (90 g)", 90)] },
  { id: "usda-judias-patata", name: "Judías verdes con patata", source: "usda", per100: n(70, 2, 10, 2.5, 3, 2, 0.4, 0.5), servings: [g("1 plato (300 g)", 300)] },
  { id: "usda-pisto", name: "Pisto", source: "usda", per100: n(70, 1.5, 6, 4.5, 2.5, 4, 0.6, 0.5), servings: [g("1 ración (250 g)", 250)] },
  { id: "usda-sopa-fideos", name: "Sopa de fideos con pollo", source: "usda", per100: n(50, 3, 7, 1.2, 0.5, 0.5, 0.3, 0.6), servings: [g("1 plato (300 g)", 300)] },
  { id: "usda-empanadillas-atun", name: "Empanadillas de atún", source: "usda", per100: n(290, 8, 28, 17, 1.5, 2, 4, 1), servings: [g("2 unidades (80 g)", 80)] },
  {
    id: "user-whey",
    name: "Proteína whey (mi bote)",
    source: "user",
    per100: n(380, 80, 6, 6, 0, 3, 3, 0.5),
    servings: [g("1 cacito (30 g)", 30)],
  },
  {
    id: "user-tortilla",
    name: "Tortilla de patatas casera",
    source: "user",
    per100: n(190, 6.5, 13, 12, 1.2, 1, 2.7, 0.6),
    servings: [g("1 pincho (150 g)", 150)],
  },
];

export const SEED_PROFILE: Profile = {
  name: "José Luis",
  sex: "male",
  age: 30,
  heightCm: 178,
  weightKg: 78,
  activity: 1.55,
  goal: "lose",
};

const foodById = new Map(SEED_FOODS.map((f) => [f.id, f]));

function entry(date: string, meal: MealSlot, foodId: string, grams: number, i: number): Entry {
  const f = foodById.get(foodId);
  if (!f) throw new Error(`Alimento de ejemplo desconocido: ${foodId}`);
  return {
    id: `seed-${date}-${meal}-${i}`,
    date,
    meal,
    foodId,
    name: f.name,
    brand: f.brand,
    grams,
    nutrients: scaleNutrients(f.per100, grams),
  };
}

type Plan = [MealSlot, string, number][];

const FULL_DAYS: Plan[] = [
  [
    ["breakfast", "off-8480000205049", 125], ["breakfast", "usda-avena", 40], ["breakfast", "usda-platano", 120],
    ["midmorning", "usda-manzana", 180],
    ["lunch", "usda-pollo-plancha", 180], ["lunch", "usda-arroz-cocido", 220], ["lunch", "usda-brocoli", 120], ["lunch", "usda-aove", 10],
    ["snack", "usda-almendras", 25], ["snack", "usda-leche-semi", 250],
    ["dinner", "usda-salmon", 150], ["dinner", "usda-patata-cocida", 200], ["dinner", "usda-tomate", 120],
  ],
  [
    ["breakfast", "usda-pan-integral", 60], ["breakfast", "usda-huevo", 110], ["breakfast", "usda-leche-semi", 250],
    ["midmorning", "off-8480000209047", 125],
    ["lunch", "off-8480017588098", 250], ["lunch", "usda-arroz-cocido", 150], ["lunch", "usda-jamon-serrano", 30],
    ["snack", "user-whey", 30], ["snack", "usda-platano", 120],
    ["dinner", "user-tortilla", 200], ["dinner", "usda-tomate", 150], ["dinner", "usda-pan-integral", 30],
  ],
  [
    ["breakfast", "usda-avena", 60], ["breakfast", "usda-leche-semi", 250], ["breakfast", "usda-platano", 120],
    ["midmorning", "usda-almendras", 25],
    ["lunch", "usda-pasta-cocida", 250], ["lunch", "usda-atun", 112], ["lunch", "usda-tomate", 120], ["lunch", "usda-aove", 10],
    ["snack", "off-yogur-griego-ligero", 125],
    ["dinner", "usda-pollo-plancha", 160], ["dinner", "usda-garbanzos", 180], ["dinner", "usda-brocoli", 120],
  ],
];

/** Hoy: desayuno, media mañana y comida hechos; merienda y cena pendientes. */
export function seedEntries(today: string = todayKey()): Entry[] {
  const out: Entry[] = [];
  const todayPlan: Plan = [
    ["breakfast", "off-8480000205049", 125], ["breakfast", "usda-avena", 40], ["breakfast", "usda-platano", 120],
    ["midmorning", "usda-manzana", 180],
    ["lunch", "usda-pollo-plancha", 150], ["lunch", "usda-arroz-cocido", 200], ["lunch", "usda-brocoli", 120], ["lunch", "usda-aove", 10],
  ];
  todayPlan.forEach(([m, id, gr], i) => out.push(entry(today, m, id, gr, i)));
  for (let d = 1; d <= 6; d++) {
    const date = addDays(today, -d);
    FULL_DAYS[d % FULL_DAYS.length].forEach(([m, id, gr], i) => out.push(entry(date, m, id, gr, i)));
  }
  return out;
}

/** Un peso a la semana durante 8 semanas, con la variación normal de un día a otro. */
export function seedWeights(today: string = todayKey()): WeightEntry[] {
  const noise = [0.2, -0.3, 0.1, 0.3, -0.2, 0.0, 0.2, -0.1, 0.0];
  return noise.map((n, i) => ({
    date: addDays(today, -7 * (8 - i)),
    // Termina exactamente en el peso del perfil (el último día n = 0).
    kg: Math.round((SEED_PROFILE.weightKg + (8 - i) * 0.31 + n) * 10) / 10,
  }));
}
