import { router, type ErrorBoundaryProps } from "expo-router";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { Button, EmptyState, Text } from "@/components/ui";
import { ThemeProvider } from "@/theme/ThemeProvider";
import { space } from "@/theme/tokens";

/**
 * Lo que se ve si una pantalla revienta al pintarse (Expo Router usa el `ErrorBoundary` que
 * exporta cada layout). Sin esto, en el APK la app se cerraba y en la web quedaba en blanco.
 * Lleva sus propios proveedores: sustituye al layout entero, así que no hereda los del árbol.
 * Los datos no se tocan: están guardados y siguen ahí al reintentar.
 */
export function ErrorScreen({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Screen testID="screen-error" reportChrome={false}>
          <View style={{ gap: space.lg, paddingTop: space.xxl }}>
            <EmptyState
              icon="bug-outline"
              title="Algo ha fallado en esta pantalla"
              text="Tus datos están a salvo. Prueba otra vez o vuelve al inicio."
              actionLabel="Reintentar"
              onAction={retry}
            />
            <Button
              label="Volver a Hoy"
              variant="secondary"
              fullWidth
              onPress={() => {
                router.replace("/");
                retry();
              }}
            />
            <Text variant="caption" color="faint" selectable>
              {error.message}
            </Text>
          </View>
        </Screen>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
