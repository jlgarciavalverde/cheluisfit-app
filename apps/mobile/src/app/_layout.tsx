import {
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from "@expo-google-fonts/barlow-condensed";
import {
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
  useFonts,
} from "@expo-google-fonts/figtree";
import { Redirect, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AiAssistant } from "@/components/ai/AiAssistant";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { RestNotifier } from "@/components/strength/RestNotifier";
import { WorkoutBar } from "@/components/strength/WorkoutBar";
import { toast, ToastHost } from "@/components/ui/Toast";
import { useAuth } from "@/data/authStore";
import { useStoresHydrated } from "@/data/hydration";
import { useOnboarding } from "@/data/onboardingStore";
import { useAutoSync } from "@/data/useAutoSync";
import { ThemeProvider, useBreakpoint, useTheme } from "@/theme/ThemeProvider";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Shell() {
  const { c, scheme } = useTheme();
  const { isWide } = useBreakpoint();
  const token = useAuth((s) => s.token);
  const onboardingSeen = useOnboarding((s) => s.seen);
  useAutoSync();
  // Aviso de la sincronización (p. ej. ganó la versión de la cuenta y lo local quedó guardado en
  // Más): se enseña una vez como toast y se limpia; la copia recuperable sigue en Más → Cuenta.
  const syncNotice = useAuth((s) => s.syncNotice);
  useEffect(() => {
    if (!syncNotice) return;
    toast(syncNotice);
    useAuth.getState().setSyncState({ syncNotice: null });
  }, [syncNotice]);
  return (
    <>
      {/* Primer arranque, sin sesión: entrar/registrarse sale antes que nada, no escondido en
          Más. Solo una vez por dispositivo — «Seguir sin cuenta» en `/cuenta` marca `seen`. */}
      {!token && !onboardingSeen ? <Redirect href="/cuenta?onboarding=1" /> : null}
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <View style={{ flex: 1, flexDirection: isWide ? "row" : "column" }}>
        {isWide ? <DesktopSidebar /> : null}
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: "slide_from_right" }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="cuenta" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
            <Stack.Screen name="anadir" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
            <Stack.Screen name="escaner" options={{ presentation: "fullScreenModal", animation: "fade" }} />
            <Stack.Screen name="escaner-foto" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
            <Stack.Screen name="alimento/[id]" />
            <Stack.Screen name="crear-alimento" />
            <Stack.Screen name="objetivo" />
            <Stack.Screen name="peso" />
            <Stack.Screen name="medidas" />
            <Stack.Screen name="nevera" />
            <Stack.Screen name="ejercicio/[id]" />
            <Stack.Screen name="crear-ejercicio" />
            <Stack.Screen name="rutina/[id]" />
            <Stack.Screen name="entreno/[id]" options={{ animation: "slide_from_bottom", gestureEnabled: false }} />
            <Stack.Screen name="entreno/resumen/[id]" options={{ gestureEnabled: false }} />
            <Stack.Screen name="entreno/detalle/[id]" />
            <Stack.Screen name="sesion/nueva" />
            <Stack.Screen name="plantilla/[id]" />
            <Stack.Screen name="sesion/[id]" />
            <Stack.Screen name="social/publicar" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
            <Stack.Screen name="social/post/[id]" />
            <Stack.Screen name="social/perfil/[username]" />
            <Stack.Screen name="social/buscar" />
          </Stack>
          <WorkoutBar />
        </View>
      </View>
      <RestNotifier />
      <ToastHost />
      <AiAssistant />
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });
  const hydrated = useStoresHydrated();
  const ready = (loaded || !!error) && hydrated;
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  if (!ready) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <Shell />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
