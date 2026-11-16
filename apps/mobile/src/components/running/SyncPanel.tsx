// Fuente de actividades (Garmin vía Health Connect o Strava), su estado y el botón de
// sincronizar, con los avisos de permisos. Sacado de `(tabs)/running.tsx`.
import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { File } from "expo-file-system";
import { Button, Callout, SegmentedControl, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { checkHealthConnectStatus, openAppSettings, openHealthConnectInstall, openHealthConnectSettings, requestHealthConnectPermissions } from "@/data/healthConnect";
import { useRunning } from "@/data/runningStore";
import { connectStrava } from "@/data/stravaAuth";
import { dayLabel, toDateKey, todayKey } from "@/domain/dates";
import { parseGpx } from "@/domain/gpx";
import { space } from "@/theme/tokens";

function syncLabel(iso: string | null): string {
  if (!iso) return "Sin sincronizar";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "Sincronizado ahora";
  if (mins < 60) return `Sincronizado hace ${mins} min`;
  const time = d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  // Con el día si no fue hoy: «a las 9:15» de hace tres días engañaba.
  const day = toDateKey(d);
  return day === todayKey() ? `Sincronizado a las ${time}` : `Sincronizado ${dayLabel(day, todayKey()).toLowerCase()} a las ${time}`;
}

type SyncFailure = { source: "garmin" | "strava"; message: string };

export function SyncPanel() {
  const [syncing, setSyncing] = useState(false);
  const [permissionHelp, setPermissionHelp] = useState(false);
  const [stravaBusy, setStravaBusy] = useState(false);
  const [syncError, setSyncError] = useState<SyncFailure | null>(null);
  const [gpxBusy, setGpxBusy] = useState(false);
  const [gpxError, setGpxError] = useState<string | null>(null);
  const [lastGpxName, setLastGpxName] = useState<string | null>(null);
  const gpxInputRef = useRef<HTMLInputElement | null>(null);
  const token = useAuth((s) => s.token);
  const lastSync = useRunning((s) => s.lastSync);
  const lastStravaSync = useRunning((s) => s.lastStravaSync);
  const stravaConnected = useRunning((s) => s.stravaConnected);
  const setStravaConnected = useRunning((s) => s.setStravaConnected);
  const source = useRunning((s) => s.source);
  const setSource = useRunning((s) => s.setSource);
  const markSynced = useRunning((s) => s.markSynced);
  const markStravaSynced = useRunning((s) => s.markStravaSynced);
  const addActivity = useRunning((s) => s.addActivity);

  // Refleja el estado real del servidor (p. ej. tras desconectar desde otro dispositivo, o en
  // el primer arranque de este) — `stravaConnected` local es solo una caché de esto.
  useEffect(() => {
    if (!token) return;
    api
      .stravaStatus(token)
      .then(({ connected }) => setStravaConnected(connected))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const connectAndSyncStrava = async () => {
    if (!token) {
      toast("Inicia sesión para conectar Strava");
      return;
    }
    setStravaBusy(true);
    try {
      if (!stravaConnected) {
        const ok = await connectStrava(token);
        if (!ok) {
          toast("No se pudo conectar con Strava");
          return;
        }
        setStravaConnected(true);
      }
      setSyncError(null);
      const n = await markStravaSynced(token);
      toast(n > 0 ? `${n} actividad${n === 1 ? "" : "es"} nueva${n === 1 ? "" : "s"} de Strava` : "Strava sincronizado · sin actividades nuevas");
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo sincronizar con Strava. Inténtalo de nuevo.";
      setSyncError({ source: "strava", message });
    } finally {
      setStravaBusy(false);
    }
  };

  const syncGarmin = async () => {
    setSyncing(true);
    setPermissionHelp(false);
    setSyncError(null);
    try {
      const status = await checkHealthConnectStatus();
      if (status === "not_installed") {
        toast("Necesito Health Connect instalado en el móvil", {
          actionLabel: "Instalar",
          onAction: openHealthConnectInstall,
        });
        return;
      }
      if (status === "update_required") {
        toast("Health Connect necesita actualizarse", {
          actionLabel: "Actualizar",
          onAction: openHealthConnectInstall,
        });
        return;
      }
      if (!(await requestHealthConnectPermissions())) {
        // Un toast no basta aquí: en algunos móviles/fabricantes el interruptor de salud no
        // está donde se espera, así que se deja un aviso fijo con las dos rutas posibles en
        // vez de un mensaje que desaparece solo a los pocos segundos.
        setPermissionHelp(true);
        return;
      }
      const n = await markSynced();
      toast(n > 0 ? `${n} actividad${n === 1 ? "" : "es"} nueva${n === 1 ? "" : "s"}` : "Garmin sincronizado · sin actividades nuevas");
    } catch (e) {
      const message = e instanceof Error ? e.message : "No se pudo sincronizar con Garmin. Inténtalo de nuevo.";
      setSyncError({ source: "garmin", message });
    } finally {
      setSyncing(false);
    }
  };

  const importGpxFromText = (xml: string, name: string) => {
    setGpxBusy(true);
    setGpxError(null);
    setLastGpxName(name);
    try {
      const base = name.replace(/\.gpx$/i, "").trim();
      const parsed = parseGpx(xml, base || "Importado GPX");
      if (!parsed.ok) {
        setGpxError(parsed.message);
        return;
      }
      addActivity(parsed.activity);
      toast(`Carrera importada · ${base || "GPX"}`);
    } catch (e) {
      setGpxError(e instanceof Error ? e.message : "No se pudo leer el fichero GPX");
    } finally {
      setGpxBusy(false);
    }
  };

  const pickGpx = async () => {
    if (Platform.OS === "web") {
      gpxInputRef.current?.click();
      return;
    }
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: ["application/gpx+xml", "application/xml", "text/xml", "*/*"], copyToCacheDirectory: true });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      const name = asset.name ?? "importado.gpx";
      const file = new File(asset.uri);
      const xml = await file.text();
      importGpxFromText(xml, name);
    } catch (e) {
      setGpxError(e instanceof Error ? e.message : "No se pudo abrir el fichero GPX");
    }
  };

  const retryGpx = async () => {
    if (Platform.OS === "web") {
      gpxInputRef.current?.click();
      return;
    }
    await pickGpx();
  };

  return (
    <>
      {/* El estado va en su propia línea: en la misma fila que el selector y el botón se quedaba
          en ~60 dp y se partía palabra a palabra («Sincro / nizado / hace…», visto en el móvil). */}
      <Text variant="caption" color="muted" numberOfLines={1} testID="sync-label">
        {source === "strava" ? (stravaConnected ? syncLabel(lastStravaSync) : "Strava · no conectado") : syncLabel(lastSync)}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          {/* La fuente es elección de la persona, no algo que se sustituye al conectar: Strava
              trae ruta GPS; Garmin (Health Connect) no la trae pero no necesita servidor. */}
          <SegmentedControl
            role="radio"
            label="Fuente de actividades"
            testID="source-picker"
            value={source}
            onChange={setSource}
            options={[
              { value: "garmin", label: "Garmin" },
              { value: "strava", label: "Strava" },
            ]}
          />
        </View>
          {source === "garmin" ? (
            <Button
              testID="sync-garmin"
              label={syncing ? "Sincronizando…" : "Sincronizar"}
              icon="sync"
              variant="secondary"
              size="sm"
              disabled={syncing}
              onPress={syncGarmin}
            />
          ) : (
            <Button
              testID="sync-strava"
              label={stravaBusy ? "Sincronizando…" : stravaConnected ? "Sincronizar" : "Conectar"}
              icon={stravaConnected ? "sync" : "link-outline"}
              variant="secondary"
              size="sm"
              disabled={stravaBusy}
              onPress={connectAndSyncStrava}
            />
          )}
      </View>

      {source === "strava" && !stravaConnected ? (
        <Callout
          tone="warning"
          icon="alert-circle-outline"
          testID="strava-not-connected"
          action={
            <Button testID="back-to-garmin" label="Usar Garmin" size="sm" variant="secondary" onPress={() => setSource("garmin")} />
          }
        >
          Strava no está conectado (la API exige suscripción de pago). Tu reloj escribe sus sesiones
          en Garmin — vuelve a Garmin para traerlas.
        </Callout>
      ) : null}

      {syncError ? (
        <Callout
          tone="danger"
          icon="alert-circle-outline"
          testID="sync-error"
          action={
            <Button
              testID="sync-retry"
              label="Reintentar"
              size="sm"
              variant="secondary"
              disabled={syncing || stravaBusy}
              onPress={syncError.source === "garmin" ? syncGarmin : connectAndSyncStrava}
            />
          }
        >
          {syncError.message}
        </Callout>
      ) : null}

      <Button
        testID="import-gpx"
        label={gpxBusy ? "Leyendo GPX…" : "Importar GPX"}
        icon="map-outline"
        variant="secondary"
        size="sm"
        fullWidth
        disabled={gpxBusy}
        onPress={pickGpx}
      />

      {Platform.OS === "web" ? (
        <input
          ref={gpxInputRef}
          type="file"
          accept=".gpx,application/gpx+xml,text/xml"
          style={{ display: "none" }}
          onChange={(ev) => {
            const file = ev.target.files?.[0];
            ev.target.value = "";
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === "string") importGpxFromText(reader.result, file.name);
            };
            reader.onerror = () => setGpxError("No se pudo leer el fichero GPX");
            reader.readAsText(file);
          }}
        />
      ) : null}

      {gpxError ? (
        <Callout
          tone="danger"
          icon="alert-circle-outline"
          testID="gpx-import-error"
          action={
            <Button testID="gpx-import-retry" label="Reintentar" size="sm" variant="secondary" disabled={gpxBusy} onPress={retryGpx} />
          }
        >
          {lastGpxName ? `${gpxError} (${lastGpxName})` : gpxError}
        </Callout>
      ) : null}

      {permissionHelp ? (
        <Callout tone="warning" icon="lock-closed-outline" title="Sin permiso de Health Connect" testID="permission-help">
          <Text variant="body" color="muted">
            No he podido leer tus actividades. Según el móvil, el interruptor de salud está en
            un sitio distinto — prueba estas dos rutas y vuelve a pulsar «Sincronizar»:
          </Text>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap", marginTop: space.sm }}>
            <Button testID="open-app-settings" label="Ajustes de la app" size="sm" variant="secondary" onPress={openAppSettings} />
            <Button testID="open-hc-settings" label="Salud conectada" size="sm" variant="secondary" onPress={openHealthConnectSettings} />
          </View>
          <Text variant="caption" color="faint" style={{ marginTop: space.sm }}>
            Si en ninguna de las dos aparece CheluisFIT como opción: Ajustes → Aplicaciones →
            Salud conectada → Forzar detención, vuelve a abrir Salud conectada (para que
            actualice su lista de apps) y repite «Sincronizar».
          </Text>
        </Callout>
      ) : null}
    </>
  );
}
