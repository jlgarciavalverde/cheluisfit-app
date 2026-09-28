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

/**
 * Identificador fijo: solo hay un descanso a la vez. Antes el id lo generaba el sistema y se
 * guardaba en memoria; si la app se cerraba durante un descanso, al volver se programaba otro sin
 * poder cancelar el primero (sonaba dos veces, o aunque se hubiera saltado el descanso).
 */
const REST_ID = "rest-timer";

/** Programa (o reprograma) el aviso de fin de descanso. */
export async function scheduleRestNotification(endsAtMs: number, body: string): Promise<void> {
  const N = notifications();
  if (!N) return;
  await cancelRestNotification();
  if (endsAtMs <= Date.now() + 500) return;
  if (!(await ensureRestNotifications())) return;
  try {
    await N.scheduleNotificationAsync({
      identifier: REST_ID,
      content: { title: "Descanso terminado", body, sound: true, data: { kind: "rest" } },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: new Date(endsAtMs), channelId: CHANNEL },
    });
  } catch {
    /* sin permiso o fallo del sistema */
  }
}

export async function cancelRestNotification(): Promise<void> {
  const N = notifications();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(REST_ID);
  } catch {
    /* ya no existe */
  }
}
