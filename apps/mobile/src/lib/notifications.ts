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
    installForegroundHandler(cached);
  } catch {
    cached = null;
  }
  return cached;
}

/**
 * Qué hacer con una notificación que llega con la app abierta. Un único manejador para todas (antes
 * lo registraba el descanso y escondía también los recordatorios de comidas y entrenos): se ven
 * todas, salvo la de fin de descanso **mientras se ve la barra de descanso** (`RestBar` ya avisa
 * con vibración y la cuenta atrás). En otra pestaña, el aviso de descanso sí sale.
 */
let restScreenVisible = false;
export function setRestScreenVisible(visible: boolean): void {
  restScreenVisible = visible;
}
export const isRestScreenVisible = () => restScreenVisible;

function installForegroundHandler(N: typeof NotificationsModule) {
  try {
    N.setNotificationHandler({
      handleNotification: async (n) => {
        const hide = n.request.content.data?.kind === "rest" && restScreenVisible;
        return { shouldShowBanner: !hide, shouldShowList: !hide, shouldPlaySound: !hide, shouldSetBadge: false };
      },
    });
  } catch {
    // sin manejador se usa el comportamiento por defecto del sistema
  }
}

/** ¿Hay notificaciones reales en este entorno? (No en Expo Go ni en la web.) */
export const notificationsAvailable = () => loadNotifications() !== null;
