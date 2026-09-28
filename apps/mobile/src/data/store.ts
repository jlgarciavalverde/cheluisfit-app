import { create } from "zustand";
import { persist } from "zustand/middleware";
import { guardedJSONStorage, guardRehydrate } from "./persistSafety";
import { addDays, todayKey } from "@/domain/dates";
import { calcTargets, scaleNutrients } from "@/domain/nutrition";
import { checkTdeeAdjustment, effectiveAdjust, TDEE_CHECK_EVERY_DAYS, type TdeeProposal } from "@/domain/tdee";
import type { Entry, Food, MealSlot, MeasurementEntry, MeasurementKind, Profile, SavedMeal, Targets, WeightEntry } from "@/domain/types";
import { normalizeWeights } from "@/domain/weight";
import { setMealReminder } from "@/lib/reminders";
import { SEED_FOODS, SEED_PROFILE, seedEntries, seedWeights } from "./seed";

export interface NutritionState {
  profile: Profile;
  /** Objetivos editados a mano; `null` = usar los calculados a partir del perfil. */
  targetsOverride: Targets | null;
  entries: Entry[];
  /** Alimentos creados por el usuario o elegidos/escaneados (caché). */
  foods: Food[];
  favorites: string[];
  recents: string[];
  savedMeals: SavedMeal[];
  weights: WeightEntry[];
  /** Medidas corporales (cintura, pecho, brazo, muslo, cadera) — mismo patrón que `weights`, ver `domain/measurements.ts`. */
  measurements: MeasurementEntry[];
  /** Suma a las kcal del día las calorías activas de las actividades (Garmin). */
  sumExerciseKcal: boolean;
  /** Aviso diario a las 21:00 si no se ha registrado nada (`lib/reminders.ts`). */
  remindMeals: boolean;
  /** Última lectura de la nevera por IA (`nevera.tsx`) — solo texto, la foto nunca se guarda. */
  fridge: { items: string[]; lastScannedAt: string | null };
  /** TDEE adaptativo (`domain/tdee.ts`): corrección aprendida sobre el % fijo del objetivo.
   *  Separado de `targetsOverride` a propósito — un objetivo a mano pausa este motor, no compite
   *  con él (ver `checkTdee()`). */
  tdee: { kcalAdjustment: number; enabled: boolean; lastCheckedAt: string | null; pending: TdeeProposal | null };

  addEntry: (food: Food, grams: number, meal: MealSlot, date: string) => string;
  updateEntry: (id: string, patch: { grams?: number; meal?: MealSlot }) => void;
  removeEntry: (id: string) => Entry | undefined;
  restoreEntry: (entry: Entry) => void;
  copyMeal: (fromDate: string, toDate: string, meal: MealSlot) => number;
  saveFood: (food: Food) => void;
  toggleFavorite: (foodId: string) => void;
  saveMeal: (name: string, date: string, meal: MealSlot) => SavedMeal | null;
  deleteSavedMeal: (id: string) => SavedMeal | undefined;
  restoreSavedMeal: (m: SavedMeal) => void;
  /** Añade todos los alimentos de una comida guardada; devuelve los ids creados (para deshacer). */
  addSavedMeal: (id: string, meal: MealSlot, date: string) => string[];
  removeEntries: (ids: string[]) => void;
  /** Guarda un peso; si es el más reciente, actualiza el perfil y con él el objetivo. */
  addWeight: (date: string, kg: number) => { updatedProfile: boolean };
  removeWeight: (date: string) => WeightEntry | undefined;
  addMeasurement: (date: string, kind: MeasurementKind, cm: number) => void;
  removeMeasurement: (date: string, kind: MeasurementKind) => MeasurementEntry | undefined;
  setProfile: (p: Profile) => void;
  setTargetsOverride: (t: Targets | null) => void;
  setSumExerciseKcal: (v: boolean) => void;
  setRemindMeals: (v: boolean) => void;
  setFridgeContents: (items: string[]) => void;
  clearFridge: () => void;
  setTdeeEnabled: (enabled: boolean) => void;
  /** Revisa si toca proponer un ajuste (cadencia semanal, ver `checkTdeeAdjustment`); no hace
   *  nada mientras haya un objetivo a mano (`targetsOverride`). */
  checkTdee: () => void;
  applyTdeeProposal: () => void;
  dismissTdeeProposal: () => void;
  resetDemo: () => void;
  /** Vacía de verdad (sin datos de ejemplo) — antes de sincronizar con una cuenta real. */
  startFresh: () => void;
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Perfil neutro para «empezar de cero»: sin nombre ni datos reales, listo para editar en Objetivo. */
const BLANK_PROFILE: Profile = { name: "", sex: "male", age: 30, heightCm: 175, weightKg: 75, activity: 1.375, goal: "maintain" };

const empty = () => ({
  profile: BLANK_PROFILE,
  targetsOverride: null,
  entries: [] as Entry[],
  foods: [] as Food[],
  favorites: [] as string[],
  recents: [] as string[],
  savedMeals: [] as SavedMeal[],
  weights: [] as WeightEntry[],
  measurements: [] as MeasurementEntry[],
  sumExerciseKcal: false,
  remindMeals: false,
  fridge: { items: [] as string[], lastScannedAt: null as string | null },
  tdee: { kcalAdjustment: 0, enabled: true, lastCheckedAt: null as string | null, pending: null as TdeeProposal | null },
});

const initial = () => ({
  profile: SEED_PROFILE,
  targetsOverride: null,
  entries: seedEntries(),
  foods: [] as Food[],
  favorites: ["off-8480000205049", "usda-avena", "usda-pollo-plancha"],
  recents: ["usda-manzana", "usda-avena", "off-8480000205049"],
  savedMeals: [] as SavedMeal[],
  weights: seedWeights(),
  measurements: [] as MeasurementEntry[],
  sumExerciseKcal: false,
  remindMeals: false,
  fridge: { items: [] as string[], lastScannedAt: null as string | null },
  tdee: { kcalAdjustment: 0, enabled: true, lastCheckedAt: null as string | null, pending: null as TdeeProposal | null },
});

export const useNutrition = create<NutritionState>()(
  persist(
    (set, get) => ({
      ...initial(),

      addEntry: (food, grams, meal, date) => {
        const id = uid();
        const entry: Entry = {
          id,
          date,
          meal,
          foodId: food.id,
          name: food.name,
          brand: food.brand,
          grams,
          nutrients: scaleNutrients(food.per100, grams),
        };
        set((s) => ({
          entries: [...s.entries, entry],
          foods: s.foods.some((f) => f.id === food.id) ? s.foods : [...s.foods, food],
          recents: [food.id, ...s.recents.filter((r) => r !== food.id)].slice(0, 20),
        }));
        return id;
      },

      updateEntry: (id, patch) =>
        set((s) => ({
          entries: s.entries.map((e) => {
            if (e.id !== id) return e;
            const food = [...s.foods, ...SEED_FOODS].find((f) => f.id === e.foodId);
            const grams = patch.grams ?? e.grams;
            const k = e.grams > 0 ? 100 / e.grams : 0;
            const n = e.nutrients;
            return {
              ...e,
              meal: patch.meal ?? e.meal,
              grams,
              // Con la ficha actual si existe; si no, se reescala la copia guardada.
              nutrients: food
                ? scaleNutrients(food.per100, grams)
                : scaleNutrients(
                    {
                      kcal: n.kcal * k,
                      protein: n.protein * k,
                      carbs: n.carbs * k,
                      fat: n.fat * k,
                      fiber: n.fiber * k,
                      sugars: n.sugars * k,
                      satFat: n.satFat * k,
                      salt: n.salt * k,
                    },
                    grams,
                  ),
            };
          }),
        })),

      removeEntry: (id) => {
        const found = get().entries.find((e) => e.id === id);
        if (found) set((s) => ({ entries: s.entries.filter((e) => e.id !== id) }));
        return found;
      },

      restoreEntry: (entry) => set((s) => ({ entries: [...s.entries, entry] })),

      removeEntries: (ids) => set((s) => ({ entries: s.entries.filter((e) => !ids.includes(e.id)) })),

      copyMeal: (fromDate, toDate, meal) => {
        const src = get().entries.filter((e) => e.date === fromDate && e.meal === meal);
        const copies = src.map((e) => ({ ...e, id: uid(), date: toDate }));
        if (copies.length) set((s) => ({ entries: [...s.entries, ...copies] }));
        return copies.length;
      },

      saveFood: (food) =>
        set((s) => ({
          foods: s.foods.some((f) => f.id === food.id)
            ? s.foods.map((f) => (f.id === food.id ? food : f))
            : [...s.foods, food],
        })),

      toggleFavorite: (foodId) =>
        set((s) => ({
          favorites: s.favorites.includes(foodId)
            ? s.favorites.filter((f) => f !== foodId)
            : [foodId, ...s.favorites],
        })),

      saveMeal: (name, date, meal) => {
        const src = get().entries.filter((e) => e.date === date && e.meal === meal);
        if (src.length === 0 || !name.trim()) return null;
        const saved: SavedMeal = {
          id: `meal-${uid()}`,
          name: name.trim(),
          items: src.map((e) => ({
            foodId: e.foodId,
            name: e.name,
            brand: e.brand,
            grams: e.grams,
            nutrients: e.nutrients,
          })),
        };
        set((s) => ({ savedMeals: [saved, ...s.savedMeals] }));
        return saved;
      },

      deleteSavedMeal: (id) => {
        const found = get().savedMeals.find((m) => m.id === id);
        if (found) set((s) => ({ savedMeals: s.savedMeals.filter((m) => m.id !== id) }));
        return found;
      },

      restoreSavedMeal: (m) => set((s) => ({ savedMeals: [m, ...s.savedMeals] })),

      addSavedMeal: (id, meal, date) => {
        const found = get().savedMeals.find((m) => m.id === id);
        if (!found) return [];
        const created: Entry[] = found.items.map((it) => ({
          id: uid(),
          date,
          meal,
          foodId: it.foodId,
          name: it.name,
          brand: it.brand,
          grams: it.grams,
          nutrients: it.nutrients,
        }));
        set((s) => ({ entries: [...s.entries, ...created] }));
        return created.map((c) => c.id);
      },

      addWeight: (date, kg) => {
        const list = normalizeWeights([...get().weights, { date, kg }]);
        const isLatest = list[list.length - 1].date === date;
        set((s) => ({
          weights: list,
          profile: isLatest ? { ...s.profile, weightKg: kg } : s.profile,
        }));
        return { updatedProfile: isLatest };
      },

      removeWeight: (date) => {
        const found = get().weights.find((w) => w.date === date);
        if (found) set((s) => ({ weights: s.weights.filter((w) => w.date !== date) }));
        return found;
      },

      addMeasurement: (date, kind, cm) =>
        set((s) => ({
          measurements: [...s.measurements.filter((m) => !(m.date === date && m.kind === kind)), { date, kind, cm }],
        })),
      removeMeasurement: (date, kind) => {
        const found = get().measurements.find((m) => m.date === date && m.kind === kind);
        if (found) set((s) => ({ measurements: s.measurements.filter((m) => !(m.date === date && m.kind === kind)) }));
        return found;
      },

      setProfile: (profile) => set({ profile }),
      setTargetsOverride: (targetsOverride) => set({ targetsOverride }),
      setSumExerciseKcal: (sumExerciseKcal) => set({ sumExerciseKcal }),
      setRemindMeals: (remindMeals) => {
        set({ remindMeals });
        setMealReminder(remindMeals).catch(() => {});
      },
      setFridgeContents: (items) => set({ fridge: { items, lastScannedAt: todayKey() } }),
      clearFridge: () => set({ fridge: { items: [], lastScannedAt: null } }),
      setTdeeEnabled: (enabled) => set((s) => ({ tdee: { ...s.tdee, enabled } })),
      checkTdee: () => {
        const s = get();
        if (s.targetsOverride !== null) return; // objetivo a mano: el motor queda en pausa, no compite
        const today = todayKey();
        if (s.tdee.lastCheckedAt) {
          const daysSince = Math.round((Date.parse(today) - Date.parse(s.tdee.lastCheckedAt)) / 86_400_000);
          if (daysSince < TDEE_CHECK_EVERY_DAYS) return; // no toca revisar todavía: no se toca `lastCheckedAt`
        }
        const proposal = checkTdeeAdjustment({ profile: s.profile, weights: s.weights, entries: s.entries, today, kcalAdjustment: s.tdee.kcalAdjustment });
        set((cur) => ({ tdee: { ...cur.tdee, lastCheckedAt: today, pending: proposal } }));
      },
      applyTdeeProposal: () =>
        set((s) => (s.tdee.pending ? { tdee: { ...s.tdee, kcalAdjustment: s.tdee.pending.newAdjustment, pending: null } } : s)),
      dismissTdeeProposal: () => set((s) => ({ tdee: { ...s.tdee, pending: null } })),
      resetDemo: () => set(initial()),
      startFresh: () => set(empty()),
    }),
    {
      name: "cf_nutrition_v1",
      storage: guardedJSONStorage(),
      version: 6,
      // v1 → v2: llegan los pesos y las comidas guardadas. v2 → v3: llega `fridge` (Nevera).
      // v3 → v4: llega `tdee` (ajuste adaptativo). v4 → v5: llegan `measurements` (medidas
      // corporales). v5 → v6: llega `remindMeals`. Se conserva todo lo demás — el `migrate`
      // genérico rellena cualquier campo nuevo desde `empty()` sin listar cada versión aparte.
      // **Nunca desde `initial()`**: metería pesos o comidas de ejemplo entre los datos reales
      // (y el TDEE adaptativo los usaría como si fueran de verdad).
      migrate: (persisted) => ({ ...empty(), ...(persisted as object) }) as NutritionState,
      // El aviso diario vive en el sistema, no en el blob: tras bajar los datos de la cuenta en
      // un móvil nuevo (o reinstalar), `remindMeals` puede venir activado sin nada programado.
      // Reprogramarlo al cargar es idempotente (`setMealReminder` cancela antes de crear).
      onRehydrateStorage: guardRehydrate<NutritionState>("cf_nutrition_v1", (state) => {
        if (state.remindMeals) setMealReminder(true).catch(() => {});
      }),
    },
  ),
);

/** Objetivos vigentes: los editados a mano o los calculados del perfil. */
export function selectTargets(s: Pick<NutritionState, "profile" | "targetsOverride" | "tdee">): Targets {
  return s.targetsOverride ?? calcTargets(s.profile, s.tdee.enabled ? effectiveAdjust(s.profile, s.tdee.kcalAdjustment) : undefined);
}

export function useTargets(): Targets {
  const profile = useNutrition((s) => s.profile);
  const override = useNutrition((s) => s.targetsOverride);
  const tdeeState = useNutrition((s) => s.tdee);
  return override ?? calcTargets(profile, tdeeState.enabled ? effectiveAdjust(profile, tdeeState.kcalAdjustment) : undefined);
}

export function useDayEntries(date: string): Entry[] {
  const entries = useNutrition((s) => s.entries);
  return entries.filter((e) => e.date === date);
}

export { addDays, todayKey };
