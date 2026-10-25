import { Component, lazy, Suspense, useState, type ReactNode } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Screen, ScreenHeader } from "@/components/Screen";
import { ActionList, ActionRow, BottomSheet, Button, Callout, Card, EmptyState, IconButton, ListGroup, ListRow, Section, SegmentedControl, Skeleton, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { FridgeItemSheet } from "@/components/fridge/FridgeItemSheet";
import { api, ApiError } from "@/data/api";
import { captureAiPhoto } from "@/data/aiVision";
import { useAiPanel } from "@/data/aiPanelStore";
import { useAuth } from "@/data/authStore";
import { useNutrition, useTargets } from "@/data/store";
import { todayKey } from "@/domain/dates";
import { CATEGORY_LABEL, daysSinceScan, fmtQuantity, groupByPlace, ZONE_LABEL, type FridgeItem } from "@/domain/fridge";
import { sumNutrients } from "@/domain/nutrition";
import { space } from "@/theme/tokens";

// Three.js pesa: solo se carga al abrir la Nevera, nunca con el resto de la app.
const Fridge3D = lazy(() => import("@/components/fridge/Fridge3D"));

const DAYS_STALE = 3;

/** Si el 3D no puede arrancar (sin WebGL, GPU rara), se queda en la lista con un aviso. */
class Fallback3D extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function placeLabel(it: FridgeItem): string {
  return it.zone === "freezer" ? ZONE_LABEL.freezer : `${ZONE_LABEL[it.zone]} ${it.level + 1}`;
}

/**
 * Nevera: foto → la IA reconoce los alimentos **y dónde está cada uno** (`api.aiFridgeScan`,
 * ver `AGENTS.md`), que se ven en 3D o en lista por sitios. Se puede añadir y corregir a mano.
 * La foto nunca se guarda. El contenido es contexto del asistente (`domain/fridge.ts`'s
 * `fridgeContext`), y «¿Qué cocino?» le pregunta directamente con lo que te queda de hoy.
 */
export default function FridgeScreen() {
  const token = useAuth((s) => s.token);
  const fridge = useNutrition((s) => s.fridge);
  const entries = useNutrition((s) => s.entries);
  const targets = useTargets();
  const { applyFridgeScan, upsertFridgeItem, removeFridgeItem, setFridge, clearFridge } = useNutrition.getState();
  const openPanel = useAiPanel((s) => s.openPanel);

  const [view, setView] = useState<"3d" | "list">("3d");
  const [scanning, setScanning] = useState(false);
  const [askMode, setAskMode] = useState<"camera" | "library" | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<FridgeItem | null | "new">(null);
  const [no3d, setNo3d] = useState(false);

  const selected = fridge.items.find((i) => i.id === selectedId) ?? null;
  const days = daysSinceScan(fridge.lastScannedAt);
  const empty = fridge.items.length === 0;

  const remove = (item: FridgeItem) => {
    removeFridgeItem(item.id);
    if (selectedId === item.id) setSelectedId(null);
    toast(`«${item.name}» quitado`, { actionLabel: "Deshacer", onAction: () => upsertFridgeItem(item) });
  };

  const scan = async (source: "camera" | "library", mode: "replace" | "add") => {
    setAskMode(null);
    if (!token) {
      toast("Inicia sesión para escanear la nevera", { actionLabel: "Entrar", onAction: () => router.push("/cuenta") });
      return;
    }
    const uri = await captureAiPhoto(source);
    if (!uri) return;
    setScanning(true);
    const before = fridge;
    try {
      const { scan: result } = await api.aiFridgeScan(token, uri);
      if (result.items.length === 0) {
        toast("No he reconocido ningún alimento. Prueba con más luz o más cerca.");
        return;
      }
      applyFridgeScan(result, mode);
      setSelectedId(null);
      const n = result.items.length;
      toast(`${n} ${n === 1 ? "alimento" : "alimentos"} ${mode === "add" ? (n === 1 ? "añadido" : "añadidos") : "en la nevera"}${result.positioned ? "" : " (sin sitio exacto: colócalos si quieres)"}`, {
        actionLabel: "Deshacer",
        onAction: () => setFridge(before),
      });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo analizar la foto");
    } finally {
      setScanning(false);
    }
  };

  // Con algo ya en la nevera se pregunta si la foto es de toda la nevera o de una parte.
  const startScan = (source: "camera" | "library") => (empty ? scan(source, "replace") : setAskMode(source));

  const whatToCook = () => {
    const eaten = sumNutrients(entries.filter((e) => e.date === todayKey()).map((e) => e.nutrients));
    const kcal = Math.max(0, Math.round(targets.kcal - eaten.kcal));
    const protein = Math.max(0, Math.round(targets.protein - eaten.protein));
    openPanel(`¿Qué puedo cocinar hoy con lo que tengo en la nevera? Me quedan unas ${kcal} kcal y ${protein} g de proteína para hoy. Dame 2 o 3 ideas sencillas con cantidades aproximadas.`);
  };

  const list = (
    <View style={{ gap: space.lg }} testID="fridge-items">
      {groupByPlace(fridge.items).map((g) => (
        <Section key={`${g.zone}:${g.level}`} title={g.label} kind="overline" gap={space.sm}>
          <ListGroup>
            {g.items.map((it) => (
              <ListRow
                key={it.id}
                title={it.name}
                subtitle={[CATEGORY_LABEL[it.category], fmtQuantity(it), it.expiresHint, it.positioned ? null : "sitio aproximado"].filter(Boolean).join(" · ")}
                icon="nutrition-outline"
                onPress={() => setEditing(it)}
                accessibilityLabel={`${it.name}, ${g.label}. Editar`}
                trailing={<IconButton icon="close" label={`Quitar ${it.name}`} size="sm" onPress={() => remove(it)} />}
              />
            ))}
          </ListGroup>
        </Section>
      ))}
    </View>
  );

  return (
    <Screen testID="screen-nevera">
      <ScreenHeader title="Nevera" subtitle="Qué tienes y dónde está, para que la IA te ayude a cocinar" back />
      <View style={{ gap: space.lg }}>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Button testID="scan-fridge" label={scanning ? "Analizando…" : "Hacer foto"} icon="camera-outline" size="lg" fullWidth loading={scanning} onPress={() => startScan("camera")} />
          </View>
          <View style={{ flex: 1 }}>
            <Button testID="scan-fridge-library" label="De la galería" icon="images-outline" size="lg" variant="secondary" fullWidth disabled={scanning} onPress={() => startScan("library")} />
          </View>
        </View>

        {empty ? (
          <EmptyState
            icon="basket-outline"
            title="Todavía no has escaneado la nevera"
            text="Haz una foto con la puerta abierta (o de cada balda) y la IA reconocerá lo que hay y dónde está. También puedes añadir cosas a mano."
          />
        ) : (
          <>
            {days != null && days > DAYS_STALE ? (
              <Callout tone="warning" icon="time-outline" testID="fridge-stale">
                Lo último que viste es de hace {days} días: puede que ya no sea real.
              </Callout>
            ) : null}

            <SegmentedControl
              testID="fridge-view"
              options={[
                { value: "3d", label: "3D" },
                { value: "list", label: "Lista" },
              ]}
              value={no3d ? "list" : view}
              onChange={setView}
            />

            {view === "3d" && !no3d ? (
              <Fallback3D
                fallback={
                  <Callout tone="neutral" icon="cube-outline" testID="fridge-3d-unavailable" action={<Button label="Ver lista" size="sm" variant="secondary" onPress={() => setNo3d(true)} />}>
                    Este dispositivo no puede mostrar la nevera en 3D.
                  </Callout>
                }
              >
                <Suspense fallback={<Skeleton style={{ height: 420 }} />}>
                  <Fridge3D fridge={fridge} selectedId={selectedId} onSelect={setSelectedId} />
                </Suspense>
                {selected ? (
                  <Card testID="fridge-selected">
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                      <View style={{ flex: 1, gap: space.hair }}>
                        <Text variant="bodyStrong">{selected.name}</Text>
                        <Text variant="caption" color="muted">
                          {[placeLabel(selected), CATEGORY_LABEL[selected.category], fmtQuantity(selected), selected.expiresHint].filter(Boolean).join(" · ")}
                        </Text>
                      </View>
                      <IconButton icon="create-outline" label={`Editar ${selected.name}`} onPress={() => setEditing(selected)} />
                      <IconButton icon="trash-outline" label={`Quitar ${selected.name}`} color="danger" onPress={() => remove(selected)} />
                    </View>
                  </Card>
                ) : (
                  <Text variant="caption" color="muted" style={{ textAlign: "center" }}>
                    Arrastra para girar, pellizca para acercar y toca un alimento para verlo.
                  </Text>
                )}
              </Fallback3D>
            ) : (
              list
            )}

            <Button testID="fridge-what-to-cook" label="¿Qué cocino con esto?" icon="sparkles-outline" size="lg" fullWidth disabled={!token} onPress={whatToCook} />
          </>
        )}

        <ActionList>
          <ActionRow testID="fridge-add-manual" icon="add-circle-outline" label="Añadir a mano" hint="Algo que la foto no vio" onPress={() => setEditing("new")} />
          {!empty ? (
            <ActionRow
              testID="clear-fridge"
              icon="trash-outline"
              label="Vaciar nevera"
              tone="danger"
              onPress={() => {
                const before = fridge;
                clearFridge();
                setSelectedId(null);
                toast("Nevera vaciada", { actionLabel: "Deshacer", onAction: () => setFridge(before) });
              }}
            />
          ) : null}
        </ActionList>
      </View>

      <BottomSheet visible={askMode !== null} onClose={() => setAskMode(null)} title="¿Qué sale en la foto?" subtitle="Así sé si sustituir la lista o sumarle cosas">
        <ActionList>
          <ActionRow testID="scan-mode-replace" icon="albums-outline" label="Toda la nevera" hint="Sustituye lo que había" onPress={() => askMode && scan(askMode, "replace")} />
          <ActionRow testID="scan-mode-add" icon="add-outline" label="Una parte: una balda, la puerta o un cajón" hint="Se suma a lo que ya había" onPress={() => askMode && scan(askMode, "add")} />
        </ActionList>
      </BottomSheet>

      <FridgeItemSheet
        key={editing === "new" ? "new" : (editing?.id ?? "none")}
        visible={editing !== null}
        item={editing === "new" ? null : editing}
        layout={fridge.layout}
        onClose={() => setEditing(null)}
        onSave={(it) => {
          upsertFridgeItem(it);
          setEditing(null);
          setSelectedId(it.id);
          toast(editing === "new" ? `«${it.name}» añadido` : "Cambios guardados");
        }}
        onRemove={(it) => {
          setEditing(null);
          remove(it);
        }}
      />
    </Screen>
  );
}
