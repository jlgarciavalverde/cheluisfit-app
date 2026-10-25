import { useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { SignedOutScreen } from "@/components/social/ScreenStates";
import { Button, Callout, Section, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { api, ApiError } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { space } from "@/theme/tokens";

/**
 * Datos **privados** de la cuenta: nombre real, correo y contraseña. No cambian nada de lo que
 * se ve en Social (eso es el perfil público, `social/editar-perfil.tsx`).
 */
export default function AccountDataScreen() {
  const token = useAuth((s) => s.token);
  const user = useAuth((s) => s.user);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [changing, setChanging] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);

  if (!token || !user) return <SignedOutScreen title="Datos de la cuenta" testID="screen-cuenta-datos" />;

  const dirty = name.trim() !== user.name || email.trim().toLowerCase() !== user.email;

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.updateMe(token, { name: name.trim(), email: email.trim().toLowerCase() });
      useAuth.setState({ user: r.user });
      toast("Datos de la cuenta guardados");
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    setChanging(true);
    setPwError(null);
    try {
      await api.changePassword(token, current, next);
      setCurrent("");
      setNext("");
      toast("Contraseña cambiada. Las demás sesiones se han cerrado.");
    } catch (e) {
      setPwError(e instanceof ApiError ? e.message : "No se pudo cambiar la contraseña");
    } finally {
      setChanging(false);
    }
  };

  return (
    <Screen variant="form" testID="screen-cuenta-datos">
      <ScreenHeader title="Datos de la cuenta" subtitle="Privado: solo lo ves tú" back />
      <View style={{ gap: space.xl }}>
        <Callout tone="neutral" icon="lock-closed-outline" dense>
          Esto no se enseña en Social. Lo que ven los demás se cambia en «Editar perfil» de Social.
        </Callout>
        <Section title="Cuenta" kind="overline" gap={space.md}>
          <TextField testID="account-name" label="Nombre real" value={name} onChangeText={setName} maxLength={80} autoComplete="name" />
          <TextField
            testID="account-email-edit"
            label="Correo"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            maxLength={200}
            hint="Con él inicias sesión"
          />
          <Button testID="save-account" label="Guardar cambios" disabled={!dirty || !name.trim() || !email.includes("@")} loading={saving} onPress={save} />
        </Section>
        <Section title="Contraseña" kind="overline" gap={space.md}>
          <TextField testID="password-current" label="Contraseña actual" value={current} onChangeText={setCurrent} secureTextEntry autoComplete="current-password" error={pwError ?? undefined} />
          <TextField
            testID="password-new"
            label="Contraseña nueva"
            value={next}
            onChangeText={setNext}
            secureTextEntry
            autoComplete="new-password"
            hint="Mínimo 8 caracteres"
            error={next && next.length < 8 ? "Mínimo 8 caracteres" : undefined}
          />
          <Button testID="change-password" label="Cambiar contraseña" variant="secondary" disabled={!current || next.length < 8} loading={changing} onPress={changePassword} />
        </Section>
      </View>
    </Screen>
  );
}
