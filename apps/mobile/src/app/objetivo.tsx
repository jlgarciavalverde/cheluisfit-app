import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Badge, Button, Card, CheckRow, CollapsibleSection, Icon, Overline, RadioCard, RadioGroup, Section, SegmentedControl, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useNutrition } from "@/data/store";
import { fmtInt, parseNum } from "@/domain/format";
import { ACTIVITY_LEVELS, calcTargets, tdee } from "@/domain/nutrition";
import { effectiveAdjust } from "@/domain/tdee";
import { MEAL_LABEL, MEAL_SLOTS, type ActivityLevel, type GoalType, type Profile, type Sex, type Targets } from "@/domain/types";
import { space } from "@/theme/tokens";

const GOALS: { value: GoalType; label: string; hint: string; icon: "trending-down" | "remove" | "trending-up" }[] = [
  { value: "lose", label: "Bajar peso", hint: "Déficit moderado (−15 %)", icon: "trending-down" },
  { value: "maintain", label: "Mantener", hint: "Comer lo que gastas", icon: "remove" },
  { value: "gain", label: "Ganar masa", hint: "Superávit ligero (+10 %)", icon: "trending-up" },
];

export default function GoalScreen() {
  const profile = useNutrition((s) => s.profile);
  const override = useNutrition((s) => s.targetsOverride);
  const setProfile = useNutrition((s) => s.setProfile);
  const setOverride = useNutrition((s) => s.setTargetsOverride);
  const sumExercise = useNutrition((s) => s.sumExerciseKcal);
  const setSumExercise = useNutrition((s) => s.setSumExerciseKcal);
  const tdeeState = useNutrition((s) => s.tdee);
  const setTdeeEnabled = useNutrition((s) => s.setTdeeEnabled);

  const [sex, setSex] = useState<Sex>(profile.sex);
  const [age, setAge] = useState(String(profile.age));
  const [height, setHeight] = useState(String(profile.heightCm));
  const [weight, setWeight] = useState(String(profile.weightKg).replace(".", ","));
  // «Registrar peso» (botón de abajo) cambia `profile.weightKg` desde otra pantalla: si el campo
  // se quedara con el peso de cuando se abrió esta, «Guardar» pisaría el recién registrado.
  useEffect(() => {
    setWeight(String(profile.weightKg).replace(".", ","));
  }, [profile.weightKg]);
  const [activity, setActivity] = useState<ActivityLevel>(profile.activity);
  const [goal, setGoal] = useState<GoalType>(profile.goal);
  const [maxHr, setMaxHr] = useState(profile.maxHr ? String(profile.maxHr) : "");
  const [manual, setManual] = useState(override !== null);
  const [m, setM] = useState<Record<string, string>>(() => {
    const t = override;
    return {
      kcal: t ? String(t.kcal) : "",
      protein: t ? String(t.protein) : "",
      carbs: t ? String(t.carbs) : "",
      fat: t ? String(t.fat) : "",
      fiber: t ? String(t.fiber) : "",
      ...Object.fromEntries(MEAL_SLOTS.map((s) => [s, String(t ? t.mealSplit[s] : calcTargets(profile).mealSplit[s])])),
    };
  });

  const a = parseNum(age);
  const h = parseNum(height);
  const w = parseNum(weight);
  const profileOk = a !== null && a >= 14 && a <= 90 && h !== null && h >= 120 && h <= 230 && w !== null && w >= 30 && w <= 250;

  const hr = parseNum(maxHr);
  const hrBad = maxHr.trim() !== "" && (hr === null || hr < 120 || hr > 230);
  const draft: Profile | null =
    profileOk && !hrBad
      ? {
          name: profile.name,
          sex,
          age: a,
          heightCm: h,
          weightKg: w,
          activity,
          goal,
          maxHr: hr !== null ? Math.round(hr) : undefined,
        }
      : null;
  const suggested = useMemo(
    () => (draft ? calcTargets(draft, tdeeState.enabled ? effectiveAdjust(draft, tdeeState.kcalAdjustment) : undefined) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft?.sex, draft?.age, draft?.heightCm, draft?.weightKg, draft?.activity, draft?.goal, tdeeState.enabled, tdeeState.kcalAdjustment],
  );
  const maintenance = draft ? Math.round(tdee(draft) / 10) * 10 : 0;

  const splitVals = MEAL_SLOTS.map((s) => parseNum(m[s] ?? "") ?? 0);
  const splitSum = splitVals.reduce((x, y) => x + y, 0);
  const manualNums = ["kcal", "protein", "carbs", "fat", "fiber"].map((k) => parseNum(m[k] ?? ""));
  const manualOk = manualNums.every((n) => n !== null && n >= 0) && splitSum === 100 && (manualNums[0] ?? 0) >= 800;

  const shown: Targets | null = manual && manualOk && suggested
    ? {
        ...suggested,
        kcal: manualNums[0] as number,
        protein: manualNums[1] as number,
        carbs: manualNums[2] as number,
        fat: manualNums[3] as number,
        fiber: manualNums[4] as number,
        mealSplit: Object.fromEntries(MEAL_SLOTS.map((s, i) => [s, splitVals[i]])) as Targets["mealSplit"],
      }
    : suggested;

  const save = () => {
    if (!draft || !shown) return;
    setProfile(draft);
    setOverride(manual ? shown : null);
    toast("Objetivo guardado");
    router.back();
  };

  const canSave = !!draft && (!manual || manualOk);

  return (
    <Screen variant="form"
      testID="screen-objetivo"
      footer={<Button testID="save-goal" label="Guardar objetivo" size="lg" fullWidth disabled={!canSave} onPress={save} />}
    >
      <ScreenHeader title="Tu objetivo" back />
      <View style={{ gap: space.xl }}>
        <Card>
          <Overline color="brandText">Resultado</Overline>
          {shown ? (
            <View style={{ gap: space.md, marginTop: space.sm }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
                <Text variant="numeralXL" testID="goal-kcal" tabular>
                  {fmtInt(shown.kcal)}
                </Text>
                <Text variant="body" color="muted">
                  kcal al día
                </Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                <Badge label={`Proteína ${shown.protein} g`} tone="neutral" />
                <Badge label={`Hidratos ${shown.carbs} g`} tone="neutral" />
                <Badge label={`Grasas ${shown.fat} g`} tone="neutral" />
                <Badge label={`Fibra ${shown.fiber} g`} tone="neutral" />
              </View>
              <Text variant="caption" color="faint">
                Tu mantenimiento estimado es de {fmtInt(maintenance)} kcal. Es una estimación orientativa (fórmula de Mifflin-St Jeor), no un consejo médico.
              </Text>
              {tdeeState.enabled && tdeeState.kcalAdjustment !== 0 ? (
                <Text variant="caption" color="brandText" testID="tdee-adjustment-info">
                  Ajuste aprendido: {tdeeState.kcalAdjustment > 0 ? "+" : ""}
                  {tdeeState.kcalAdjustment} kcal/día, según tu peso real.
                </Text>
              ) : null}
              {manual ? (
                <Text variant="caption" color="muted">
                  El ajuste automático de TDEE está en pausa mientras el objetivo esté a mano.
                </Text>
              ) : null}
            </View>
          ) : (
            <Text variant="body" color="muted" style={{ marginTop: space.sm }}>
              Rellena tus datos para calcularlo.
            </Text>
          )}
        </Card>

        <View style={{ gap: space.md }}>
          <Text variant="heading">Tus datos</Text>
          <SegmentedControl
            options={[
              { value: "male", label: "Hombre" },
              { value: "female", label: "Mujer" },
            ]}
            value={sex}
            onChange={setSex}
          />
          <View style={{ flexDirection: "row", gap: space.md }}>
            <TextField testID="g-age" label="Edad" suffix="años" keyboardType="number-pad" value={age} onChangeText={setAge} error={a !== null && (a < 14 || a > 90) ? "14-90" : undefined} />
            <TextField testID="g-height" label="Altura" suffix="cm" keyboardType="number-pad" value={height} onChangeText={setHeight} error={h !== null && (h < 120 || h > 230) ? "120-230" : undefined} />
            <TextField testID="g-weight" label="Peso" suffix="kg" keyboardType="decimal-pad" value={weight} onChangeText={setWeight} error={w !== null && (w < 30 || w > 250) ? "30-250" : undefined} />
          </View>
          <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-end" }}>
            <TextField
              testID="g-maxhr"
              label="FC máxima (opcional)"
              suffix="ppm"
              keyboardType="number-pad"
              value={maxHr}
              onChangeText={setMaxHr}
              placeholder={a !== null ? String(220 - a) : "190"}
              hint="Para las zonas de running. Si la dejas vacía se estima como 220 − edad."
              error={hrBad ? "120-230" : undefined}
            />
          </View>
          <Button label="Registrar peso y ver evolución" icon="scale-outline" variant="secondary" size="sm" onPress={() => router.push("/peso")} />
        </View>

        <Section title="Actividad">
          <RadioGroup label="Actividad">
            {ACTIVITY_LEVELS.map((l) => (
              <RadioCard key={l.value} selected={activity === l.value} title={l.label} hint={l.hint} onPress={() => setActivity(l.value)} />
            ))}
          </RadioGroup>
        </Section>

        <Section title="¿Qué quieres conseguir?">
          <RadioGroup label="Objetivo">
            {GOALS.map((g) => (
              <RadioCard
                key={g.value}
                selected={goal === g.value}
                title={g.label}
                hint={g.hint}
                onPress={() => setGoal(g.value)}
                leading={<Icon name={g.icon} size="md" color={goal === g.value ? "brandText" : "muted"} />}
              />
            ))}
          </RadioGroup>
        </Section>

        <CollapsibleSection title="Ajustes avanzados" defaultOpen={manual} gap={space.md}>
          <CheckRow
            testID="toggle-exercise"
            kind="switch"
            checked={sumExercise}
            onChange={setSumExercise}
            label="Sumar las calorías del ejercicio"
            hint="Añade a tu objetivo del día las calorías activas que registre el reloj. Apagado por defecto: tu nivel de actividad ya las tiene en cuenta."
          />
          <CheckRow
            testID="toggle-tdee"
            kind="switch"
            checked={tdeeState.enabled}
            onChange={setTdeeEnabled}
            label="Ajuste automático de TDEE"
            hint="Corrige poco a poco tu objetivo según cómo responde tu peso real — siempre te lo propone antes de aplicarlo, nunca en silencio."
          />
          <CheckRow
            kind="switch"
            checked={manual}
            onChange={() => {
              if (!manual && suggested) {
                setM((prev) => ({
                  ...prev,
                  kcal: String(suggested.kcal),
                  protein: String(suggested.protein),
                  carbs: String(suggested.carbs),
                  fat: String(suggested.fat),
                  fiber: String(suggested.fiber),
                }));
              }
              setManual((v) => !v);
            }}
            label="Ajustar a mano"
            hint="Pon tus propios objetivos (por ejemplo, si te los ha dado un nutricionista)."
          />

          {manual ? (
            <View style={{ gap: space.md }}>
              <View style={{ flexDirection: "row", gap: space.md }}>
                <TextField label="Kcal" keyboardType="number-pad" value={m.kcal} onChangeText={(t) => setM((p) => ({ ...p, kcal: t }))} />
                <TextField label="Fibra" suffix="g" keyboardType="number-pad" value={m.fiber} onChangeText={(t) => setM((p) => ({ ...p, fiber: t }))} />
              </View>
              <View style={{ flexDirection: "row", gap: space.md }}>
                <TextField label="Proteína" suffix="g" keyboardType="number-pad" value={m.protein} onChangeText={(t) => setM((p) => ({ ...p, protein: t }))} />
                <TextField label="Hidratos" suffix="g" keyboardType="number-pad" value={m.carbs} onChangeText={(t) => setM((p) => ({ ...p, carbs: t }))} />
                <TextField label="Grasas" suffix="g" keyboardType="number-pad" value={m.fat} onChangeText={(t) => setM((p) => ({ ...p, fat: t }))} />
              </View>
              <Overline color="muted">Reparto de calorías por comida</Overline>
              <View style={{ gap: space.sm }}>
                {MEAL_SLOTS.map((s) => (
                  <View key={s} style={{ flexDirection: "row", alignItems: "flex-end", gap: space.md }}>
                    <TextField label={MEAL_LABEL[s]} suffix="%" keyboardType="number-pad" value={m[s]} onChangeText={(t) => setM((p) => ({ ...p, [s]: t }))} />
                  </View>
                ))}
                <Text variant="caption" color={splitSum === 100 ? "success" : "danger"} accessibilityLiveRegion="polite">
                  Suma: {splitSum} % {splitSum === 100 ? "✓" : "— debe sumar 100 %"}
                </Text>
              </View>
            </View>
          ) : null}
        </CollapsibleSection>
      </View>
    </Screen>
  );
}
