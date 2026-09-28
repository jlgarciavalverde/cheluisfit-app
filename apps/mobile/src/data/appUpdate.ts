// Aviso de versión nueva del APK: el servidor publica `/version.json` (lo deja `tools/deploy.mjs`
// junto al APK) y la app lo consulta al abrirse/volver a primer plano, como mucho cada 12 h.
// Solo en Android nativo: en la web siempre se sirve la última versión, y no hay iPhone.
import Constants from "expo-constants";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { create } from "zustand";
import { API_BASE } from "./api";

export interface AvailableUpdate {
  version: string;
  url: string;
}

export const useAppUpdate = create<{ available: AvailableUpdate | null }>(() => ({ available: null }));

const CHECK_EVERY_MS = 12 * 3600 * 1000;
let lastCheck = 0;

/** Puro, para poder probarlo: ¿la versión publicada es más nueva que la instalada? */
export function newerThanInstalled(published: { version?: unknown; versionCode?: unknown } | null, installedCode: number | undefined): AvailableUpdate | null {
  if (!published || typeof published.versionCode !== "number" || typeof published.version !== "string") return null;
  if (!installedCode || published.versionCode <= installedCode) return null;
  // `?v=`: Cloudflare cachea `.apk` en su borde ignorando las cabeceras; la versión en la URL lo evita.
  return { version: published.version, url: `${API_BASE}/app.apk?v=${published.version}` };
}

export async function checkForAppUpdate(force = false): Promise<void> {
  if (Platform.OS !== "android") return;
  if (!force && Date.now() - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${API_BASE}/version.json`, { signal: controller.signal, headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) return;
    const published = (await res.json()) as { version?: unknown; versionCode?: unknown };
    useAppUpdate.setState({ available: newerThanInstalled(published, Constants.expoConfig?.android?.versionCode) });
  } catch {
    // sin red: ya se mirará la próxima vez
  } finally {
    clearTimeout(timeout);
  }
}

/** Para `_layout.tsx`: comprueba al arrancar y al volver a primer plano. */
export function useAppUpdateCheck(): void {
  useEffect(() => {
    checkForAppUpdate().catch(() => {});
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") checkForAppUpdate().catch(() => {});
    });
    return () => sub.remove();
  }, []);
}
