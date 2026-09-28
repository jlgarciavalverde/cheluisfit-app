import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { FoodRow } from "@/components/nutrition/FoodRow";
import { Badge, Button, Card, Chip, ChipRow, EmptyState, IconButton, SearchField, Text } from "@/components/ui";
import { SearchStatus } from "@/components/SearchStatus";
import { SEARCH_DEBOUNCE_MS, SEARCH_MIN_CHARS } from "@/domain/search";
import { toast } from "@/components/ui/Toast";
import { searchFoods } from "@/data/foodApi";
import { SEED_FOODS } from "@/data/seed";
import { useNutrition } from "@/data/store";
import { fmtInt } from "@/domain/format";
import { MEAL_LABEL, type Food, type MealSlot } from "@/domain/types";
import { todayKey } from "@/domain/dates";
import { space } from "@/theme/tokens";

type Tab = "recents" | "favorites" | "meals" | "mine";

export default function AddFoodScreen() {
  const params = useLocalSearchParams<{ meal?: MealSlot; date?: string }>();
  const meal: MealSlot = params.meal ?? "lunch";
  const date = params.date ?? todayKey();

  const foods = useNutrition((s) => s.foods);
  const favorites = useNutrition((s) => s.favorites);
  const recents = useNutrition((s) => s.recents);
  const addEntry = useNutrition((s) => s.addEntry);
  const saveFood = useNutrition((s) => s.saveFood);
  const removeEntry = useNutrition((s) => s.removeEntry);
  const removeEntries = useNutrition((s) => s.removeEntries);
  const savedMeals = useNutrition((s) => s.savedMeals);
  const addSavedMeal = useNutrition((s) => s.addSavedMeal);
  const deleteSavedMeal = useNutrition((s) => s.deleteSavedMeal);
  const restoreSavedMeal = useNutrition((s) => s.restoreSavedMeal);

  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("recents");
  const [results, setResults] = useState<Food[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);

  // `foods` por referencia: la búsqueda solo se relanza al cambiar el texto (antes, cada «+» o
  // cada alimento abierto cambiaba `foods` y volvía a buscar en USDA, con parpadeo incluido).
  const foodsRef = useRef(foods);
  useEffect(() => {
    foodsRef.current = foods;
  }, [foods]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < SEARCH_MIN_CHARS) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(() => {
      searchFoods(q, foodsRef.current)
        .then((r) => {
          if (cancelled) return;
          setResults(r.foods);
          setOffline(!!r.liveError);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  const byId = useMemo(() => new Map([...SEED_FOODS, ...foods].map((f) => [f.id, f])), [foods]);
  const browse = useMemo(() => {
    const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((f): f is Food => !!f);
    if (tab === "recents") return pick(recents);
    if (tab === "favorites") return pick(favorites);
    // Los alimentos que crea el asistente de IA al registrar una comida (`ai-…`) no son «tuyos».
    return foods.filter((f) => f.source === "user" && !f.id.startsWith("ai-"));
  }, [tab, recents, favorites, foods, byId]);

  const open = (f: Food) => {
    // Un resultado en vivo (USDA) no está en `foods` todavía — esa pantalla busca por id en el
    // estado local, así que hay que guardarlo antes de navegar (mismo caso que el escáner).
    if (!foods.some((x) => x.id === f.id)) saveFood(f);
    router.push({ pathname: "/alimento/[id]", params: { id: f.id, meal, date, from: "anadir" } });
  };
  const quickAdd = (f: Food) => {
    // Una ficha sin datos (muchas de Open Food Facts vienen vacías) no se añade a ciegas con 0 kcal:
    // se abre para ver el aviso y corregirla.
    const p = f.per100;
    if (p.kcal === 0 && p.protein === 0 && p.carbs === 0 && p.fat === 0) {
      open(f);
      return;
    }
    const grams = f.servings[0]?.grams ?? 100;
    const id = addEntry(f, grams, meal, date);
    toast(`${f.name} añadido a ${MEAL_LABEL[meal].toLowerCase()}`, {
      actionLabel: "Deshacer",
      onAction: () => removeEntry(id),
    });
  };

  const searchRow = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <View style={{ flex: 1 }}>
        <SearchField testID="food-search" value={query} onChangeText={setQuery} placeholder="Buscar alimento o marca" autoFocus />
      </View>
      <IconButton
        testID="open-scanner"
        icon="barcode-outline"
        label="Escanear código de barras"
        color="onBrand"
        size="lg"
        onPress={() => router.push({ pathname: "/escaner", params: { meal, date } })}
        filled="brand"
      />
      <IconButton
        testID="open-photo-scan"
        icon="camera-outline"
        label="Identificar con foto"
        color="onBrand"
        size="lg"
        onPress={() => router.push({ pathname: "/escaner-foto", params: { meal, date } })}
        filled="brand"
      />
    </View>
  );

  const searching = query.trim().length >= SEARCH_MIN_CHARS;
  const createParams = { meal, date, name: query.trim() };

  // Un único árbol de pantalla: el buscador está siempre en el mismo sitio y nunca se vuelve a
  // montar (antes había dos pantallas distintas, «con» y «sin» resultados, y al pasar de una a
  // otra el campo se recreaba: el teclado parpadeaba y todo saltaba). Debajo, o los resultados
  // (virtualizados con `FlatList`: Open Food Facts/USDA no tienen techo) o las pestañas.
  return (
    <Screen
      testID="screen-anadir"
      scroll={false}
      footer={<Button label="Listo" variant="secondary" fullWidth onPress={() => router.back()} testID="add-done" />}
    >
      <ScreenHeader title={`Añadir a ${MEAL_LABEL[meal].toLowerCase()}`} back />
      <View style={{ gap: space.sm, paddingBottom: space.sm }}>
        {searchRow}
        <SearchStatus query={query} loading={loading} count={results?.length ?? null} noun={["resultado", "resultados"]} />
        {offline && searching && !loading ? (
          <Text variant="caption" color="warning" numberOfLines={1} testID="search-offline">
            Sin conexión: solo alimentos guardados en el móvil
          </Text>
        ) : null}
      </View>
      {searching ? (
        <FlatList
          style={{ flex: 1 }}
          data={results ?? []}
          keyExtractor={(f) => f.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxl }}
          renderItem={({ item, index }) => (
            <FoodRow divider={index > 0} food={item} onOpen={() => open(item)} onQuickAdd={() => quickAdd(item)} />
          )}
          ListEmptyComponent={
            loading || results === null ? null : (
              <EmptyState
                icon="search-outline"
                title="No lo encuentro"
                text="Prueba con otra palabra, escanea el código de barras o créalo tú."
                actionLabel="Crear alimento"
                onAction={() => router.push({ pathname: "/crear-alimento", params: createParams })}
              />
            )
          }
          ListFooterComponent={
            results && results.length > 0 ? (
              <View style={{ paddingTop: space.lg }}>
                <Button label="¿No está? Crear alimento" icon="add" variant="ghost" onPress={() => router.push({ pathname: "/crear-alimento", params: createParams })} />
              </View>
            ) : null
          }
        />
      ) : (
        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: space.md, paddingBottom: space.xxl }}>
          <ChipRow>
            <Chip label="Recientes" icon="time-outline" selected={tab === "recents"} onPress={() => setTab("recents")} />
            <Chip label="Favoritos" icon="heart-outline" selected={tab === "favorites"} onPress={() => setTab("favorites")} />
            <Chip testID="tab-meals" label="Mis comidas" icon="bookmark-outline" selected={tab === "meals"} onPress={() => setTab("meals")} />
            <Chip label="Mis alimentos" icon="person-outline" selected={tab === "mine"} onPress={() => setTab("mine")} />
          </ChipRow>

          {tab === "meals" ? (
            savedMeals.length === 0 ? (
              <EmptyState
                icon="bookmark-outline"
                title="Aún no tienes comidas guardadas"
                text="En Nutrición, usa «Guardar como mi comida» en una comida que repitas a menudo."
              />
            ) : (
              <View style={{ gap: space.md }}>
                {savedMeals.map((m) => {
                  const kcal = m.items.reduce((x, i) => x + i.nutrients.kcal, 0);
                  return (
                    <Card key={m.id} padded={false} testID={`saved-${m.id}`}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Añadir ${m.name}: ${m.items.length} alimentos, ${fmtInt(kcal)} kilocalorías`}
                          onPress={() => {
                            const ids = addSavedMeal(m.id, meal, date);
                            toast(`«${m.name}» añadida a ${MEAL_LABEL[meal].toLowerCase()}`, {
                              actionLabel: "Deshacer",
                              onAction: () => removeEntries(ids),
                            });
                          }}
                          style={({ pressed }) => ({ flex: 1, padding: space.lg, gap: 4, opacity: pressed ? 0.8 : 1 })}
                        >
                          <Text variant="bodyStrong">{m.name}</Text>
                          <Text variant="caption" color="muted" numberOfLines={2}>
                            {m.items.map((i) => i.name).join(" · ")}
                          </Text>
                          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                            <Badge label={`${m.items.length} ${m.items.length === 1 ? "alimento" : "alimentos"}`} />
                            <Text variant="caption" color="muted" tabular>
                              {fmtInt(kcal)} kcal
                            </Text>
                          </View>
                        </Pressable>
                        <IconButton
                          icon="add-circle"
                          label={`Añadir ${m.name}`}
                          color="brandText"
                          size="xl"
                          onPress={() => {
                            const ids = addSavedMeal(m.id, meal, date);
                            toast(`«${m.name}» añadida a ${MEAL_LABEL[meal].toLowerCase()}`, {
                              actionLabel: "Deshacer",
                              onAction: () => removeEntries(ids),
                            });
                          }}
                        />
                        <IconButton
                          icon="trash-outline"
                          label={`Borrar ${m.name}`}
                          color="muted"
                          size="md"
                          onPress={() => {
                            const removed = deleteSavedMeal(m.id);
                            if (removed) toast(`«${m.name}» borrada`, { actionLabel: "Deshacer", onAction: () => restoreSavedMeal(removed) });
                          }}
                        />
                      </View>
                    </Card>
                  );
                })}
              </View>
            )
          ) : browse.length === 0 ? (
            <EmptyState
              icon={tab === "favorites" ? "heart-outline" : tab === "mine" ? "person-outline" : "time-outline"}
              title={tab === "favorites" ? "Sin favoritos" : tab === "mine" ? "Aún no has creado alimentos" : "Sin recientes"}
              text="Busca un alimento arriba o escanea su código de barras."
            />
          ) : (
            <View>
              {browse.map((f, i) => (
                <FoodRow key={f.id} divider={i > 0} food={f} onOpen={() => open(f)} onQuickAdd={() => quickAdd(f)} />
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}
