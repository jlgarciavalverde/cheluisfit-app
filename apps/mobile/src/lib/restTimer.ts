import { Platform } from "react-native";
import { loadNotifications, notificationsAvailable } from "./notifications";

const CHANNEL = "rest";
const notifications = loadNotifications;

/** ¿Hay notificaciones reales en este entorno? (No en Expo Go ni en la web.) */
export const restNotificationsAvailable = notificationsAvailable;

let setup: Promise<boolean> | null = null;

/** Canal Android y permiso de notificaciones (se pide la primera vez que arranca un descanso). */
export function ensureRestNotifications(): Promise<boolean> {
  const N = notifications();
  if (!N) return Promise.resolve(false);
  if (!setup) {
    setup = (async () => {
      try {
        N.setNotificationHandler({
          // En primer plano ya avisa la propia pantalla (vibración + barra).
          handleNotification: async () => ({
            shouldShowBanner: false,
            shouldShowList: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
          }),
        });
        if (Platform.OS === "android") {
          await N.setNotificationChannelAsync(CHANNEL, {
            name: "Fin de descanso",
            importance: N.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 200, 250],
          });
        }
        const cur = await N.getPermissionsAsync();
        if (cur.granted) return true;
        if (!cur.canAskAgain) return false;
        return (await N.requestPermissionsAsync()).granted;
      } catch {
        return false;
      }
    })();
  }
  return setup;
}

/** Programa el aviso de fin de descanso; devuelve el id para poder cancelarlo. */
export async function scheduleRestNotification(endsAtMs: number, body: string): Promise<string | null> {
  const N = notifications();
  if (!N || endsAtMs <= Date.now() + 500) return null;
  if (!(await ensureRestNotifications())) return null;
  try {
    return await N.scheduleNotificationAsync({
      content: { title: "Descanso terminado", body, sound: true },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(endsAtMs), channelId: CHANNEL },
    });
  } catch {
    return null;
  }
}

export async function cancelRestNotification(id: string | null): Promise<void> {
  const N = notifications();
  if (!id || !N) return;
  try {
    await N.cancelScheduledNotificationAsync(id);
  } catch {
    /* ya no existe */
  }
}
