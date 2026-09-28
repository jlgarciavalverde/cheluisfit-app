import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Linking, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FoodBadge } from "@/components/nutrition/FoodRow";
import { Button, Callout, Icon, IconButton, Text, TextField, haptic } from "@/components/ui";
import { type BarcodeResult, lookupBarcode } from "@/data/foodApi";
import { useNutrition } from "@/data/store";
import { todayKey } from "@/domain/dates";
import { fmtInt, fmtNum } from "@/domain/format";
import { isValidGtin, onlyDigits } from "@/domain/gtin";
import { nutrientIssues } from "@/domain/nutrition";
import type { MealSlot } from "@/domain/types";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

type Phase =
  | { name: "scanning" }
  | { name: "looking"; code: string }
  | { name: "result"; result: BarcodeResult };

/** Dos lecturas iguales seguidas para dar un código por bueno. */
const CONFIRM_MS = 2000;

export default function ScannerScreen() {
  const { c } = useTheme();
  const params = useLocalSearchParams<{ meal?: MealSlot; date?: string }>();
  const meal = params.meal ?? "lunch";
  const date = params.date ?? todayKey();
  const foods = useNutrition((s) => s.foods);
  const saveFood = useNutrition((s) => s.saveFood);
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ name: "scanning" });
  const [torch, setTorch] = useState(false);
  const [manual, setManual] = useState(Platform.OS === "web");
  const [manualCode, setManualCode] = useState("");
  const [manualError, setManualError] = useState<string>();
  const last = useRef<{ code: string; t: number } | null>(null);

  const lookup = async (code: string) => {
    setPhase({ name: "looking", code });
    const result = await lookupBarcode(code, foods);
    if (result.status === "found") {
      haptic.success();
      // Cachea el producto (venga de OFF o de lo local) antes de poder navegar a él por id.
      saveFood(result.food);
    } else {
      haptic.warn();
    }
    setPhase({ name: "result", result });
  };

  const onScanned = ({ data }: { data: string }) => {
    if (phase.name !== "scanning") return;
    const code = onlyDigits(data);
    if (!isValidGtin(code) || code !== data.trim()) return; // ignora QR/otros y lecturas erróneas
    const now = Date.now();
    if (last.current?.code === code && now - last.current.t <= CONFIRM_MS) {
      last.current = null;
      lookup(code);
    } else {
      last.current = { code, t: now };
    }
  };

  const submitManual = () => {
    const code = manualCode.trim();
    if (!isValidGtin(code)) {
      setManualError("Código no válido: comprueba los dígitos (8, 12 o 13).");
      return;
    }
    setManualError(undefined);
    lookup(code);
  };

  const retry = () => {
    last.current = null;
    setPhase({ name: "scanning" });
  };

  const result = phase.name === "result" ? phase.result : null;
  const showCamera = !manual && permission?.granted && Platform.OS !== "web";

  return (
    <View style={{ flex: 1, backgroundColor: c.black }}>
      {showCamera ? (
        <CameraView
          style={{ position: "absolute", inset: 0 }}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
          onBarcodeScanned={onScanned}
        />
      ) : null}

      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", padding: space.md }}>
          <IconButton icon="close" label="Cerrar escáner" color="text" size="lg" onPress={() => router.back()} filled />
          {showCamera ? (
            <IconButton
              icon={torch ? "flashlight" : "flashlight-outline"}
              label={torch ? "Apagar linterna" : "Encender linterna"}
              onPress={() => setTorch((t) => !t)}
              filled
            />
          ) : null}
        </View>

        {/* Visor */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.xl }}>
          {showCamera ? (
            <View
              style={{
                width: "86%",
                aspectRatio: 1.6,
                borderRadius: radius.lg,
                borderWidth: 3,
                borderColor: phase.name === "scanning" ? c.brand : c.onScrim,
              }}
            />
          ) : (
            <View style={{ alignItems: "center", gap: space.md, maxWidth: 420 }}>
              <Icon name="barcode-outline" size="hero" color="faint" />
              {Platform.OS === "web" ? (
                <Text variant="body" align="center" color="onScrimMuted">
                  En el navegador se escribe el código a mano. En el móvil se usa la cámara.
                </Text>
              ) : permission && !permission.granted ? (
                <>
                  <Text variant="heading" align="center" color="onScrim">
                    Necesito la cámara para escanear
                  </Text>
                  <Text variant="body" align="center" color="onScrimMuted">
                    Solo se usa para leer códigos de barras; no se guarda ninguna imagen.
                  </Text>
                  {permission.canAskAgain ? (
                    <Button label="Permitir cámara" icon="camera-outline" onPress={requestPermission} />
                  ) : (
                    <Button label="Abrir ajustes" icon="settings-outline" onPress={() => Linking.openSettings()} />
                  )}
                </>
              ) : null}
            </View>
          )}
        </View>

        {/* Panel inferior */}
        <View
          style={{
            backgroundColor: c.surface,
            borderTopLeftRadius: radius.xl,
            borderTopRightRadius: radius.xl,
            padding: space.lg,
            gap: space.md,
            alignItems: "center",
          }}
        >
          <View style={{ width: "100%", maxWidth: 560, gap: space.md }}>
            {phase.name === "scanning" ? (
              <>
                {manual ? (
                  <View style={{ gap: space.sm }}>
                    <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
                      <TextField
                        testID="manual-code"
                        label="Código de barras"
                        keyboardType="number-pad"
                        value={manualCode}
                        onChangeText={(t) => {
                          setManualCode(t);
                          setManualError(undefined);
                        }}
                        placeholder="8480000205049"
                        error={manualError}
                        onSubmitEditing={submitManual}
                        maxLength={14}
                      />
                      <View style={{ paddingBottom: manualError ? 22 : 0 }}>
                        <Button testID="manual-search" label="Buscar" onPress={submitManual} />
                      </View>
                    </View>
                    {Platform.OS !== "web" ? (
                      <Button label="Usar la cámara" icon="camera-outline" variant="ghost" size="sm" onPress={() => setManual(false)} />
                    ) : null}
                  </View>
                ) : (
                  <>
                    <Text variant="bodyStrong" align="center">
                      Apunta al código de barras
                    </Text>
                    <Text variant="caption" color="muted" align="center">
                      Mantén el móvil quieto un segundo para confirmar la lectura.
                    </Text>
                    <Button label="Escribir el código a mano" icon="keypad-outline" variant="ghost" size="sm" onPress={() => setManual(true)} />
                  </>
                )}
              </>
            ) : null}

            {phase.name === "looking" ? (
              <Text variant="bodyStrong" align="center" accessibilityLiveRegion="polite">
                Buscando {phase.code}…
              </Text>
            ) : null}

            {result?.status === "found" ? (
              <View style={{ gap: space.md }} testID="scan-result">
                <View style={{ flexDirection: "row", gap: space.md }}>
                  <View
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: radius.md,
                      backgroundColor: c.surfaceAlt,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name="cube-outline" size="xl" color="faint" />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="heading" numberOfLines={2}>
                      {result.food.name}
                    </Text>
                    <Text variant="caption" color="muted">
                      {[result.food.brand, result.food.packageInfo].filter(Boolean).join(" · ")}
                    </Text>
                    <Text variant="caption" color="muted" tabular>
                      100 g: {fmtInt(result.food.per100.kcal)} kcal · P {fmtNum(result.food.per100.protein)} · H{" "}
                      {fmtNum(result.food.per100.carbs)} · G {fmtNum(result.food.per100.fat)}
                    </Text>
                    <FoodBadge food={result.food} />
                  </View>
                </View>
                {/* Open Food Facts tiene muchas fichas comunitarias sin datos nutricionales rellenos
                    (sin `nutriments` en absoluto) — antes esto solo se avisaba al llegar a la
                    pantalla de cantidad; ahora se ve aquí mismo, antes de decidir añadirlo. */}
                {nutrientIssues(result.food.per100, result.food.alcoholPer100).length > 0 ? (
                  <Callout
                    tone="warning"
                    icon="warning"
                    title="A esta ficha le faltan los datos nutricionales"
                    testID="scan-warning"
                    action={
                      <Button
                        label="Corregir con la etiqueta"
                        icon="create-outline"
                        variant="secondary"
                        size="sm"
                        onPress={() =>
                          router.replace({ pathname: "/crear-alimento", params: { edit: result.food.id, meal, date } })
                        }
                      />
                    }
                  >
                    Open Food Facts no tiene las kcal ni los macros de este producto todavía.
                  </Callout>
                ) : null}
                <Button
                  testID="scan-pick"
                  label="Elegir cantidad"
                  size="lg"
                  fullWidth
                  onPress={() =>
                    router.replace({ pathname: "/alimento/[id]", params: { id: result.food.id, meal, date } })
                  }
                />
                <Button label="¿No es este? Escanear otro" variant="ghost" fullWidth onPress={retry} />
              </View>
            ) : null}

            {result?.status === "not_found" ? (
              <View style={{ gap: space.md }} testID="scan-notfound">
                <Text variant="heading">No tengo este producto</Text>
                <Text variant="body" color="muted">
                  El código {result.code} no está en la base de datos. Puedes crearlo tú con los valores de la etiqueta.
                </Text>
                <Button
                  label="Crear alimento"
                  icon="add"
                  size="lg"
                  fullWidth
                  onPress={() =>
                    router.replace({ pathname: "/crear-alimento", params: { barcode: result.code, meal, date } })
                  }
                />
                <Button
                  testID="identify-with-photo"
                  label="Identificar con foto"
                  icon="camera-outline"
                  variant="secondary"
                  fullWidth
                  onPress={() => router.push({ pathname: "/escaner-foto", params: { meal, date, barcode: result.code } })}
                />
                <Button label="Escanear otro" variant="ghost" fullWidth onPress={retry} />
              </View>
            ) : null}

            {result?.status === "invalid" ? (
              <View style={{ gap: space.md }}>
                <Text variant="heading" color="warning">
                  Código no válido
                </Text>
                <Text variant="body" color="muted">
                  El dígito de control no cuadra. Vuelve a escanearlo o revisa lo que has escrito.
                </Text>
                <Button label="Intentarlo de nuevo" fullWidth onPress={retry} />
              </View>
            ) : null}

            {result?.status === "error" ? (
              <View style={{ gap: space.md }} testID="scan-error">
                <Text variant="heading" color="warning">
                  No se pudo consultar Open Food Facts
                </Text>
                <Text variant="body" color="muted">
                  Comprueba tu conexión e inténtalo otra vez, o crea el alimento a mano con los valores de la etiqueta.
                </Text>
                <Text variant="caption" color="faint" testID="scan-error-detail">
                  {result.message}
                </Text>
                <Button testID="scan-retry" label="Reintentar" icon="refresh" size="lg" fullWidth onPress={() => lookup(result.code)} />
                <Button
                  testID="identify-with-photo"
                  label="Identificar con foto"
                  icon="camera-outline"
                  variant="secondary"
                  fullWidth
                  onPress={() => router.push({ pathname: "/escaner-foto", params: { meal, date, barcode: result.code } })}
                />
                <Button
                  label="Crear alimento a mano"
                  variant="ghost"
                  fullWidth
                  onPress={() =>
                    router.replace({ pathname: "/crear-alimento", params: { barcode: result.code, meal, date } })
                  }
                />
              </View>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
