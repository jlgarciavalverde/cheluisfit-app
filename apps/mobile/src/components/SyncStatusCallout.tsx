import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Button, Callout } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { ApiError } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { listConflictBackups } from "@/data/blobSync";
import { syncNow } from "@/data/sync";
import { space } from "@/theme/tokens";

/** Aviso persistente de sincronización (conflictos o error de red), visible en Hoy y Más. */
export function SyncStatusCallout() {
  const syncError = useAuth((s) => s.syncError);
  const syncNotice = useAuth((s) => s.syncNotice);
  const syncing = useAuth((s) => s.syncing);
  const lastSyncedAt = useAuth((s) => s.lastSyncedAt);
  const token = useAuth((s) => s.token);
  const [backupCount, setBackupCount] = useState(0);

  const reloadBackups = useCallback(() => {
    listConflictBackups()
      .then((b) => setBackupCount(b.length))
      .catch(() => setBackupCount(0));
  }, []);

  useEffect(reloadBackups, [reloadBackups, syncNotice, lastSyncedAt]);

  const retry = () => {
    syncNow()
      .then(() => toast("Sincronizado"))
      .catch((e) => toast(e instanceof ApiError ? e.message : "No se pudo sincronizar"));
  };

  const dismissNotice = () => useAuth.getState().setSyncState({ syncNotice: null });

  const showConflict = Boolean(syncNotice) || backupCount > 0;
  if (!syncError && !showConflict) return null;

  return (
    <View style={{ gap: space.sm }}>
      {syncError ? (
        <Callout tone="danger" icon="cloud-offline-outline" testID="sync-error-callout" dense action={<View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}><Button label="Reintentar" size="sm" variant="secondary" disabled={syncing || !token} onPress={retry} /><Button label="Ir a Cuenta" size="sm" variant="ghost" onPress={() => router.push("/(tabs)/mas")} /></View>}>
          {syncError}
        </Callout>
      ) : null}
      {showConflict ? (
        <Callout
          tone="warning"
          icon="git-compare-outline"
          testID="sync-notice-callout"
          dense
          action={
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              <Button label="Entendido" size="sm" variant="secondary" onPress={dismissNotice} />
              <Button label="Ver en Cuenta" size="sm" variant="ghost" onPress={() => router.push("/(tabs)/mas")} />
            </View>
          }
        >
          {syncNotice ??
            "Hay copias locales guardadas por un conflicto de sincronización. Puedes recuperarlas o descartarlas en Más → Cuenta."}
        </Callout>
      ) : null}
    </View>
  );
}
