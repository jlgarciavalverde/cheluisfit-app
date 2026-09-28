import { router } from "expo-router";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { EmptyState, Skeleton } from "@/components/ui";
import { radius, space } from "@/theme/tokens";

/**
 * Estados de pantalla completos para las pantallas sociales (que dependen del servidor): sin
 * sesión o cargando, siempre con cabecera y «atrás» — antes devolvían `null` y la pantalla se
 * quedaba en blanco, sin forma de volver salvo el gesto del sistema.
 */
export function SignedOutScreen({ title, testID }: { title: string; testID?: string }) {
  return (
    <Screen testID={testID}>
      <ScreenHeader title={title} back />
      <EmptyState icon="person-circle-outline" title="Inicia sesión para ver esto" text="Lo social necesita tu cuenta de CheluisFIT." actionLabel="Entrar" onAction={() => router.push("/cuenta")} />
    </Screen>
  );
}

export function LoadingScreen({ title, testID }: { title: string; testID?: string }) {
  return (
    <Screen testID={testID}>
      <ScreenHeader title={title} back />
      <View style={{ gap: space.md }} accessibilityLabel="Cargando" accessibilityRole="progressbar">
        <Skeleton style={{ height: 96, borderRadius: radius.lg }} />
        <Skeleton style={{ height: 180, borderRadius: radius.lg }} />
        <Skeleton style={{ height: 180, borderRadius: radius.lg }} />
      </View>
    </Screen>
  );
}
