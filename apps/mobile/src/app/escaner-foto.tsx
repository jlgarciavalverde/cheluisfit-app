import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Button, Callout, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api, ApiError, type FoodProposal } from "@/data/api";
import { captureAiPhoto } from "@/data/aiVision";
import { useAuth } from "@/data/authStore";
import type { MealSlot } from "@/domain/types";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

function proposalText(p: FoodProposal): string {
  const bits = [`${p.per100.kcal} kcal/100 g`, `P ${p.per100.protein} g`, `H ${p.per100.carbs} g`, `G ${p.per100.fat} g`];
  return `${p.name}${p.brand ? ` (${p.brand})` : ""} — ${bits.join(" · ")}`;
}

export default function ScanPhotoScreen() {
  const { c } = useTheme();
  // `barcode`: si se llega desde un código de barras que no se encontró, el alimento que proponga
  // la IA se guarda con ese código — así el próximo escaneo del mismo producto ya lo encuentra.
  const params = useLocalSearchParams<{ meal?: MealSlot; date?: string; barcode?: string }>();
  const token = useAuth((s) => s.token);
  const [front, setFront] = useState<string | null>(null);
  const [back, setBack] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<{ reply: string; proposals: FoodProposal[] } | null>(null);

  const takeFront = async () => setFront(await captureAiPhoto());
  const takeBack = async () => setBack(await captureAiPhoto());

  const analyze = async () => {
    if (!front) return;
    if (!token) {
      toast("Inicia sesión para identificar con foto", { actionLabel: "Entrar", onAction: () => router.push("/cuenta") });
      return;
    }
    setAnalyzing(true);
    try {
      const res = await api.aiProductScan(token, front, back ?? undefined);
      setResult(res);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo analizar la foto");
    } finally {
      setAnalyzing(false);
    }
  };

  const apply = (p: FoodProposal) => {
    router.replace({
      pathname: "/crear-alimento",
      params: {
        name: p.name,
        brand: p.brand,
        barcode: params.barcode ?? p.barcode,
        kcal: String(p.per100.kcal),
        protein: String(p.per100.protein),
        carbs: String(p.per100.carbs),
        fat: String(p.per100.fat),
        fiber: String(p.per100.fiber),
        sugars: String(p.per100.sugars),
        satFat: String(p.per100.satFat),
        salt: String(p.per100.salt),
        aiProposed: "1",
        meal: params.meal,
        date: params.date,
      },
    });
  };

  const thumb = (uri: string) => <Image source={{ uri }} contentFit="cover" accessibilityLabel="Foto tomada" style={{ width: 96, height: 96, borderRadius: radius.md, backgroundColor: c.surfaceAlt }} />;

  return (
    <Screen testID="screen-escaner-foto" variant="form">
      <ScreenHeader title="Identificar con foto" subtitle="La IA lee las fotos y propone los datos — revísalos antes de guardar" back />
      <View style={{ gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <Text variant="bodyStrong">Foto delantera</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            {front ? thumb(front) : null}
            <Button testID="shot-front" label={front ? "Repetir foto" : "Hacer foto"} icon="camera-outline" variant="secondary" onPress={takeFront} />
          </View>
        </View>

        <View style={{ gap: space.sm }}>
          <Text variant="bodyStrong">Foto trasera (opcional)</Text>
          <Text variant="caption" color="muted">
            La etiqueta de información nutricional, si se ve bien.
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            {back ? thumb(back) : null}
            <Button testID="shot-back" label={back ? "Repetir foto" : "Hacer foto"} icon="camera-outline" variant="secondary" onPress={takeBack} />
          </View>
        </View>

        <Button testID="analyze-photos" label={analyzing ? "Analizando…" : "Analizar con IA"} size="lg" fullWidth loading={analyzing} disabled={!front || analyzing} onPress={analyze} />

        {result ? (
          <View style={{ gap: space.md }} testID="photo-scan-result">
            <Text variant="body" color="muted">
              {result.reply}
            </Text>
            {result.proposals.length === 0 ? (
              <Callout tone="warning" icon="alert-circle-outline">
                No he podido identificar el producto con estas fotos. Prueba con más luz o crea el alimento a mano.
              </Callout>
            ) : (
              result.proposals.map((p, i) => (
                <Callout
                  key={i}
                  tone="brand"
                  icon="sparkles-outline"
                  action={
                    <View style={{ flexDirection: "row", gap: space.sm }}>
                      <Button testID={`apply-proposal-${i}`} label="Aplicar" size="sm" variant="secondary" onPress={() => apply(p)} />
                      <Button label="Descartar" size="sm" variant="ghost" onPress={() => setResult((r) => (r ? { ...r, proposals: r.proposals.filter((x) => x !== p) } : r))} />
                    </View>
                  }
                >
                  {proposalText(p)}
                </Callout>
              ))
            )}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
