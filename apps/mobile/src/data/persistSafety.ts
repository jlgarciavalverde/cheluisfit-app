// Protección común de las tiendas con `persist` (zustand + AsyncStorage/SecureStore).
//
// Por qué existe: en zustand 5, si leer lo guardado falla (JSON corrupto, `migrate` que lanza,
// un valor de más de ~2 MB que Android no puede leer, SecureStore que ya no descifra tras
// cambiar el bloqueo de pantalla), la tienda **nunca** se marca como cargada — y `_layout.tsx`
// no pinta nada hasta que todas lo están: la app se quedaba en la pantalla de carga para siempre.
// Y al revés, `persist` ignora los fallos al escribir (`void setItem()`): con el disco lleno se
// perdían datos sin que nadie se enterara.
//
// Qué hace:
// - Lectura ilegible → se guarda una copia del texto tal cual (`<clave>__ilegible_<fecha>`), la
//   tienda arranca vacía/de ejemplo y queda marcada como «fallida»: la sincronización no la sube
//   nunca por encima de la cuenta y, si hay sesión, baja la copia del servidor (`blobSync.ts`).
// - Fallo al escribir o blob que se acerca al límite de Android → aviso (un toast, vía
//   `onStorageProblem`, que escucha `_layout.tsx`: este módulo de datos no importa UI).
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createJSONStorage, type StateStorage } from "zustand/middleware";

/** A partir de aquí una entrada de AsyncStorage en Android empieza a estar en riesgo (~2 MB). */
const WARN_BYTES = 1_500_000;

type ProblemListener = (message: string) => void;
const problemListeners = new Set<ProblemListener>();
const failed = new Set<string>();
const failedListeners = new Set<() => void>();
const warnedSize = new Set<string>();

/** Suscripción a los avisos para la persona (fallo al guardar, datos ilegibles…). */
export function onStorageProblem(listener: ProblemListener): () => void {
  problemListeners.add(listener);
  // Los avisos de la carga inicial llegan antes de que la interfaz exista: se guardan y se dan aquí.
  pending.splice(0).forEach((m) => listener(m));
  return () => problemListeners.delete(listener);
}

const pending: string[] = [];
function emit(message: string) {
  if (problemListeners.size === 0) pending.push(message);
  else problemListeners.forEach((l) => l(message));
}

export function hydrationFailed(name: string): boolean {
  return failed.has(name);
}

export function onHydrationFailure(listener: () => void): () => void {
  failedListeners.add(listener);
  return () => failedListeners.delete(listener);
}

export function markHydrationFailed(name: string, reason?: unknown): void {
  if (failed.has(name)) return;
  failed.add(name);
  console.warn(`[persist] no se pudo cargar ${name}`, reason instanceof Error ? reason.message : reason);
  failedListeners.forEach((l) => l());
}

/** Cuando la copia del servidor ya se ha puesto en su lugar (ver `syncBlobs`). */
export function clearHydrationFailure(name: string): void {
  failed.delete(name);
}

const LABEL: Record<string, string> = {
  cf_nutrition_v1: "nutrición",
  cf_running_v1: "running",
  cf_strength_v1: "fuerza",
  cf_active_workout_v1: "el entreno en curso",
};

/** `StateStorage` protegido sobre `base` (AsyncStorage por defecto). */
export function guardedStateStorage(base: () => StateStorage = () => AsyncStorage): StateStorage {
  return {
    getItem: async (key) => {
      let raw: string | null = null;
      try {
        raw = (await base().getItem(key)) as string | null;
        if (raw !== null) JSON.parse(raw); // si no es JSON válido, mejor saberlo aquí que en `persist`
        return raw;
      } catch (e) {
        // Copia solo de las tiendas de datos: la de la sesión lleva el token, que no debe acabar
        // sin cifrar en AsyncStorage.
        if (raw && LABEL[key]) {
          try {
            await AsyncStorage.setItem(`${key}__ilegible_${Date.now()}`, raw);
          } catch {
            // sin espacio ni para la copia: al menos que la app arranque
          }
        }
        markHydrationFailed(key, e);
        if (LABEL[key]) emit(`No se pudieron leer tus datos de ${LABEL[key]} en este móvil. Si tienes cuenta, se recuperan de ella al sincronizar.`);
        return null;
      }
    },
    setItem: async (key, value) => {
      try {
        await base().setItem(key, value);
      } catch {
        emit(LABEL[key] ? `No se pudieron guardar los cambios de ${LABEL[key]}: ¿queda espacio en el móvil?` : "No se pudo guardar un cambio en este móvil.");
        return;
      }
      if (value.length > WARN_BYTES && !warnedSize.has(key)) {
        warnedSize.add(key);
        emit(`Tus datos de ${LABEL[key] ?? key} empiezan a ocupar mucho en este móvil (${(value.length / 1e6).toFixed(1)} MB).`);
      }
    },
    removeItem: async (key) => {
      try {
        await base().removeItem(key);
      } catch {
        // nada que perder
      }
    },
  };
}

/** Lo que va en `storage:` de cada `persist`. */
export const guardedJSONStorage = (base?: () => StateStorage) => createJSONStorage(() => guardedStateStorage(base));

/**
 * `onRehydrateStorage` que marca la tienda como fallida si `migrate` (o cualquier otro paso de la
 * carga) lanza, en vez de dejarla colgada. `after` se llama solo si cargó bien.
 */
export function guardRehydrate<S>(name: string, after?: (state: S) => void) {
  return () => (state: S | undefined, error: unknown) => {
    if (error || !state) {
      markHydrationFailed(name, error);
      return;
    }
    after?.(state);
  };
}
