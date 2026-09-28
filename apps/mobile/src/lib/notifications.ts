// Carga de `expo-notifications` compartida por `restTimer.ts` y `reminders.ts`: se carga a mano
// y solo fuera de Expo Go — en Expo Go de Android, con solo importarlo (SDK 53+) lanza un error
// que tira toda la app. En Expo Go y en la web no hay notificaciones reales; en un APK o
// *development build* sí funcionan.
import Constants, { ExecutionEnvironment } from "expo-constants";
import type * as NotificationsModule from "expo-notifications";
import { Platform } from "react-native";

let cached: typeof NotificationsModule | null | undefined;

export function loadNotifications(): typeof NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (Platform.OS === "web" || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("expo-notifications") as typeof NotificationsModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** ¿Hay notificaciones reales en este entorno? (No en Expo Go ni en la web.) */
export const notificationsAvailable = () => loadNotifications() !== null;
