import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Callout, Button, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { SEED_FOODS } from "@/data/seed";
import { useNutrition } from "@/data/store";
import { parseNum } from "@/domain/format";
import { isValidGtin, normalizeGtin13 } from "@/domain/gtin";
import { nutrientIssues } from "@/domain/nutrition";
import type { Food, Nutrients } from "@/domain/types";
import { space } from "@/theme/tokens";

const FIELDS: { key: keyof Nutrients; label: string; suffix: string; required?: boolean }[] = [
  { key: "kcal", label: "Energía", suffix: "kcal", required: true },
  { key: "protein", label: "Proteínas", suffix: "g", required: true },
  { key: "carbs", label: "Hidratos de carbono", suffix: "g", required: true },
  { key: "fat", label: "Grasas", suffix: "g", required: true },
  { key: "fiber", label: "Fibra", suffix: "g" },
  { key: "sugars", label: "Azúcares", suffix: "g" },
  { key: "satFat", label: "Grasas saturadas", suffix: "g" },
  { key: "salt", label: "Sal", suffix: "g" },
];

const txt = (n: number | undefined) => (n === undefined || n === 0 ? "" : String(n).replace(".", ","));

export default function CreateFoodScreen() {
  const params = useLocalSearchParams<
    { edit?: string; barcode?: string; name?: string; meal?: string; date?: string; brand?: string; aiProposed?: string } & Partial<Record<keyof Nutrients, string>>
  >();
  const foods = useNutrition((s) => s.foods);
  const saveFood = useNutrition((s) => s.saveFood);
  const base = useMemo(
    () => (params.edit ? [...foods, ...SEED_FOODS].find((f) => f.id === params.edit) : undefined),
    [foods, params.edit],
  );
  const aiProposed = params.aiProposed === "1";

  const [name, setName] = useState(base?.name ?? params.name ?? "");
  const [brand, setBrand] = useState(base?.brand ?? params.brand ?? "");
  const [barcode, setBarcode] = useState(base?.barcode ?? params.barcode ?? "");
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map((f) => [f.key, txt(base?.per100[f.key]) || (params[f.key] ?? "")])),
  );
  const [serving, setServing] = useState(base?.servings[0] ? String(base.servings[0].grams) : "");
  const [tried, setTried] = useState(false);

  const nums = Object.fromEntries(FIELDS.map((f) => [f.key, parseNum(vals[f.key] ?? "")])) as Record<
    keyof Nutrients,
    number | null
  >;
  const per100: Nutrients = {
    kcal: nums.kcal ?? 0,
    protein: nums.protein ?? 0,
    carbs: nums.carbs ?? 0,
    fat: nums.fat ?? 0,
    fiber: nums.fiber ?? 0,
    sugars: nums.sugars ?? 0,
    satFat: nums.satFat ?? 0,
    salt: nums.salt ?? 0,
  };
  const issues = nutrientIssues(per100).filter((i) => i !== "Faltan los valores nutricionales");
  const missing = FIELDS.filter((f) => f.required && nums[f.key] === null).map((f) => f.label);
  const barcodeBad = barcode.trim() !== "" && !isValidGtin(barcode.trim());
  const nameBad = name.trim() === "";
  const blocked = nameBad || missing.length > 0 || barcodeBad || FIELDS.some((f) => (nums[f.key] ?? 0) < 0);

  const save = () => {
    setTried(true);
    if (blocked) return;
    const sg = parseNum(serving);
    const food: Food = {
      id: `user-${Date.now().toString(36)}`,
      name: name.trim(),
      brand: brand.trim() || undefined,
      barcode: barcode.trim() ? (normalizeGtin13(barcode.trim()) ?? barcode.trim()) : undefined,
      source: "user",
      per100,
      servings: sg && sg > 0 ? [{ label: `1 ración (${sg} g)`, grams: sg }] : [],
    };
    saveFood(food);
    toast(base ? "Guardado como tu versión" : "Alimento creado");
    router.replace({ pathname: "/alimento/[id]", params: { id: food.id, meal: params.meal, date: params.date } });
  };

  return (
    <Screen variant="form"
      testID="screen-crear"
      footer={<Button testID="save-food" label={base ? "Guardar corrección" : "Crear alimento"} size="lg" fullWidth onPress={save} />}
    >
      <ScreenHeader title={base ? "Corregir datos" : "Nuevo alimento"} back />
      <View style={{ gap: space.lg }}>
        {base ? (
          <Callout icon="information-circle-outline">
            <Text variant="body" color="muted">
              Se guardará como <Text variant="bodyStrong">tu versión</Text> de este alimento y tendrá prioridad en tus búsquedas. El original no cambia.
            </Text>
          </Callout>
        ) : null}
        {aiProposed ? (
          <Callout tone="brand" icon="sparkles-outline" testID="ai-proposed-warning">
            <Text variant="body" color="muted">
              Datos leídos con IA — revisa los valores antes de guardar, puede haberse equivocado.
            </Text>
          </Callout>
        ) : null}
        <View style={{ gap: space.md }}>
          <TextField testID="f-name" label="Nombre" value={name} onChangeText={setName} placeholder="Yogur griego natural" error={tried && nameBad ? "Ponle un nombre" : undefined} />
          <TextField label="Marca (opcional)" value={brand} onChangeText={setBrand} />
          <TextField
            testID="f-barcode"
            label="Código de barras (opcional)"
            value={barcode}
            onChangeText={setBarcode}
            keyboardType="number-pad"
            error={barcodeBad ? "El dígito de control no cuadra" : undefined}
          />
        </View>

        <View style={{ gap: space.sm }}>
          <Text variant="heading">Valores por 100 g</Text>
          <Text variant="caption" color="muted">
            Cópialos de la etiqueta («por 100 g»). Puedes usar coma o punto.
          </Text>
        </View>
        <View style={{ gap: space.md }}>
          {FIELDS.map((f) => (
            <View key={f.key} style={{ flexDirection: "row" }}>
              <TextField
                testID={`f-${f.key}`}
                label={f.required ? f.label : `${f.label} (opcional)`}
                suffix={f.suffix}
                keyboardType="decimal-pad"
                value={vals[f.key]}
                onChangeText={(t) => setVals((v) => ({ ...v, [f.key]: t }))}
                error={tried && f.required && nums[f.key] === null ? "Obligatorio" : undefined}
              />
            </View>
          ))}
        </View>

        {issues.length > 0 ? (
          <Callout tone="warning" icon="warning" title="Revisa los valores" testID="create-warning">
            {issues.map((i) => (
              <Text key={i} variant="body" color="muted">
                • {i}
              </Text>
            ))}
            <Text variant="caption" color="faint">
              Puedes guardarlo igualmente si la etiqueta dice eso.
            </Text>
          </Callout>
        ) : null}

        <TextField label="Ración habitual (opcional)" suffix="g" keyboardType="decimal-pad" value={serving} onChangeText={setServing} hint="Por ejemplo, 125 para un yogur" />
      </View>
    </Screen>
  );
}
