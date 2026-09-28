import { Linking } from "react-native";
import { Button, Callout, Text } from "@/components/ui";
import { useAppUpdate } from "@/data/appUpdate";
import { space } from "@/theme/tokens";

/** Aviso de APK nueva (ver `data/appUpdate.ts`); no pinta nada si la instalada es la última. */
export function UpdateCallout() {
  const available = useAppUpdate((s) => s.available);
  if (!available) return null;
  return (
    <Callout tone="brand" icon="cloud-download-outline" title={`Hay una versión nueva (${available.version})`} testID="update-callout">
      <Text variant="body">Descárgala e instálala encima: tus datos se conservan.</Text>
      <Button label="Descargar" icon="download-outline" size="sm" variant="secondary" style={{ marginTop: space.sm }} onPress={() => Linking.openURL(available.url)} />
    </Callout>
  );
}
