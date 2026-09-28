import Constants from "expo-constants";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Share, View, Linking } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { UpdateCallout } from "@/components/UpdateCallout";
import { Badge, Button, Callout, Card, CheckRow, Chip, ConfirmSheet, Icon, ListGroup, ListRow, Section, SegmentedControl, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api, ApiError } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { useRunning } from "@/data/runningStore";
import { useStrength } from "@/data/strengthStore";
import { discardConflictBackup, listConflictBackups, restoreConflictBackup, type ConflictBackup, type SyncKey } from "@/data/blobSync";
import { syncNow } from "@/data/sync";
import { DEFAULT_PLATES, type EffortMode } from "@/domain/strength";
import { useNutrition } from "@/data/store";
import { exportUserData } from "@/lib/exportData";
import { useTheme, type ThemePref } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

const KEY_LABEL: Record<SyncKey, string> = {
  cf_nutrition_v1: "Nutrición",
  cf_running_v1: "Running",
  cf_strength_v1: "Fuerza",
  cf_active_workout_v1: "Entreno en curso",
};

/**
 * Copias de lo que había en este móvil cuando la sincronización encontró cambios más nuevos en
 * la cuenta (ver `syncBlobs` en `blobSync.ts`: gana el servidor). «Recuperar» vuelve a poner esa
 * copia y se sube en la próxima sincronización; «Descartar» la borra.
 */
function ConflictBackups({ refreshKey }: { refreshKey: unknown }) {
  const [backups, setBackups] = useState<ConflictBackup[]>([]);
  const reload = useCallback(() => {
    listConflictBackups().then(setBackups).catch(() => setBackups([]));
  }, []);
  useEffect(reload, [reload, refreshKey]);
  if (backups.length === 0) return null;
  return (
    <View style={{ gap: space.sm }} testID="conflict-backups">
      {backups.map((b) => (
        <Callout key={b.key} tone="warning" icon="git-compare-outline" dense>
          {KEY_LABEL[b.key]}: se cargó la versión de tu cuenta y lo que tenías aquí ({new Date(b.savedAt).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" })}) quedó guardado aparte.
          {"\n"}
          <Text
            variant="caption"
            color="brandText"
            accessibilityRole="button"
            onPress={() =>
              restoreConflictBackup(b.key)
                .then(() => syncNow().catch(() => {}))
                .then(() => toast("Recuperado lo que tenías en este móvil"))
                .finally(reload)
            }
          >
            Recuperar lo de este móvil
          </Text>
          {"  ·  "}
          <Text variant="caption" color="muted" accessibilityRole="button" onPress={() => discardConflictBackup(b.key).finally(reload)}>
            Descartar copia
          </Text>
        </Callout>
      ))}
    </View>
  );
}

function syncLabel(lastSyncedAt: number | null, syncing: boolean): string {
  if (syncing) return "Sincronizando…";
  if (!lastSyncedAt) return "Aún no se ha sincronizado";
  const mins = Math.round((Date.now() - lastSyncedAt) / 60000);
  if (mins < 1) return "Sincronizado justo ahora";
  if (mins < 60) return `Sincronizado hace ${mins} min`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `Sincronizado hace ${hours} h` : "Sincronizado hace más de un día";
}

export default function MasScreen() {
  const { pref, setPref } = useTheme();
  const name = useNutrition((s) => s.profile.name);
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const logout = useAuth((s) => s.logout);
  const lastSyncedAt = useAuth((s) => s.lastSyncedAt);
  const syncing = useAuth((s) => s.syncing);
  const syncError = useAuth((s) => s.syncError);
  const syncNotice = useAuth((s) => s.syncNotice);
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
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
          <ListRow icon="person-circle-outline" title={name} subtitle="Datos personales y objetivo de nutrición" chevron onPress={() => router.push("/objetivo")} />
          <ListRow icon="scale-outline" title="Peso corporal" subtitle="Registro y evolución" chevron onPress={() => router.push("/peso")} />
        </ListGroup>

        <Section kind="overline" title="Cuenta" gap={space.sm}>
          {user ? (
            <Card style={{ gap: space.md }} testID="account-card">
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <Icon name="person-circle" size="lg" color="brandText" />
                <View style={{ flex: 1 }}>
                  <Text variant="bodyStrong">{user.name}</Text>
                  <Text variant="caption" color="muted">
                    {user.email}
                  </Text>
                </View>
                {user.role === "admin" ? <Badge label="Administrador" tone="brand" /> : null}
              </View>
              {syncError ? (
                <Callout tone="warning" icon="cloud-offline-outline" dense>
                  {syncError}
                </Callout>
              ) : (
                <Text variant="caption" color="faint" testID="sync-status" accessibilityLiveRegion="polite">
                  {syncLabel(lastSyncedAt, syncing)}
                </Text>
              )}
              <ConflictBackups refreshKey={`${syncNotice}-${lastSyncedAt}`} />
              <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                <Button testID="sync-now" label="Sincronizar ahora" icon="sync" variant="secondary" size="sm" disabled={syncing} onPress={() => syncNow().then(() => toast("Sincronizado")).catch(() => toast("No se pudo sincronizar"))} />
                <Button
                  testID="go-social-profile"
                  label="Mi perfil social"
                  icon="person-outline"
                  variant="secondary"
                  size="sm"
                  onPress={async () => {
                    if (!token) return;
                    try {
                      const { username } = await api.socialMyProfile(token);
                      router.push({ pathname: "/social/perfil/[username]", params: { username } });
                    } catch {
                      toast("No se pudo abrir tu perfil social. Prueba otra vez.");
                    }
                  }}
                />
                <Button
                  testID="logout"
                  label="Cerrar sesión"
                  variant="ghost"
                  size="sm"
                  onPress={() => {
                    logout();
                    toast("Sesión cerrada. Sigues teniendo tus datos en este móvil.");
                  }}
                />
              </View>
              {user.role === "admin" ? (
                <View style={{ gap: space.sm }}>
                  {invite ? (
                    <Callout icon="key-outline" dense testID="invite-code">
                      Código: <Text variant="bodyStrong">{invite.code}</Text> · caduca en {Math.max(1, Math.round((invite.expiresAt - Date.now()) / 86400000))} días
                    </Callout>
                  ) : null}
                  <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
                    <Button
                      testID="create-invite"
                      label={creatingInvite ? "Generando…" : "Invitar a alguien"}
                      icon="person-add-outline"
                      variant="secondary"
                      size="sm"
                      disabled={creatingInvite || !token}
                      onPress={async () => {
                        if (!token) return;
                        setCreatingInvite(true);
                        try {
                          const created = await api.createInvite(token);
                          setInvite(created);
                        } catch (e) {
                          toast(e instanceof ApiError ? e.message : "No se pudo generar la invitación");
                        } finally {
                          setCreatingInvite(false);
                        }
                      }}
                    />
                    {invite ? (
                      <Button
                        testID="share-invite"
                        label="Compartir"
                        icon="share-outline"
                        variant="secondary"
                        size="sm"
                        onPress={() => Share.share({ message: `Únete a CheluisFIT con este código de invitación: ${invite.code}` })}
                      />
                    ) : null}
                  </View>
                </View>
              ) : null}
            </Card>
          ) : (
            <ListGroup>
              <ListRow
                icon="cloud-upload-outline"
                title="Iniciar sesión o crear cuenta"
                subtitle="Para que tus entrenos y fotos se guarden también en el servidor"
                chevron
                testID="go-account"
                onPress={() => router.push("/cuenta")}
              />
            </ListGroup>
          )}
        </Section>

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

        <Section kind="overline" title="Próximamente" gap={space.sm}>
          <ListGroup>
            <ListRow icon="football-outline" title="Fútbol" subtitle="Partidos, minutos, goles y esfuerzo" chevron onPress={() => toast("Fútbol se diseñará más adelante")} />
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
            {" · Catálogo de ejercicios también de hasaneyldrm/exercises-dataset (MIT), wger (CC-BY-SA) y free-exercise-db."}
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
