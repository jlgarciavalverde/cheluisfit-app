import Constants from "expo-constants";
import { router } from "expo-router";
import { useState } from "react";
import { View, Linking } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { UpdateCallout } from "@/components/UpdateCallout";
import { AccountSection } from "@/components/more/AccountSection";
import { Button, Card, CheckRow, Chip, ConfirmSheet, Icon, ListGroup, ListRow, Section, SegmentedControl, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useAuth } from "@/data/authStore";
import { useRunning } from "@/data/runningStore";
import { useStrength } from "@/data/strengthStore";
import { DEFAULT_PLATES, type EffortMode } from "@/domain/strength";
import { useNutrition } from "@/data/store";
import { exportUserData } from "@/lib/exportData";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";


export default function MasScreen() {
  const { pref, setPref } = useTheme();
  const name = useNutrition((s) => s.profile.name);
  const user = useAuth((s) => s.user);
  const resetNutrition = useNutrition((s) => s.resetDemo);
  const resetRunning = useRunning((s) => s.resetDemo);
  const resetStrength = useStrength((s) => s.resetDemo);
  const freshNutrition = useNutrition((s) => s.startFresh);
  const freshRunning = useRunning((s) => s.startFresh);
  const freshStrength = useStrength((s) => s.startFresh);
  const effortMode = useStrength((s) => s.effortMode);
  const setEffortMode = useStrength((s) => s.setEffortMode);
  const remindMeals = useNutrition((s) => s.remindMeals);
  const setRemindMeals = useNutrition((s) => s.setRemindMeals);
  const [exporting, setExporting] = useState(false);
  const [confirmReset, setConfirmReset] = useState<"demo" | "fresh" | null>(null);
  const barKg = useStrength((s) => s.barKg);
  const plates = useStrength((s) => s.plates);
  const setBar = useStrength((s) => s.setBar);
  const version = Constants.expoConfig?.version ?? "0.1.0";

  return (
    <Screen variant="tab" testID="screen-mas">
      <ScreenHeader title="Más" />
      <View style={{ gap: space.xl }}>
        <UpdateCallout />
        <ListGroup>
          <ListRow icon="person-circle-outline" title={name || user?.name || "Tu perfil"} subtitle="Datos personales y objetivo de nutrición" chevron onPress={() => router.push("/objetivo")} />
          <ListRow icon="scale-outline" title="Peso corporal" subtitle="Registro y evolución" chevron onPress={() => router.push("/peso")} />
          <ListRow icon="stats-chart-outline" title="Informe semanal" subtitle="Tu semana con el análisis de la IA" chevron onPress={() => router.push("/informe")} testID="go-informe" />
        </ListGroup>

        <AccountSection />

        <Section kind="overline" title="Apariencia" gap={space.sm}>
          <SegmentedControl<ThemePref>
            role="radio"
            label="Apariencia"
            value={pref}
            onChange={setPref}
            options={[
              { value: "dark", label: "Oscuro" },
              { value: "light", label: "Claro" },
              { value: "system", label: "Sistema" },
            ]}
          />
        </Section>

        <Section kind="overline" title="Recordatorios" gap={space.sm}>
          <Card>
            <CheckRow
              testID="toggle-remind-meals"
              kind="switch"
              checked={remindMeals}
              onChange={setRemindMeals}
              label="Recordarme registrar las comidas"
              hint="Un aviso a las 21:00 si ese día no has anotado nada. En el navegador o sin permiso de notificaciones no llega."
            />
          </Card>
        </Section>

        <Section kind="overline" title="Gimnasio" gap={space.sm}>
          <Card style={{ gap: space.lg }} testID="gym-settings">
            <View style={{ gap: space.sm }}>
              <Text variant="bodyStrong">Esfuerzo por serie</Text>
              <SegmentedControl<EffortMode>
                role="radio"
                label="Escala de esfuerzo"
                value={effortMode}
                onChange={setEffortMode}
                options={[
                  { value: "rir", label: "RIR" },
                  { value: "rpe", label: "RPE" },
                ]}
              />
              <Text variant="caption" color="faint">
                RIR = repeticiones que te quedaban en reserva; RPE = esfuerzo del 1 al 10. Es la misma escala (RPE 9 = 1 RIR): solo cambia cómo lo introduces y lo ves.
              </Text>
            </View>
            <View style={{ gap: space.sm }}>
              <Text variant="bodyStrong">Peso de la barra</Text>
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                {[10, 15, 20].map((n) => (
                  <Chip key={n} testID={`bar-${n}`} label={`${n} kg`} selected={barKg === n} onPress={() => setBar(n, plates)} />
                ))}
              </View>
            </View>
            <View style={{ gap: space.sm }}>
              <Text variant="bodyStrong">Discos que hay en tu gimnasio</Text>
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                {[...DEFAULT_PLATES, 0.5].sort((a, b) => b - a).map((p) => (
                  <Chip
                    key={p}
                    testID={`plate-${p}`}
                    label={`${String(p).replace(".", ",")} kg`}
                    selected={plates.includes(p)}
                    onPress={() => setBar(barKg, plates.includes(p) ? plates.filter((x) => x !== p) : [...plates, p])}
                  />
                ))}
              </View>
              <Text variant="caption" color="faint">
                La calculadora de discos solo usa los que marques.
              </Text>
            </View>
          </Card>
        </Section>

        <Section kind="overline" title="Reloj y datos" gap={space.sm}>
          <Card style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Icon name="watch-outline" size="lg" color="brandText" />
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">Garmin vía Health Connect</Text>
                <Text variant="caption" color="muted">
                  Con Garmin elegido como fuente, el botón «Sincronizar» de la pestaña Running lee las carreras y caminatas que Garmin Connect escriba en Health Connect.
                </Text>
              </View>
            </View>
            <Text variant="caption" color="faint">
              Hace falta activarlo una vez en el propio Garmin Connect: menú → Ajustes → Health Connect → «Escribir» → Sesiones de ejercicio.
            </Text>
          </Card>
        </Section>

        <Section kind="overline" title="Deportes" gap={space.sm}>
          <ListGroup>
            <ListRow icon="football-outline" title="Fútbol" subtitle="Partidos, goles, asistencias y estado físico" chevron testID="go-futbol" onPress={() => router.push("/futbol")} />
          </ListGroup>
        </Section>

        <Section kind="overline" title="Tus datos" gap={space.sm}>
          <Button
            testID="export-data"
            label={exporting ? "Preparando…" : "Exportar mis datos"}
            icon="download-outline"
            variant="secondary"
            disabled={exporting}
            onPress={async () => {
              setExporting(true);
              try {
                const ok = await exportUserData();
                if (!ok) toast("No se pudo compartir el archivo en este dispositivo");
              } catch {
                toast("No se pudo exportar. Inténtalo de nuevo.");
              } finally {
                setExporting(false);
              }
            }}
          />
          <Text variant="caption" color="faint">
            Descarga un JSON con tu nutrición, running y fuerza tal cual están en este móvil — para tu tranquilidad, o para llevártelos si algún día dejas de usar la app.
          </Text>
        </Section>

        <Section kind="overline" title="Datos de ejemplo" gap={space.sm}>
          <Text variant="caption" color="muted">
            {user ? "Cualquiera de las dos opciones se refleja en el servidor la próxima vez que sincronice." : "Todo se guarda en este dispositivo hasta que inicies sesión."}
          </Text>
          <Button
            testID="reset-demo"
            label="Restablecer datos de ejemplo"
            icon="refresh"
            variant="secondary"
            onPress={() => setConfirmReset("demo")}
          />
          <Button
            testID="start-fresh"
            label="Vaciar y empezar de cero"
            icon="trash-outline"
            variant="danger"
            onPress={() => setConfirmReset("fresh")}
          />
          <Text variant="caption" color="faint">
            «Restablecer» vuelve a las rutinas, comidas y perfil de ejemplo (para probar la app). «Vaciar» lo deja todo en blanco, listo para tus propios datos.
          </Text>
        </Section>

        <Section kind="overline" title="Acerca de" gap={space.sm}>
          <Text variant="body">CheluisFIT {version}</Text>
          <Text variant="caption" color="muted">
            Los datos de productos y códigos de barras proceden de Open Food Facts (licencia ODbL); los alimentos genéricos, de tablas USDA.
          </Text>
          <Text variant="caption" color="muted">
            {/* «Exercise data by RepDB» es la atribución que pide RepDB, tal cual; hasaneyldrm (MIT) exige citarlo. */}
            <Text variant="caption" color="brandText" accessibilityRole="link" onPress={() => Linking.openURL("https://repdb.co")}>Exercise data by RepDB (repdb.co)</Text>
            {" · Catálogo de ejercicios también de hasaneyldrm/exercises-dataset (MIT), wger (CC-BY-SA) y free-exercise-db. Datos y GIF animados: AscendAPI / ExerciseDB (ascendapi.com) · © Gym visual (gymvisual.com)."}
          </Text>
          <Text variant="caption" color="muted">
            Los valores calculados son orientativos y no sustituyen el consejo de un profesional sanitario.
          </Text>
        </Section>
      </View>
      <ConfirmSheet
        testID="confirm-reset"
        visible={confirmReset !== null}
        title={confirmReset === "demo" ? "¿Restablecer los datos de ejemplo?" : "¿Vaciarlo todo?"}
        message={
          (confirmReset === "demo"
            ? "Se sustituyen tus comidas, carreras, rutinas y entrenos por los de ejemplo."
            : "Se borran tus comidas, carreras, rutinas, entrenos y pesos de este móvil.") +
          (user ? " También se reflejará en tu cuenta al sincronizar. No se puede deshacer." : " No se puede deshacer.")
        }
        confirmLabel={confirmReset === "demo" ? "Restablecer" : "Vaciar todo"}
        onClose={() => setConfirmReset(null)}
        onConfirm={() => {
          if (confirmReset === "demo") {
            resetNutrition();
            resetRunning();
            resetStrength();
            toast("Datos de ejemplo restablecidos");
          } else {
            freshNutrition();
            freshRunning();
            freshStrength();
            toast("Todo vacío: listo para registrar lo tuyo de verdad");
          }
        }}
      />
    </Screen>
  );
}
