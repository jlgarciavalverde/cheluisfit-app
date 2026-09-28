import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { FoodBadge } from "@/components/nutrition/FoodRow";
import { MEAL_ICON } from "@/components/nutrition/MealCard";
import { Callout, Button, Card, Chip, EmptyState, FieldGroup, Icon, IconButton, Stat, StatGrid, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { SEED_FOODS } from "@/data/seed";
import { useNutrition } from "@/data/store";
import { todayKey } from "@/domain/dates";
import { fmtInt, fmtNum, parseNum } from "@/domain/format";
import { nutrientIssues, rescaleNutrients, scaleNutrients } from "@/domain/nutrition";
import { MEAL_LABEL, MEAL_SLOTS, type MealSlot } from "@/domain/types";
import { space } from "@/theme/tokens";

const PRESETS = [50, 100, 150, 200];
const STEP = 10;

export default function FoodDetailScreen() {
  // `from=anadir`: se llegó desde el buscador; al añadir se vuelve a él para seguir añadiendo
  // (una comida suele llevar varios alimentos), y «Listo» del buscador cierra.
  const params = useLocalSearchParams<{ id: string; entry?: string; meal?: MealSlot; date?: string; from?: string }>();
  const foods = useNutrition((s) => s.foods);
  const entries = useNutrition((s) => s.entries);
  const favorites = useNutrition((s) => s.favorites);
  const addEntry = useNutrition((s) => s.addEntry);
  const updateEntry = useNutrition((s) => s.updateEntry);
  const removeEntry = useNutrition((s) => s.removeEntry);
  const restoreEntry = useNutrition((s) => s.restoreEntry);
  const toggleFavorite = useNutrition((s) => s.toggleFavorite);

  const food = useMemo(() => [...foods, ...SEED_FOODS].find((f) => f.id === params.id), [foods, params.id]);
  const entry = params.entry ? entries.find((e) => e.id === params.entry) : undefined;
  const editing = !!entry;

  const [meal, setMeal] = useState<MealSlot>(entry?.meal ?? params.meal ?? "lunch");
  const [text, setText] = useState(() => fmtNum(entry?.grams ?? food?.servings[0]?.grams ?? 100));
  const [showAll, setShowAll] = useState(false);
  const date = entry?.date ?? params.date ?? todayKey();

  if (!food) {
    return (
      <Screen variant="form">
        <ScreenHeader title="Alimento" back />
        <EmptyState icon="alert-circle-outline" title="No encuentro este alimento" />
      </Screen>
    );
  }

  const grams = parseNum(text);
  const valid = grams !== null && grams > 0 && grams <= 5000;
  // Al editar, la vista previa sale de la copia guardada en la entrada (lo que de verdad se
  // guardará), no de la ficha actual del alimento, que puede haber cambiado desde entonces.
  const n =
    editing && entry && entry.grams > 0 ? rescaleNutrients(entry.nutrients, (valid ? grams : 0) / entry.grams) : scaleNutrients(food.per100, valid ? grams : 0);
  const issues = food.source === "user" ? [] : nutrientIssues(food.per100, food.alcoholPer100);
  const isFav = favorites.includes(food.id);

  const submit = () => {
    if (!valid) return;
    if (editing && entry) {
      updateEntry(entry.id, { grams, meal });
      toast("Cambios guardados");
    } else {
      const id = addEntry(food, grams, meal, date);
      toast(`Añadido a ${MEAL_LABEL[meal].toLowerCase()}`, { actionLabel: "Deshacer", onAction: () => removeEntry(id) });
      if (params.from === "anadir" && router.canGoBack()) {
        router.back();
        return;
      }
    }
    router.dismissTo("/nutricion");
  };

  return (
    <Screen variant="form"
      testID="screen-alimento"
      footer={
        <View style={{ gap: space.sm }}>
          <Button
            testID="submit-food"
            label={editing ? "Guardar cambios" : `Añadir a ${MEAL_LABEL[meal].toLowerCase()}`}
            icon={editing ? "checkmark" : "add"}
            size="lg"
            fullWidth
            disabled={!valid}
            onPress={submit}
          />
          {editing && entry ? (
            <Button
              label="Eliminar de este día"
              icon="trash-outline"
              variant="danger"
              fullWidth
              onPress={() => {
                const removed = removeEntry(entry.id);
                router.dismissTo("/nutricion");
                if (removed) toast("Alimento eliminado", { actionLabel: "Deshacer", onAction: () => restoreEntry(removed) });
              }}
            />
          ) : null}
        </View>
      }
    >
      <ScreenHeader
        title={editing ? "Editar cantidad" : "Añadir alimento"}
        back
        right={
          <IconButton
            icon={isFav ? "heart" : "heart-outline"}
            label={isFav ? "Quitar de favoritos" : "Añadir a favoritos"}
            color={isFav ? "brandText" : "muted"}
            onPress={() => toggleFavorite(food.id)}
            filled
          />
        }
      />
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <Text variant="title" testID="food-name">
            {food.name}
          </Text>
          {food.brand || food.packageInfo ? (
            <Text variant="body" color="muted">
              {[food.brand, food.packageInfo].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center", flexWrap: "wrap" }}>
            <FoodBadge food={food} />
            {food.barcode ? (
              <Text variant="caption" color="faint" tabular>
                {food.barcode}
              </Text>
            ) : null}
          </View>
        </View>

        {issues.length > 0 ? (
          <Callout
            tone="warning"
            icon="warning"
            title="Comprueba la etiqueta"
            testID="food-warning"
            action={
              <Button
                label="Corregir datos"
                icon="create-outline"
                variant="secondary"
                size="sm"
                onPress={() => router.push({ pathname: "/crear-alimento", params: { edit: food.id, meal, date } })}
              />
            }
          >
            {issues.map((i) => (
              <Text key={i} variant="body" color="muted">
                • {i}
              </Text>
            ))}
          </Callout>
        ) : null}

        <Card>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm }}>
            <View style={{ paddingBottom: text !== "" && !valid ? 22 : 2 }}>
              <IconButton
                testID="grams-minus"
                icon="remove"
                label="Menos cantidad"
                filled
                onPress={() => setText(fmtNum(Math.max(5, (grams ?? 100) - STEP)))}
              />
            </View>
            <TextField
              testID="grams-input"
              label="Cantidad"
              suffix="g"
              keyboardType="decimal-pad"
              value={text}
              onChangeText={setText}
              selectTextOnFocus
              error={text !== "" && !valid ? "Introduce una cantidad entre 1 y 5.000 g" : undefined}
            />
            <View style={{ paddingBottom: text !== "" && !valid ? 22 : 2 }}>
              <IconButton
                testID="grams-plus"
                icon="add"
                label="Más cantidad"
                filled
                onPress={() => setText(fmtNum(Math.min(5000, (grams ?? 0) + STEP)))}
              />
            </View>
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.md }}>
            {food.servings.map((s) => (
              <Chip
                key={s.label}
                label={s.label}
                selected={grams === s.grams}
                onPress={() => setText(fmtNum(s.grams))}
              />
            ))}
            {PRESETS.filter((p) => !food.servings.some((s) => s.grams === p)).map((p) => (
              <Chip key={p} label={`${p} g`} selected={grams === p} onPress={() => setText(String(p))} />
            ))}
            {valid ? (
              <>
                <Chip testID="grams-half" label="½" onPress={() => setText(fmtNum(Math.max(1, Math.round((grams / 2) * 10) / 10)))} />
                <Chip testID="grams-double" label="×2" onPress={() => setText(fmtNum(Math.min(5000, grams * 2)))} />
              </>
            ) : null}
          </View>

          <View style={{ alignItems: "center", paddingVertical: space.xl, gap: 2 }}>
            <Text variant="displayL" tabular testID="food-kcal">
              {fmtInt(n.kcal)}
            </Text>
            <Text variant="caption" color="muted">
              kcal
            </Text>
          </View>
          <StatGrid>
            <Stat label="Proteína" value={fmtNum(n.protein)} unit="g" labelColor="protein" align="center" />
            <Stat label="Hidratos" value={fmtNum(n.carbs)} unit="g" labelColor="carbs" align="center" />
            <Stat label="Grasas" value={fmtNum(n.fat)} unit="g" labelColor="fat" align="center" />
          </StatGrid>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showAll }}
            onPress={() => setShowAll((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 48, marginTop: space.sm }}
          >
            <Icon name={showAll ? "chevron-down" : "chevron-forward"} size="sm" color="muted" />
            <Text variant="bodyStrong" color="muted">
              Nutrientes completos
            </Text>
          </Pressable>
          {showAll ? (
            <View style={{ gap: space.sm }}>
              {(
                [
                  ["Fibra", n.fiber, "g"],
                  ["Azúcares", n.sugars, "g"],
                  ["Grasas saturadas", n.satFat, "g"],
                  ["Sal", n.salt, "g"],
                ] as const
              ).map(([label, v, u]) => (
                <View key={label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text variant="body" color="muted">
                    {label}
                  </Text>
                  <Text variant="bodyStrong" tabular>
                    {fmtNum(v)} {u}
                  </Text>
                </View>
              ))}
              <Text variant="caption" color="faint">
                Valores por 100 g: {fmtInt(food.per100.kcal)} kcal · P {fmtNum(food.per100.protein)} · H{" "}
                {fmtNum(food.per100.carbs)} · G {fmtNum(food.per100.fat)}
              </Text>
            </View>
          ) : null}
        </Card>

        <FieldGroup label="Comida">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {MEAL_SLOTS.map((m) => (
              <Chip
                key={m}
                testID={`meal-chip-${m}`}
                label={MEAL_LABEL[m]}
                icon={MEAL_ICON[m]}
                selected={meal === m}
                onPress={() => setMeal(m)}
              />
            ))}
          </View>
        </FieldGroup>
      </View>
    </Screen>
  );
}
