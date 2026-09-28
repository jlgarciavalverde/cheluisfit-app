import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { FoodRow } from "@/components/nutrition/FoodRow";
import { Badge, Button, Card, Chip, EmptyState, IconButton, SearchField, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { searchFoods } from "@/data/foodApi";
import { SEED_FOODS } from "@/data/seed";
import { useNutrition } from "@/data/store";
import { fmtInt } from "@/domain/format";
import { MEAL_LABEL, type Food, type MealSlot } from "@/domain/types";
import { todayKey } from "@/domain/dates";
import { useTheme } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

type Tab = "recents" | "favorites" | "meals" | "mine";

export default function AddFoodScreen() {
  const { c } = useTheme();
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

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const t = setTimeout(() => {
      searchFoods(q, foods).then((r) => {
        if (cancelled) return;
        setResults(r.foods);
        setLoading(false);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, foods]);

  const byId = useMemo(() => new Map([...SEED_FOODS, ...foods].map((f) => [f.id, f])), [foods]);
  const browse = useMemo(() => {
    const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((f): f is Food => !!f);
    if (tab === "recents") return pick(recents);
    if (tab === "favorites") return pick(favorites);
    return foods.filter((f) => f.source === "user");
  }, [tab, recents, favorites, foods, byId]);

  const list = tab === "meals" && results === null ? [] : (results ?? browse);
  const open = (f: Food) => {
    // Un resultado en vivo (USDA) no está en `foods` todavía — esa pantalla busca por id en el
    // estado local, así que hay que guardarlo antes de navegar (mismo caso que el escáner).
    if (!foods.some((x) => x.id === f.id)) saveFood(f);
    router.push({ pathname: "/alimento/[id]", params: { id: f.id, meal, date, from: "anadir" } });
  };
  const quickAdd = (f: Food) => {
    const grams = f.servings[0]?.grams ?? 100;
    const id = addEntry(f, grams, meal, date);
    toast(`${f.name} añadido a ${MEAL_LABEL[meal].toLowerCase()}`, {
      actionLabel: "Deshacer",
      onAction: () => removeEntry(id),
    });
  };

  const searchRow = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <SearchField
        testID="food-search"
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar alimento o marca"
        autoFocus
      />
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

  // Los resultados de búsqueda pueden venir de Open Food Facts (sin techo de tamaño): se
  // virtualizan con `FlatList`. El resto (recientes/favoritos/mis comidas/mis alimentos) ya
  // está acotado y se queda en el `ScrollView` normal de `Screen`.
  if (results !== null) {
    return (
      <Screen testID="screen-anadir" scroll={false} footer={
        <Button label="Listo" variant="secondary" fullWidth onPress={() => router.back()} testID="add-done" />
      }>
        <ScreenHeader title={`Añadir a ${MEAL_LABEL[meal].toLowerCase()}`} back />
        <FlatList
          style={{ flex: 1 }}
          data={list}
          keyExtractor={(f) => f.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: space.xxl }}
          ListHeaderComponent={
            <View style={{ gap: space.md, paddingBottom: space.md }}>
              {searchRow}
              <Text variant="caption" color="muted" accessibilityLiveRegion="polite">
                {loading ? "Buscando…" : `${list.length} ${list.length === 1 ? "resultado" : "resultados"}`}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <FoodRow divider={index > 0} food={item} onOpen={() => open(item)} onQuickAdd={() => quickAdd(item)} />
          )}
          ListEmptyComponent={
            <EmptyState
              icon="search-outline"
              title="No lo encuentro"
              text="Prueba con otra palabra, escanea el código de barras o créalo tú."
              actionLabel="Crear alimento"
              onAction={() => router.push({ pathname: "/crear-alimento", params: { meal, date, name: query.trim() } })}
            />
          }
          ListFooterComponent={
            list.length > 0 ? (
              <View style={{ paddingTop: space.lg }}>
                <Button
                  label="¿No está? Crear alimento"
                  icon="add"
                  variant="ghost"
                  onPress={() => router.push({ pathname: "/crear-alimento", params: { meal, date, name: query.trim() } })}
                />
              </View>
            ) : null
          }
        />
      </Screen>
    );
  }

  return (
    <Screen testID="screen-anadir" footer={
      <Button label="Listo" variant="secondary" fullWidth onPress={() => router.back()} testID="add-done" />
    }>
      <ScreenHeader title={`Añadir a ${MEAL_LABEL[meal].toLowerCase()}`} back />
      <View style={{ gap: space.md }}>
        {searchRow}

        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          <Chip label="Recientes" icon="time-outline" selected={tab === "recents"} onPress={() => setTab("recents")} />
          <Chip label="Favoritos" icon="heart-outline" selected={tab === "favorites"} onPress={() => setTab("favorites")} />
          <Chip testID="tab-meals" label="Mis comidas" icon="bookmark-outline" selected={tab === "meals"} onPress={() => setTab("meals")} />
          <Chip label="Mis alimentos" icon="person-outline" selected={tab === "mine"} onPress={() => setTab("mine")} />
        </View>

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
        ) : loading ? (
          <ActivityIndicator color={c.brand} style={{ marginTop: space.xl }} />
        ) : list.length === 0 ? (
          <EmptyState
            icon={tab === "favorites" ? "heart-outline" : tab === "mine" ? "person-outline" : "time-outline"}
            title={tab === "favorites" ? "Sin favoritos" : tab === "mine" ? "Aún no has creado alimentos" : "Sin recientes"}
            text="Busca un alimento arriba o escanea su código de barras."
          />
        ) : (
          <View>
            {list.map((f, i) => (
              <FoodRow key={f.id} divider={i > 0} food={f} onOpen={() => open(f)} onQuickAdd={() => quickAdd(f)} />
            ))}
          </View>
        )}
      </View>
    </Screen>
  );
}
