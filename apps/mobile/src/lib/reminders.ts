// Recordatorios más allá del descanso: un entrenamiento planificado que se acerca, o que no se
// ha registrado ninguna comida en el día. Misma infraestructura ya resuelta en `notifications.ts`
// (carga condicional fuera de Expo Go) y mismo estilo que `restTimer.ts`.
import { Platform } from "react-native";
import { loadNotifications } from "./notifications";

const WORKOUT_CHANNEL = "workout-reminders";
const MEAL_CHANNEL = "meal-reminders";
const MEAL_REMINDER_ID = "meal-reminder-daily";
const MEAL_HOUR = 21;

let setup: Promise<boolean> | null = null;

/** Canales Android y permiso de notificaciones (comparte el permiso general con el descanso, pero puede pedirse aparte si nunca se usó). */
export function ensureReminderNotifications(): Promise<boolean> {
  const N = loadNotifications();
  if (!N) return Promise.resolve(false);
  if (!setup) {
    setup = (async () => {
      try {
        if (Platform.OS === "android") {
          await N.setNotificationChannelAsync(WORKOUT_CHANNEL, { name: "Entrenamiento planificado", importance: N.AndroidImportance.DEFAULT });
          await N.setNotificationChannelAsync(MEAL_CHANNEL, { name: "Registrar comidas", importance: N.AndroidImportance.DEFAULT });
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
 * Aviso la mañana del entrenamiento planificado (8:00 hora local), identificado por el id del
 * propio plan — programar dos veces con el mismo id sustituye el aviso anterior (se cancela
 * antes de crear el nuevo, sin fiarse de un comportamiento no documentado de la librería).
 * No hace nada si la fecha ya pasó o la librería no está disponible (Expo Go, web).
 */
export async function scheduleWorkoutReminder(plannedId: string, dateKey: string, title: string): Promise<void> {
  const N = loadNotifications();
  if (!N) return;
  const identifier = `workout-${plannedId}`;
  try {
    await N.cancelScheduledNotificationAsync(identifier);
  } catch {
    /* no existía todavía */
  }
  const [y, m, d] = dateKey.split("-").map(Number);
  const at = new Date(y!, m! - 1, d!, 8, 0, 0);
  if (at.getTime() <= Date.now() + 60_000) return; // ya pasó o es dentro de un minuto, no vale la pena
  if (!(await ensureReminderNotifications())) return;
  try {
    await N.scheduleNotificationAsync({
      identifier,
      content: { title: "Hoy toca entrenar", body: title, sound: true },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: at, channelId: WORKOUT_CHANNEL },
    });
  } catch {
    /* sin permiso o fallo del sistema — no bloquea el resto de la app */
  }
}

/**
 * Deja programados exactamente los avisos de los planes futuros: cancela cualquier `workout-*`
 * que quede (de planes borrados, de una plantilla eliminada…) y programa los que falten (planes
 * bajados de la cuenta en un móvil nuevo, «Deshacer» de quitar un plan). **No pide permiso**: se
 * llama al arrancar y tras sincronizar, momentos en que un diálogo del sistema molestaría; el
 * permiso se pide al planificar (`scheduleWorkoutReminder`).
 */
export async function resyncWorkoutReminders(planned: readonly { id: string; date: string; templateId: string }[], titleFor: (templateId: string) => string): Promise<void> {
  const N = loadNotifications();
  if (!N) return;
  try {
    const perm = await N.getPermissionsAsync();
    const scheduled = await N.getAllScheduledNotificationsAsync();
    const wanted = new Map(
      planned
        .filter((p) => {
          const [y, m, d] = p.date.split("-").map(Number);
          return new Date(y!, m! - 1, d!, 8, 0, 0).getTime() > Date.now() + 60_000;
        })
        .map((p): [string, (typeof planned)[number]] => [`workout-${p.id}`, p]),
    );
    for (const n of scheduled) {
      if (n.identifier.startsWith("workout-") && !wanted.has(n.identifier)) await N.cancelScheduledNotificationAsync(n.identifier);
    }
    if (!perm.granted) return;
    const have = new Set(scheduled.map((n) => n.identifier));
    for (const [identifier, p] of wanted) {
      if (!have.has(identifier)) await scheduleWorkoutReminder(p.id, p.date, titleFor(p.templateId));
    }
  } catch {
    /* best-effort, como el resto de avisos */
  }
}

export async function cancelWorkoutReminder(plannedId: string): Promise<void> {
  const N = loadNotifications();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(`workout-${plannedId}`);
  } catch {
    /* ya no existía */
  }
}

/**
 * Aviso diario repetido a las 21:00 si no se ha registrado ninguna comida — simple a propósito:
 * un recordatorio programado por adelantado no puede saber de verdad si ese día se registró algo
 * (eso exigiría reprogramar cada día con la app abierta), así que se acepta el mismo compromiso
 * que cualquier recordatorio de una app de dieta normal: avisa siempre a esa hora, se ignora si
 * ya no hace falta.
 */
export async function setMealReminder(enabled: boolean): Promise<void> {
  const N = loadNotifications();
  if (!N) return;
  try {
    await N.cancelScheduledNotificationAsync(MEAL_REMINDER_ID);
  } catch {
    /* no existía */
  }
  if (!enabled) return;
  if (!(await ensureReminderNotifications())) return;
  try {
    await N.scheduleNotificationAsync({
      identifier: MEAL_REMINDER_ID,
      content: { title: "¿Has registrado hoy?", body: "No se te olvide anotar tus comidas de hoy.", sound: true },
      trigger: { type: N.SchedulableTriggerInputTypes.DAILY, hour: MEAL_HOUR, minute: 0, channelId: MEAL_CHANNEL },
    });
  } catch {
    /* sin permiso o fallo del sistema */
  }
}
