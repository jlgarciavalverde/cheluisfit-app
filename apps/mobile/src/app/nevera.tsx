import { useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Button, Callout, EmptyState, IconButton, ListGroup, ListRow } from "@/components/ui";
import { router } from "expo-router";
import { toast } from "@/components/ui/Toast";
import { api, ApiError } from "@/data/api";
import { captureAiPhoto } from "@/data/aiVision";
import { useAuth } from "@/data/authStore";
import { useNutrition } from "@/data/store";
import { todayKey } from "@/domain/dates";
import { space } from "@/theme/tokens";

const DAYS_STALE = 3;

function daysSince(date: string): number {
  return Math.max(0, Math.round((Date.parse(todayKey()) - Date.parse(date)) / 86_400_000));
}

/**
 * Foto de la nevera → IA lista los ingredientes (`api.aiFridgeScan`, ver `AGENTS.md`). Solo se
 * guarda el texto de la lista; la foto nunca se guarda ni en el móvil ni en el servidor. El
 * contenido se usa como contexto extra del asistente de IA (`aiContext.ts`), no hay ninguna
 * lista de la compra dentro de CheluisFIT.
 */
export default function FridgeScreen() {
  const token = useAuth((s) => s.token);
  const fridge = useNutrition((s) => s.fridge);
  const setFridgeContents = useNutrition((s) => s.setFridgeContents);
  const clearFridge = useNutrition((s) => s.clearFridge);

  const removeItem = (item: string) => {
    const before = fridge;
    useNutrition.setState({ fridge: { ...fridge, items: fridge.items.filter((x) => x !== item) } });
    toast(`«${item}» quitado`, { actionLabel: "Deshacer", onAction: () => useNutrition.setState({ fridge: before }) });
  };
  const [scanning, setScanning] = useState(false);

  const scan = async () => {
    if (!token) {
      toast("Inicia sesión para escanear la nevera", { actionLabel: "Entrar", onAction: () => router.push("/cuenta") });
      return;
    }
    const uri = await captureAiPhoto();
    if (!uri) return;
    setScanning(true);
    try {
      const { items } = await api.aiFridgeScan(token, uri);
      setFridgeContents(items);
      toast(items.length > 0 ? "Nevera escaneada" : "No he reconocido ningún ingrediente, prueba con más luz");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo escanear la nevera");
    } finally {
      setScanning(false);
    }
  };

  return (
    <Screen testID="screen-nevera">
      <ScreenHeader title="Nevera" subtitle="Para que el asistente de IA sepa qué tienes a mano" back />
      <View style={{ gap: space.lg }}>
        <Button testID="scan-fridge" label={scanning ? "Analizando…" : "Escanear nevera"} icon="camera-outline" size="lg" fullWidth loading={scanning} onPress={scan} />

        {fridge.items.length === 0 ? (
          <EmptyState icon="basket-outline" title="Todavía no has escaneado la nevera" text="Hazle una foto al interior y la IA reconocerá lo que hay." />
        ) : (
          <>
            {fridge.lastScannedAt && daysSince(fridge.lastScannedAt) > DAYS_STALE ? (
              <Callout tone="warning" icon="time-outline" testID="fridge-stale">
                Esta lista tiene {daysSince(fridge.lastScannedAt)} días — puede que ya no sea real.
              </Callout>
            ) : null}
            <ListGroup testID="fridge-items">
              {fridge.items.map((item) => (
                <ListRow key={item} title={item} icon="nutrition-outline" trailing={<IconButton icon="close" label={`Quitar ${item}`} size="sm" onPress={() => removeItem(item)} />} />
              ))}
            </ListGroup>
            <Button
              testID="clear-fridge"
              label="Vaciar lista"
              icon="trash-outline"
              variant="ghost"
              onPress={() => {
                const before = fridge;
                clearFridge();
                toast("Lista vaciada", { actionLabel: "Deshacer", onAction: () => useNutrition.setState({ fridge: before }) });
              }}
            />
          </>
        )}
      </View>
    </Screen>
  );
}
