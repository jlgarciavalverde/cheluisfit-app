// Sección «Cuenta» de Más: datos de la cuenta, estado de la sincronización, copias de conflicto,
// perfil social, cerrar sesión e invitaciones (solo admin). Sacada de `(tabs)/mas.tsx`.
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Share, View } from "react-native";
import { ActionList, ActionRow, Badge, BottomSheet, Button, Callout, Card, Icon, ListGroup, ListRow, Section, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api, ApiError, type ApiUser } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { discardConflictBackup, listConflictBackups, restoreConflictBackup, type ConflictBackup, type SyncKey } from "@/data/blobSync";
import { syncNow } from "@/data/sync";
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

/**
 * Recuperar el acceso de alguien del hogar que olvidó su contraseña (solo admin): se genera un
 * código de un solo uso (24 h) y se le pasa por WhatsApp; lo usa en «¿Has olvidado la contraseña?».
 */
function ResetAccessSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const token = useAuth((s) => s.token);
  const me = useAuth((s) => s.user);
  const [members, setMembers] = useState<ApiUser[] | null>(null);
  const [code, setCode] = useState<{ code: string; name: string } | null>(null);

  useEffect(() => {
    if (!visible || !token) return;
    let alive = true;
    api
      .householdMembers(token)
      .then((r) => alive && setMembers(r.members.filter((m) => m.id !== me?.id)))
      .catch(() => alive && setMembers([]));
    return () => {
      alive = false;
    };
  }, [visible, token, me?.id]);

  const generate = async (m: ApiUser) => {
    if (!token) return;
    try {
      const r = await api.createReset(token, m.id);
      setCode({ code: r.code, name: r.name });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo generar el código");
    }
  };

  const close = () => {
    setCode(null);
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={close} title="Restablecer un acceso" subtitle="Para quien ha olvidado su contraseña">
      {code ? (
        <View style={{ gap: space.md }}>
          <Callout icon="key-outline" testID="reset-code-generated">
            Código para {code.name}: <Text variant="bodyStrong">{code.code}</Text> · vale 24 horas y una sola vez.
          </Callout>
          <Button
            label="Compartir"
            icon="share-outline"
            onPress={() =>
              Share.share({
                message: `Tu código para recuperar el acceso a CheluisFIT: ${code.code}\nEn la app: Entrar → «¿Has olvidado la contraseña?» → «Tengo un código». Vale 24 horas.`,
              })
            }
          />
        </View>
      ) : members === null ? (
        <Text variant="body" color="muted">
          Cargando…
        </Text>
      ) : members.length === 0 ? (
        <Text variant="body" color="muted">
          No hay nadie más en el hogar.
        </Text>
      ) : (
        <ActionList>
          {members.map((m) => (
            <ActionRow key={m.id} testID={`reset-${m.email}`} icon="person-outline" label={m.name} hint={m.email} onPress={() => generate(m)} />
          ))}
        </ActionList>
      )}
    </BottomSheet>
  );
}

export function AccountSection() {
  const user = useAuth((s) => s.user);
  const token = useAuth((s) => s.token);
  const logout = useAuth((s) => s.logout);
  const lastSyncedAt = useAuth((s) => s.lastSyncedAt);
  const syncing = useAuth((s) => s.syncing);
  const syncError = useAuth((s) => s.syncError);
  const syncNotice = useAuth((s) => s.syncNotice);
  const [invite, setInvite] = useState<{ code: string; expiresAt: number } | null>(null);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  return (
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
            <Button testID="go-edit-social-profile" label="Editar perfil público" icon="create-outline" variant="secondary" size="sm" onPress={() => router.push("/social/editar-perfil")} />
            <Button testID="go-account-data" label="Datos de la cuenta" icon="key-outline" variant="secondary" size="sm" onPress={() => router.push("/cuenta-datos")} />
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
                <Button testID="open-reset-access" label="Restablecer un acceso" icon="key-outline" variant="secondary" size="sm" onPress={() => setResetOpen(true)} />
              </View>
            </View>
          ) : null}
          <ResetAccessSheet visible={resetOpen} onClose={() => setResetOpen(false)} />
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
  );
}
