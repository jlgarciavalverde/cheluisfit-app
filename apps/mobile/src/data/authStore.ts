import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";
import { api, ApiError, type ApiHousehold, type ApiUser } from "./api";
import { adoptNewAccount, pullAllBlobs, saveMeta, loadMeta } from "./blobSync";

// El token de sesión es una credencial real: va al llavero cifrado (SecureStore), no a
// AsyncStorage (donde vive el resto de preferencias sin cifrar).
// SecureStore no existe en web (`ExpoSecureStore` es un objeto vacío y `getItemAsync` lanza):
// ahí la sesión vive en memoria y no sobrevive a la recarga, aceptable para la web secundaria.
const memoryStorage = new Map<string, string>();
const secureStorage: StateStorage =
  Platform.OS === "web"
    ? {
        getItem: (name) => Promise.resolve(memoryStorage.get(name) ?? null),
        setItem: (name, value) => {
          memoryStorage.set(name, value);
          return Promise.resolve();
        },
        removeItem: (name) => {
          memoryStorage.delete(name);
          return Promise.resolve();
        },
      }
    : {
        getItem: (name) => SecureStore.getItemAsync(name),
        setItem: (name, value) => SecureStore.setItemAsync(name, value),
        removeItem: (name) => SecureStore.deleteItemAsync(name),
      };

interface AuthState {
  token: string | null;
  user: ApiUser | null;
  household: ApiHousehold | null;
  /** Marca de tiempo del último `pull`/`push` que terminó bien, o `null` si nunca sincronizó. */
  lastSyncedAt: number | null;
  syncing: boolean;
  syncError: string | null;
  /** Aviso informativo (no un error): p. ej. que ganó la versión del servidor en un conflicto. */
  syncNotice: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: { name: string; email: string; password: string; setupCode?: string; householdName?: string; inviteCode?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  setSyncState: (patch: Partial<Pick<AuthState, "lastSyncedAt" | "syncing" | "syncError" | "syncNotice">>) => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      token: null,
      user: null,
      household: null,
      lastSyncedAt: null,
      syncing: false,
      syncError: null,
      syncNotice: null,

      login: async (email, password) => {
        const { token, user } = await api.login(email, password);
        const { household } = await api.me(token);
        // `syncing` entra en el MISMO `set()` que `token`, para que no exista un instante donde
        // haya sesión pero `useAutoSync` no sepa todavía que hay una carga en marcha (si no,
        // podría intentar subir datos locales justo antes de que la carga real termine de bajar).
        set({ token, user, household, syncing: true, syncError: null, syncNotice: null });
        // Se marca ANTES de bajar: si la app se cierra o la red cae a mitad, al volver sigue
        // pendiente la descarga y `syncBlobs` nunca subirá lo local por encima del historial real.
        const meta = await loadMeta();
        await saveMeta({ ...meta, needsPull: true, ownerId: user.id });
        try {
          await pullAllBlobs(token, user.id);
          set({ lastSyncedAt: Date.now(), syncing: false });
        } catch {
          // El login en sí ya ha funcionado — que falle la carga no debe impedir entrar. Queda
          // como `syncError` (se ve en Más) y el auto-sync volverá a intentar **bajar** (no subir)
          // mientras siga `needsPull`.
          set({ syncing: false, syncError: "No se pudo recuperar tus datos. Se reintentará más tarde." });
        }
      },
      register: async (input) => {
        const { token, user } = await api.register(input);
        const { household } = await api.me(token);
        set({ token, user, household, syncing: true, syncError: null, syncNotice: null });
        try {
          // A diferencia del login, una cuenta recién creada respeta los datos locales: la app es
          // usable sin cuenta y registrarse no debe borrar lo acumulado (ver `adoptNewAccount`).
          await adoptNewAccount(token, user.id);
          set({ lastSyncedAt: Date.now(), syncing: false });
        } catch {
          set({ syncing: false, syncError: "No se pudo recuperar tus datos. Se reintentará más tarde." });
        }
      },
      logout: async () => {
        const token = get().token;
        if (token) {
          try {
            await api.logout(token);
          } catch {
            // Si el servidor no responde, cerramos sesión localmente igualmente.
          }
        }
        // Los datos se quedan en el móvil (la app funciona sin cuenta), pero siguen marcados como de
        // esta cuenta (`ownerId` en `cf_sync_meta_v1`): si otra persona se registra aquí, no los hereda.
        set({ token: null, user: null, household: null, lastSyncedAt: null, syncError: null, syncNotice: null });
      },
      refreshMe: async () => {
        const token = get().token;
        if (!token) return;
        try {
          const { user, household } = await api.me(token);
          set({ user, household });
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) set({ token: null, user: null, household: null });
        }
      },
      setSyncState: (patch) => set(patch),
    }),
    {
      name: "cf_auth_v1",
      storage: createJSONStorage(() => secureStorage),
      partialize: (s) => ({ token: s.token, user: s.user, household: s.household, lastSyncedAt: s.lastSyncedAt }),
    },
  ),
);
