// Sincronización con el servidor durante el uso normal (ver `syncBlobs` en `blobSync.ts`: control
// de versión por clave, baja lo que cambió en otro sitio y sube lo cambiado aquí). La carga
// inicial al entrar/registrarse vive en `blobSync.ts`/`authStore.ts`, no aquí.
import { syncBlobs } from "./blobSync";
import { ApiError } from "./api";
import { useAuth } from "./authStore";

let syncing: Promise<void> | null = null;

/** Sincroniza todas las claves; segura de llamar varias veces seguidas (se reutiliza la que esté en marcha). */
export function syncNow(): Promise<void> {
  if (syncing) return syncing;
  syncing = run().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function run(): Promise<void> {
  const { token, setSyncState } = useAuth.getState();
  if (!token) return;
  setSyncState({ syncing: true, syncError: null });
  try {
    const { conflicts } = await syncBlobs(token);
    useAuth.getState().setSyncState({
      lastSyncedAt: Date.now(),
      syncing: false,
      ...(conflicts.length > 0 ? { syncNotice: "Había cambios más nuevos en tu cuenta y se han cargado. Lo que tenías en este móvil está guardado en Más → Cuenta." } : {}),
    });
  } catch (e) {
    const message = e instanceof ApiError && e.status !== 0 ? e.message : "No se pudo sincronizar. Se reintentará más tarde.";
    setSyncState({ syncing: false, syncError: message });
    throw e;
  }
}
