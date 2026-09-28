// Captura de foto para las llamadas de IA con visión (Nevera, escaneo de producto). Mismo
// patrón ya probado en `social/publicar.tsx`: cámara vía `expo-image-picker` (no
// `expo-camera`, que en este proyecto solo se usa para escanear códigos de barras) + reencode a
// JPEG con `expo-image-manipulator`, porque el formato original del sensor puede no ser uno que
// el servidor acepte.
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { toast } from "@/components/ui/Toast";

// Una foto de cámara real ronda los 3000-4000 px de lado y varios MB, muy por encima de lo que
// necesita un modelo de visión (y por encima del límite del servidor, `MAX_IMAGE_BYTES` en
// `vision.ts`) — sin redimensionar, una subida así puede tardar tanto en una red móvil normal
// que el `AbortController` la corta antes de llegar al servidor (visto de verdad: cero peticiones
// en los registros del servidor pese a un intento real en el móvil). 960 px de lado es de sobra
// para que Gemini lea una etiqueta o reconozca ingredientes, y la subida pesa ~200 KB: sale bien
// incluso en datos móviles (verificado contra el servidor real: respuesta en ~2 s).
const MAX_SIDE = 960;

export async function captureAiPhoto(): Promise<string | null> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      toast("Necesito permiso para usar la cámara");
      return null;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled) return null;
    const { uri, width, height } = result.assets[0];
    // Por el lado largo (una foto vertical saldría de 960×1280 si se fijara solo el ancho) y
    // nunca ampliando una foto que ya es pequeña. Sin dimensiones conocidas, se fija el ancho.
    const long = Math.max(width ?? 0, height ?? 0);
    const resize = !long ? [{ resize: { width: MAX_SIDE } }] : long <= MAX_SIDE ? [] : [{ resize: width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE } }];
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      resize,
      { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG },
    );
    return manipulated.uri;
  } catch {
    // Un fallo real del picker/cámara nativa no debe dejar la pantalla en un estado raro
    // (promesa sin capturar) — mismo criterio que `callNative()` en `healthConnect.ts`.
    toast("No se pudo hacer la foto. Prueba otra vez.");
    return null;
  }
}
