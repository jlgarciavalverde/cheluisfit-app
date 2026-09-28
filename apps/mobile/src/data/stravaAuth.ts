// Conexión OAuth con Strava, para el recorrido GPS que Garmin nunca comparte por Health Connect
// (ver AGENTS.md). El `client_secret` vive solo en el servidor (`apps/server/src/strava.ts`);
// aquí solo se abre el navegador con la URL de autorización que el servidor prepara y se espera
// a que redirija de vuelta al esquema propio de la app.
import * as WebBrowser from "expo-web-browser";
import { api } from "./api";

const REDIRECT_URL = "cheluisfit://strava-connected";

/** `true` si la persona completó la autorización en Strava; `false` si canceló o algo falló. */
export async function connectStrava(token: string): Promise<boolean> {
  const { url } = await api.stravaConnect(token);
  const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URL);
  if (result.type !== "success") return false;
  // Sin depender de `URL`/`URLSearchParams` (no polyfilled por defecto en Hermes): el propio
  // servidor solo manda `ok=1` u `ok=0`, así que basta con mirar si aparece `ok=1`.
  return /[?&]ok=1(?:&|$)/.test(result.url);
}
