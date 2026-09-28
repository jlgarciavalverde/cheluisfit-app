import { create } from "zustand";
import { persist } from "zustand/middleware";
import { guardedJSONStorage, guardRehydrate } from "./persistSafety";
import { addDays, todayKey } from "@/domain/dates";
import { rescaleNutrients, scaleNutrients } from "@/domain/nutrition";
import { useMemo } from "react";
import { checkTdeeAdjustment, hasEnoughTdeeData, targetsFor, TDEE_CHECK_EVERY_DAYS, type TdeeProposal } from "@/domain/tdee";
import type { Entry, Food, MealSlot, MeasurementEntry, MeasurementKind, Profile, SavedMeal, Targets, WeightEntry } from "@/domain/types";
import { normalizeWeights } from "@/domain/weight";
import { setMealReminder } from "@/lib/reminders";
import { SEED_PROFILE, seedEntries, seedWeights } from "./seed";

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
  /** Copia una comida de un día a otro; devuelve los ids creados (para «Deshacer»). */
  copyMeal: (fromDate: string, toDate: string, meal: MealSlot) => string[];
  saveFood: (food: Food) => void;
  /** Guarda tu versión corregida de `food.replaces` y pasa favoritos/recientes a ella. */
  saveFoodVersion: (food: Food) => void;
  /** Borra un alimento propio (las entradas ya registradas guardan su copia y no cambian). */
  removeFood: (id: string) => Food | undefined;
  restoreFood: (food: Food) => void;
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
  /** `exerciseKcalPerDay`: media diaria de kcal de ejercicio de las 2 últimas semanas (solo cuenta
   *  si «sumar calorías de ejercicio» está activado). */
  checkTdee: (exerciseKcalPerDay?: number) => void;
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

      // «Todo dato de historial guarda una copia»: al editar una entrada se reescala SU copia de
      // nutrientes, nunca se vuelve a la ficha del alimento (que puede haberse corregido después).
      // Si solo cambia la comida, los nutrientes no se tocan.
      updateEntry: (id, patch) =>
        set((s) => ({
          entries: s.entries.map((e) => {
            if (e.id !== id) return e;
            const grams = patch.grams ?? e.grams;
            if (grams === e.grams || e.grams <= 0) return { ...e, meal: patch.meal ?? e.meal, grams };
            return { ...e, meal: patch.meal ?? e.meal, grams, nutrients: rescaleNutrients(e.nutrients, grams / e.grams) };
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
        return copies.map((c) => c.id);
      },

      saveFood: (food) =>
        set((s) => ({
          foods: s.foods.some((f) => f.id === food.id)
            ? s.foods.map((f) => (f.id === food.id ? food : f))
            : [...s.foods, food],
        })),

      saveFoodVersion: (food) =>
        set((s) => {
          const swap = (ids: string[]) => (food.replaces ? [...new Set(ids.map((id) => (id === food.replaces ? food.id : id)))] : ids);
          return {
            foods: s.foods.some((f) => f.id === food.id) ? s.foods.map((f) => (f.id === food.id ? food : f)) : [...s.foods, food],
            favorites: swap(s.favorites),
            recents: swap(s.recents),
          };
        }),
      removeFood: (id) => {
        const found = get().foods.find((f) => f.id === id);
        if (found) set((s) => ({ foods: s.foods.filter((f) => f.id !== id), favorites: s.favorites.filter((x) => x !== id), recents: s.recents.filter((x) => x !== id) }));
        return found;
      },
      restoreFood: (food) => set((s) => ({ foods: s.foods.some((f) => f.id === food.id) ? s.foods : [...s.foods, food] })),

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
        if (found) {
          set((s) => {
            const weights = s.weights.filter((w) => w.date !== date);
            const wasLatest = normalizeWeights(s.weights).at(-1)?.date === date;
            const latest = normalizeWeights(weights).at(-1);
            // Borrar el último pesaje (p. ej. una errata, 87 en vez de 78) no debe dejar ese valor
            // en el perfil y en los objetivos: pasa a valer el pesaje anterior.
            return { weights, profile: wasLatest && latest ? { ...s.profile, weightKg: latest.kg } : s.profile };
          });
        }
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

      // Cambiar objetivo o actividad cambia la base del cálculo: una propuesta pendiente hecha con
      // la base anterior ya no vale.
      setProfile: (profile) =>
        set((s) => ({
          profile,
          tdee: s.profile.goal !== profile.goal || s.profile.activity !== profile.activity ? { ...s.tdee, pending: null } : s.tdee,
        })),
      setTargetsOverride: (targetsOverride) => set({ targetsOverride }),
      setSumExerciseKcal: (sumExerciseKcal) => set({ sumExerciseKcal }),
      setRemindMeals: (remindMeals) => {
        set({ remindMeals });
        setMealReminder(remindMeals).catch(() => {});
      },
      setFridgeContents: (items) => set({ fridge: { items, lastScannedAt: todayKey() } }),
      clearFridge: () => set({ fridge: { items: [], lastScannedAt: null } }),
      setTdeeEnabled: (enabled) => set((s) => ({ tdee: { ...s.tdee, enabled } })),
      checkTdee: (exerciseKcalPerDay = 0) => {
        const s = get();
        if (!s.tdee.enabled) return; // desactivado en Objetivo: ni propone ni cuenta revisiones
        if (s.targetsOverride !== null) return; // objetivo a mano: el motor queda en pausa, no compite
        const today = todayKey();
        if (s.tdee.lastCheckedAt) {
          const daysSince = Math.round((Date.parse(today) - Date.parse(s.tdee.lastCheckedAt)) / 86_400_000);
          if (daysSince < TDEE_CHECK_EVERY_DAYS) return; // no toca revisar todavía: no se toca `lastCheckedAt`
        }
        const input = { profile: s.profile, weights: s.weights, entries: s.entries, today, kcalAdjustment: s.tdee.kcalAdjustment, exerciseKcalPerDay: s.sumExerciseKcal ? exerciseKcalPerDay : 0 };
        // Sin datos suficientes no cuenta como revisión: se vuelve a mirar en cuanto los haya.
        if (!hasEnoughTdeeData(input)) return;
        const proposal = checkTdeeAdjustment(input);
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

/** Objetivos vigentes (ver `targetsFor` en `domain/tdee.ts`, la única cuenta). */
export function selectTargets(s: Pick<NutritionState, "profile" | "targetsOverride" | "tdee">): Targets {
  return targetsFor(s.profile, s.targetsOverride, s.tdee);
}

export function useTargets(): Targets {
  const profile = useNutrition((s) => s.profile);
  const override = useNutrition((s) => s.targetsOverride);
  const tdeeState = useNutrition((s) => s.tdee);
  return useMemo(() => targetsFor(profile, override, tdeeState), [profile, override, tdeeState]);
}

export { addDays, todayKey };
