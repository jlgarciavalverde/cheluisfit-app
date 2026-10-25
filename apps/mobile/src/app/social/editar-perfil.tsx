import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Avatar } from "@/components/social/Avatar";
import { LoadingScreen, SignedOutScreen } from "@/components/social/ScreenStates";
import { Button, Callout, CheckRow, Chip, ChipRow, EmptyState, FieldGroup, ListGroup, ListRow, Section, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api, ApiError, type MySocialProfile } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { uploadProfileStats } from "@/data/socialStats";
import { SPORT_LABEL, SPORTS, type Sport } from "@/domain/sports";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";

const USERNAME_RE = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/;

interface Draft {
  displayName: string;
  username: string;
  bio: string;
  city: string;
  sports: string[];
  isPrivate: boolean;
  hidden: string[];
  avatar: { id: string | null; url?: string };
  cover: { id: string | null; url?: string };
}

function draftFrom(p: MySocialProfile): Draft {
  return {
    displayName: p.displayName,
    username: p.username,
    bio: p.bio,
    city: p.city,
    sports: p.sports,
    isPrivate: p.isPrivate,
    hidden: p.stats.filter((s) => !s.visible).map((s) => s.key),
    avatar: { id: p.avatarMediaId, url: p.avatarUrl },
    cover: { id: p.coverMediaId, url: p.coverUrl },
  };
}

/** Elige una foto, la recorta y la sube (JPEG siempre: un HEIC de iPhone daría 415, ver AGENTS.md). */
async function pickAndUpload(token: string, aspect: [number, number]): Promise<{ id: string; url: string } | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    toast("Necesito permiso para ver tus fotos");
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8, allowsEditing: true, aspect });
  if (result.canceled) return null;
  const asset = result.assets[0]!;
  const jpeg = await ImageManipulator.manipulateAsync(asset.uri, [{ resize: aspect[0] > aspect[1] ? { width: 1500 } : { width: 800 } }], {
    compress: 0.8,
    format: ImageManipulator.SaveFormat.JPEG,
  });
  return api.uploadMedia(token, jpeg.uri, "perfil.jpg", "image/jpeg");
}

/**
 * Editar el perfil público de Social — **lo que ven los demás** — separado de lo privado (la
 * cuenta y los datos de salud, que nunca salen en Social y se editan en sus propias pantallas).
 */
export default function EditSocialProfileScreen() {
  const token = useAuth((s) => s.token);
  const { c } = useTheme();
  const [original, setOriginal] = useState<MySocialProfile | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "cover" | null>(null);

  const load = async () => {
    if (!token) return;
    setError(null);
    // Antes de enseñar las tarjetas, sube el resumen al día (sin cambios no sube nada).
    await uploadProfileStats(true).catch(() => {});
    try {
      const p = await api.socialMyProfile(token);
      setOriginal(p);
      setDraft(draftFrom(p));
    } catch {
      setError("No se pudo cargar tu perfil.");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const dirty = useMemo(() => !!original && !!draft && JSON.stringify(draftFrom(original)) !== JSON.stringify(draft), [original, draft]);

  if (!token) return <SignedOutScreen title="Editar perfil" testID="screen-editar-perfil" />;
  if (error) {
    return (
      <Screen testID="screen-editar-perfil">
        <ScreenHeader title="Editar perfil" back />
        <EmptyState icon="cloud-offline-outline" title={error} actionLabel="Reintentar" onAction={load} />
      </Screen>
    );
  }
  if (!draft || !original) return <LoadingScreen title="Editar perfil" testID="screen-editar-perfil" />;

  const set = (patch: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const usernameValid = USERNAME_RE.test(draft.username);
  const valid = draft.displayName.trim().length > 0 && usernameValid;

  const changePhoto = async (which: "avatar" | "cover") => {
    setUploading(which);
    try {
      const up = await pickAndUpload(token, which === "avatar" ? [1, 1] : [3, 1]);
      if (up) set({ [which]: { id: up.id, url: up.url } } as Partial<Draft>);
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo subir la foto");
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    setUsernameError(null);
    try {
      await api.socialUpdateProfile(token, {
        displayName: draft.displayName.trim(),
        bio: draft.bio.trim(),
        city: draft.city.trim(),
        sports: draft.sports,
        isPrivate: draft.isPrivate,
        hiddenStats: draft.hidden,
        avatarMediaId: draft.avatar.id,
        coverMediaId: draft.cover.id,
        ...(draft.username !== original.username ? { username: draft.username } : {}),
      });
      toast("Perfil guardado");
      router.back();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) setUsernameError(e.message);
      else toast(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      variant="form"
      testID="screen-editar-perfil"
      footer={<Button testID="save-profile" label="Guardar cambios" size="lg" fullWidth disabled={!dirty || !valid} loading={saving} onPress={save} />}
    >
      <ScreenHeader title="Editar perfil" subtitle="Lo que ven los demás en Social" back />
      <View style={{ gap: space.xl }}>
        <Section title="Fotos" kind="overline" gap={space.md}>
          <View>
            {draft.cover.url ? (
              <Image source={{ uri: draft.cover.url }} contentFit="cover" accessibilityLabel="Foto de portada" style={{ height: 120, borderRadius: radius.lg }} />
            ) : (
              <View style={{ height: 120, borderRadius: radius.lg, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}>
                <Text variant="caption" color="brandText">
                  Sin foto de portada
                </Text>
              </View>
            )}
            <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm, flexWrap: "wrap" }}>
              <Button testID="change-cover" label="Cambiar portada" icon="image-outline" size="sm" variant="secondary" loading={uploading === "cover"} onPress={() => changePhoto("cover")} />
              {draft.cover.id ? <Button label="Quitar portada" size="sm" variant="ghost" onPress={() => set({ cover: { id: null } })} /> : null}
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Avatar name={draft.displayName || "?"} url={draft.avatar.url} size="lg" />
            <View style={{ flex: 1, gap: space.sm }}>
              <Button testID="change-avatar" label="Cambiar foto" icon="camera-outline" size="sm" variant="secondary" loading={uploading === "avatar"} onPress={() => changePhoto("avatar")} />
              {draft.avatar.id ? <Button label="Quitar foto" size="sm" variant="ghost" onPress={() => set({ avatar: { id: null } })} /> : null}
            </View>
          </View>
        </Section>

        <Section title="Sobre ti" kind="overline" gap={space.md}>
          <TextField
            testID="profile-display-name-input"
            label="Nombre público"
            hint="Puede ser un apodo; tu nombre real de la cuenta no se enseña"
            value={draft.displayName}
            onChangeText={(t) => set({ displayName: t })}
            maxLength={40}
            error={draft.displayName.trim() ? undefined : "Pon un nombre"}
          />
          <TextField
            testID="profile-username-input"
            label="Nombre de usuario"
            hint={draft.username !== original.username ? "Si lo cambias, los enlaces antiguos a tu perfil dejarán de funcionar" : "Con él te encuentran en el buscador"}
            value={draft.username}
            onChangeText={(t) => {
              setUsernameError(null);
              set({ username: t.toLowerCase().replace(/\s+/g, "-") });
            }}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={30}
            error={usernameError ?? (usernameValid ? undefined : "Solo minúsculas, números y guiones (3 a 30)")}
          />
          <TextField
            testID="profile-bio-input"
            label="Biografía"
            hint={`${draft.bio.length}/300`}
            value={draft.bio}
            onChangeText={(t) => set({ bio: t })}
            placeholder="Cuéntanos algo de ti"
            multiline
            maxLength={300}
            style={{ minHeight: 72, textAlignVertical: "top" }}
          />
          <TextField testID="profile-city-input" label="Ciudad (opcional)" value={draft.city} onChangeText={(t) => set({ city: t })} placeholder="Ej.: Murcia" maxLength={40} />
          <FieldGroup label="Deportes que practicas">
            <ChipRow wrap>
              {SPORTS.map((s: Sport) => {
                const on = draft.sports.includes(s);
                return (
                  <Chip
                    key={s}
                    testID={`sport-${s}`}
                    label={SPORT_LABEL[s]}
                    selected={on}
                    onPress={() => set({ sports: on ? draft.sports.filter((x) => x !== s) : [...draft.sports, s] })}
                  />
                );
              })}
            </ChipRow>
          </FieldGroup>
        </Section>

        <Section title="Estadísticas que se enseñan" kind="overline" gap={space.sm}>
          {original.stats.length === 0 ? (
            <Text variant="body" color="muted">
              Aún no hay estadísticas: aparecerán cuando registres carreras o entrenos y se sincronicen.
            </Text>
          ) : (
            <>
              <Text variant="caption" color="muted">
                Se calculan solas con tus carreras y entrenos. Nunca se enseña tu peso, medidas ni comidas.
              </Text>
              {original.stats.map((s) => (
                <CheckRow
                  key={s.key}
                  testID={`stat-${s.key}`}
                  label={`${s.label}: ${s.value}${s.unit ? ` ${s.unit}` : ""}`}
                  hint={s.detail}
                  checked={!draft.hidden.includes(s.key)}
                  onChange={(on) => set({ hidden: on ? draft.hidden.filter((k) => k !== s.key) : [...draft.hidden, s.key] })}
                />
              ))}
            </>
          )}
        </Section>

        <Section title="Privacidad" kind="overline" gap={space.sm}>
          <CheckRow
            testID="profile-private"
            kind="switch"
            label="Cuenta privada"
            hint={draft.isPrivate ? "Solo tus seguidores aceptados ven tus publicaciones, bio y estadísticas" : "Cualquiera de la app puede ver tus publicaciones"}
            checked={draft.isPrivate}
            onChange={(v) => set({ isPrivate: v })}
          />
          {original.isPrivate && !draft.isPrivate ? (
            <Callout tone="neutral" icon="information-circle-outline" dense>
              Al pasar a pública se aceptan las solicitudes pendientes.
            </Callout>
          ) : null}
        </Section>

        <Section title="Privado: solo lo ves tú" kind="overline" gap={space.sm}>
          <Callout tone="neutral" icon="lock-closed-outline" dense>
            Tu nombre real, tu correo y tus datos de salud (peso, edad, comidas) nunca se enseñan en Social.
          </Callout>
          <ListGroup>
            <ListRow icon="key-outline" title="Datos de la cuenta" subtitle="Nombre real, correo y contraseña" chevron onPress={() => router.push("/cuenta-datos")} testID="go-account-data" />
            <ListRow icon="body-outline" title="Datos personales y objetivo" subtitle="Edad, peso, altura y objetivo de nutrición" chevron onPress={() => router.push("/objetivo")} />
          </ListGroup>
        </Section>

        <Button
          testID="preview-profile"
          label="Ver mi perfil público"
          icon="eye-outline"
          variant="ghost"
          onPress={() => router.push({ pathname: "/social/perfil/[username]", params: { username: original.username } })}
        />
      </View>
    </Screen>
  );
}
