import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Button, Callout, FieldGroup, SegmentedControl, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { ApiError } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { useOnboarding } from "@/data/onboardingStore";
import { space } from "@/theme/tokens";

type Mode = "login" | "register";

/**
 * Iniciar sesión o crear la cuenta. La primera cuenta del servidor pide el código de
 * configuración; el resto, una invitación. Al entrar/crear cuenta, `login()`/`register()`
 * (`authStore.ts`) ya bajan solos los datos reales de la cuenta — esta pantalla no pregunta nada
 * más, solo confirma y sale.
 */
export default function AccountScreen() {
  const login = useAuth((s) => s.login);
  const register = useAuth((s) => s.register);
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [setupCode, setSetupCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dismiss = () => {
    useOnboarding.getState().markSeen();
    router.canGoBack() ? router.back() : router.replace("/");
  };

  const submit = async () => {
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email.trim().toLowerCase(), password);
      } else {
        await register({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password,
          setupCode: setupCode.trim() || undefined,
          inviteCode: inviteCode.trim() || undefined,
        });
      }
      toast(mode === "login" ? "Sesión iniciada" : "Cuenta creada");
      dismiss();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo conectar con el servidor. Comprueba tu conexión.");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = email.trim() !== "" && password !== "" && (mode === "login" || name.trim() !== "");

  return (
    <Screen
      variant="form"
      testID="screen-cuenta"
      footer={
        <View style={{ gap: space.sm }}>
          <Button testID="account-submit" label={mode === "login" ? "Entrar" : "Crear cuenta"} size="lg" fullWidth disabled={!canSubmit || busy} onPress={submit} />
          {onboarding === "1" ? <Button testID="skip-account" label="Seguir sin cuenta" variant="ghost" fullWidth onPress={dismiss} /> : null}
        </View>
      }
    >
      <ScreenHeader title="Cuenta" subtitle="Para que tus entrenos y fotos se guarden en el servidor" back onBack={dismiss} />
      <View style={{ gap: space.lg }}>
        <SegmentedControl<Mode>
          value={mode}
          onChange={(m) => {
            setMode(m);
            setError(null);
          }}
          options={[
            { value: "login", label: "Entrar" },
            { value: "register", label: "Crear cuenta" },
          ]}
        />

        {error ? (
          <Callout tone="danger" icon="alert-circle" testID="account-error">
            {error}
          </Callout>
        ) : null}

        {mode === "register" ? <TextField testID="account-name" label="Tu nombre" value={name} onChangeText={setName} placeholder="Chelu" /> : null}
        <TextField testID="account-email" label="Correo" value={email} onChangeText={setEmail} placeholder="tu@correo.es" keyboardType="email-address" autoCapitalize="none" />
        <TextField
          testID="account-password"
          label="Contraseña"
          value={password}
          onChangeText={setPassword}
          placeholder={mode === "register" ? "Mínimo 8 caracteres" : undefined}
          secureTextEntry
          autoCapitalize="none"
        />

        {mode === "register" ? (
          <FieldGroup label="Cómo entras" hint="La primera cuenta del servidor usa el código de configuración; el resto, una invitación de quien ya esté dentro.">
            <TextField testID="account-setup" label="Código de configuración" value={setupCode} onChangeText={setSetupCode} placeholder="Solo la primera vez" />
            <TextField testID="account-invite" label="Código de invitación" value={inviteCode} onChangeText={setInviteCode} placeholder="Si te ha invitado alguien" autoCapitalize="characters" />
          </FieldGroup>
        ) : null}

        <Text variant="caption" color="faint">
          Sin conexión, la app sigue funcionando igual: lo que registres se guarda en el móvil y se sube solo en cuanto haya red.
        </Text>
      </View>
    </Screen>
  );
}
