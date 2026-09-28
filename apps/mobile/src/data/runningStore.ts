import { create } from "zustand";
import { persist } from "zustand/middleware";
import { guardedJSONStorage, guardRehydrate } from "./persistSafety";
import { todayKey } from "@/domain/dates";
import { type Activity, applyTemplate, clearTemplate, cloneItems, matchPlanned, mergeImportedActivities, type Planned, type Template } from "@/domain/running";
import { compactRoute } from "@/domain/route";
import { api } from "./api";
import { importNewActivities } from "./healthConnect";
import { cancelWorkoutReminder, resyncWorkoutReminders, scheduleWorkoutReminder } from "@/lib/reminders";
import { SEED_TEMPLATES, seedActivities, seedPlanned } from "./runningSeed";

export interface RunningState {
  templates: Template[];
  activities: Activity[];
  planned: Planned[];
  lastSync: string | null;
  /** `true` tras conectar Strava una vez (ver `data/stravaAuth.ts`) — no implica que la última
   *  sincronización haya ido bien, solo que hay una cuenta de Strava enlazada. */
  stravaConnected: boolean;
  lastStravaSync: string | null;
  /** Fuente elegida para traer carreras/caminatas: Garmin vía Health Connect o Strava. */
  source: "garmin" | "strava";
  /**
   * `externalId` de actividades importadas que la persona borró: la sincronización relee con
   * 7 días de solape y, sin esta lista, volvería a traerlas como nuevas.
   */
  dismissedExternalIds: string[];

  saveTemplate: (t: Template) => void;
  deleteTemplate: (id: string) => Template | undefined;
  restoreTemplate: (t: Template) => void;
  planTemplate: (templateId: string, date: string) => string;
  unplan: (id: string) => Planned | undefined;
  restorePlanned: (p: Planned) => void;
  updateActivity: (id: string, patch: Partial<Pick<Activity, "notes" | "rpe" | "title" | "templateId" | "route">>) => void;
  duplicateTemplate: (id: string) => Template | undefined;
  addActivity: (a: Omit<Activity, "id">) => string;
  deleteActivity: (id: string) => Activity | undefined;
  restoreActivity: (a: Activity) => void;
  /** Vincula la sesión con una plantilla (guarda su copia) o la desvincula con `null`. */
  linkTemplate: (activityId: string, templateId: string | null) => void;
  /** Empareja los entrenamientos planificados ya pasados con las sesiones de su día. */
  relink: () => void;
  /**
   * Importa de Health Connect lo nuevo desde el último `lastSync`, sin duplicar (por
   * `externalId`), y devuelve cuántas actividades entraron. `lastSync` solo se actualiza si la
   * lectura tiene éxito — si falla, se queda como estaba para reintentar la misma ventana.
   */
  markSynced: () => Promise<number>;
  setSource: (s: "garmin" | "strava") => void;
  setStravaConnected: (connected: boolean) => void;
  /** Mismo patrón que `markSynced()`, pero contra `api.stravaSync` (ver `data/stravaAuth.ts` para conectar antes). */
  markStravaSynced: (token: string) => Promise<number>;
  resetDemo: () => void;
  /** Vacía de verdad (sin datos de ejemplo) — antes de sincronizar con una cuenta real. */
  startFresh: () => void;
}

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const empty = () => ({
  templates: [] as Template[],
  activities: [] as Activity[],
  planned: [] as Planned[],
  lastSync: null as string | null,
  stravaConnected: false,
  lastStravaSync: null as string | null,
  source: "garmin" as const,
  dismissedExternalIds: [] as string[],
});

const initial = () => ({
  templates: SEED_TEMPLATES,
  activities: seedActivities(),
  planned: seedPlanned(),
  lastSync: new Date().toISOString(),
  stravaConnected: false,
  lastStravaSync: null as string | null,
  source: "garmin" as const,
  dismissedExternalIds: [] as string[],
});

const resyncReminders = (s: Pick<RunningState, "planned" | "templates">) =>
  resyncWorkoutReminders(s.planned, (tid) => s.templates.find((t) => t.id === tid)?.name ?? "Entrenamiento").catch(() => {});

/** Tope de la lista de borradas: de sobra para la ventana de solape, sin crecer para siempre. */
const MAX_DISMISSED = 500;

export const useRunning = create<RunningState>()(
  persist(
    (set, get) => ({
      ...initial(),
      saveTemplate: (t) =>
        set((s) => ({
          templates: s.templates.some((x) => x.id === t.id)
            ? s.templates.map((x) => (x.id === t.id ? t : x))
            : [t, ...s.templates],
        })),
      deleteTemplate: (id) => {
        const found = get().templates.find((t) => t.id === id);
        if (found) {
          set((s) => ({
            templates: s.templates.filter((t) => t.id !== id),
            // Solo los planes pendientes: los ya hechos (con sesión enlazada) son historial.
            planned: s.planned.filter((p) => p.templateId !== id || p.activityId),
          }));
          resyncReminders(get());
        }
        return found;
      },
      restoreTemplate: (t) => set((s) => ({ templates: [t, ...s.templates] })),
      planTemplate: (templateId, date) => {
        const id = uid();
        set((s) => ({ planned: [...s.planned, { id, date, templateId }] }));
        // Sin `await`: programar el aviso es un efecto secundario best-effort (Expo Go/web no
        // tienen notificaciones reales, ver `lib/notifications.ts`) — no debe bloquear ni poder
        // hacer fallar la propia acción de planificar, que es siempre local e inmediata.
        const name = get().templates.find((t) => t.id === templateId)?.name ?? "Entrenamiento";
        scheduleWorkoutReminder(id, date, name).catch(() => {});
        return id;
      },
      unplan: (id) => {
        const found = get().planned.find((p) => p.id === id);
        if (found) set((s) => ({ planned: s.planned.filter((p) => p.id !== id) }));
        cancelWorkoutReminder(id).catch(() => {});
        return found;
      },
      restorePlanned: (p) => {
        set((s) => ({ planned: [...s.planned, p] }));
        resyncReminders(get());
      },
      updateActivity: (id, patch) => {
        const p = "route" in patch ? { ...patch, route: compactRoute(patch.route) } : patch;
        set((s) => ({ activities: s.activities.map((a) => (a.id === id ? { ...a, ...p } : a)) }));
      },
      duplicateTemplate: (id) => {
        const src = get().templates.find((t) => t.id === id);
        if (!src) return undefined;
        const copy: Template = { ...src, id: `tpl-${uid()}`, name: `${src.name} (copia)`, items: cloneItems(src.items) };
        set((s) => ({ templates: [copy, ...s.templates] }));
        return copy;
      },
      addActivity: (a) => {
        const id = `act-${uid()}`;
        set((s) => ({ activities: [{ ...a, id }, ...s.activities] }));
        get().relink();
        return id;
      },
      deleteActivity: (id) => {
        const found = get().activities.find((a) => a.id === id);
        if (found) {
          set((s) => ({
            activities: s.activities.filter((a) => a.id !== id),
            planned: s.planned.map((p) => (p.activityId === id ? { ...p, activityId: undefined } : p)),
            dismissedExternalIds: found.externalId ? [...s.dismissedExternalIds, found.externalId].slice(-MAX_DISMISSED) : s.dismissedExternalIds,
          }));
        }
        return found;
      },
      restoreActivity: (a) => {
        set((s) => ({ activities: [a, ...s.activities], dismissedExternalIds: s.dismissedExternalIds.filter((x) => x !== a.externalId) }));
        get().relink();
      },
      linkTemplate: (activityId, templateId) =>
        set((s) => {
          const t = templateId ? s.templates.find((x) => x.id === templateId) : undefined;
          return {
            activities: s.activities.map((a) => (a.id === activityId ? (t ? applyTemplate(a, t) : clearTemplate(a)) : a)),
          };
        }),
      relink: () =>
        set((s) => {
          const matches = matchPlanned(s.planned, s.activities, todayKey());
          if (matches.length === 0) return s;
          const planned = s.planned.map((p) => {
            const m = matches.find((x) => x.plannedId === p.id);
            return m ? { ...p, activityId: m.activityId } : p;
          });
          const activities = s.activities.map((a) => {
            const m = matches.find((x) => x.activityId === a.id);
            if (!m || a.templateId) return a;
            const plan = s.planned.find((p) => p.id === m.plannedId);
            const t = plan ? s.templates.find((x) => x.id === plan.templateId) : undefined;
            return t ? applyTemplate(a, t) : a;
          });
          return { planned, activities };
        }),
      markSynced: async () => {
        // Garmin Connect tarda en propagar una sesión a Health Connect (horas, y a veces solo
        // al abrir su propia app): si se sincroniza justo después de correr, la sesión todavía
        // no está en HC y, como `lastSync` avanzaba, quedaba en un hueco que nunca se volvía a
        // leer (visto de verdad: carrera de la tarde que jamás apareció). Por eso se lee con
        // 7 días de solape: `mergeImportedActivities()` deduplica por `externalId`, así que
        // releer sesiones ya importadas es seguro. Si un `lastSync` antiguo no parseara (dato
        // corrupto de una versión vieja), se lee desde el principio en vez de lanzar un
        // RangeError que dejaría la sincronización rota sin explicación.
        const last = get().lastSync;
        const lastMs = last ? new Date(last).getTime() : NaN;
        const since = Number.isFinite(lastMs) ? new Date(lastMs - 7 * 86_400_000).toISOString() : null;
        const imported = await importNewActivities(since);
        const { activities, addedCount } = mergeImportedActivities(get().activities, imported, () => `act-${uid()}`, get().dismissedExternalIds);
        if (addedCount > 0) set({ activities });
        set({ lastSync: new Date().toISOString() });
        get().relink();
        return addedCount;
      },
      setSource: (source) => set({ source }),
      setStravaConnected: (stravaConnected) => set({ stravaConnected }),
      markStravaSynced: async (token) => {
        const { activities: imported, until } = await api.stravaSync(token, get().lastStravaSync);
        const { activities, addedCount } = mergeImportedActivities(get().activities, imported, () => `act-${uid()}`, get().dismissedExternalIds);
        if (addedCount > 0) set({ activities });
        set({ lastStravaSync: until ?? new Date().toISOString() });
        get().relink();
        return addedCount;
      },
      resetDemo: () => set(initial()),
      startFresh: () => set(empty()),
    }),
    {
      name: "cf_running_v1",
      storage: guardedJSONStorage(),
      // Tras cargar (arranque, o datos bajados de la cuenta): los avisos viven en el sistema, no en el blob.
      onRehydrateStorage: guardRehydrate<RunningState>("cf_running_v1", (s) => resyncReminders(s)),
      version: 6,
      // Campos nuevos se rellenan desde `empty()`, nunca desde `initial()`: si no, una migración
      // metería actividades o plantillas de ejemplo entre los datos reales.
      // v5 → v6: llega `dismissedExternalIds` y se compactan los recorridos ya guardados.
      migrate: (persisted) => {
        const s = { ...empty(), ...(persisted as object) } as RunningState;
        return { ...s, activities: s.activities.map((a) => (a.route ? { ...a, route: compactRoute(a.route) } : a)) };
      },
    },
  ),
);

export const newId = uid;
