// Capa de datos de Strava: la única en el proyecto que habla con una API externa desde el
// servidor (a diferencia de OFF/USDA, que el móvil consulta en directo — aquí hace falta el
// `client_secret`, que nunca puede llegar al móvil). Sin lógica de dominio: `routes/strava.ts`
// decide qué hacer con lo que esto devuelve, esto solo habla con `strava.com`.
import { get, run, type DB } from "./db";
import { HttpError } from "./http";
import type { AppConfig } from "./routes/ctx";

const AUTHORIZE_URL = "https://www.strava.com/oauth/authorize";
const TOKEN_URL = "https://www.strava.com/oauth/token";
const API_BASE = "https://www.strava.com/api/v3";
const CALLBACK_URL = "https://cheluisfit.redgarverde.com/api/strava/callback";
const REFRESH_MARGIN_S = 5 * 60;

export function buildAuthorizeUrl(cfg: AppConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: cfg.stravaClientId!,
    redirect_uri: CALLBACK_URL,
    response_type: "code",
    approval_prompt: "auto",
    scope: "activity:read_all",
    state,
  });
  return `${AUTHORIZE_URL}?${params}`;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: { id: number };
}

async function tokenRequest(cfg: AppConfig, body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: cfg.stravaClientId, client_secret: cfg.stravaClientSecret, ...body }),
  });
  if (!res.ok) throw new HttpError(502, `Strava no respondió al intercambiar el token (${res.status})`);
  return (await res.json()) as TokenResponse;
}

export async function exchangeCode(db: DB, cfg: AppConfig, userId: string, code: string): Promise<void> {
  const t = await tokenRequest(cfg, { code, grant_type: "authorization_code" });
  if (!t.athlete) throw new HttpError(502, "Strava no devolvió el atleta al conectar");
  const now = Date.now();
  run(
    db,
    `INSERT INTO strava_tokens (user_id, athlete_id, access_token, refresh_token, expires_at, updated_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT(user_id) DO UPDATE SET athlete_id=excluded.athlete_id, access_token=excluded.access_token, refresh_token=excluded.refresh_token, expires_at=excluded.expires_at, updated_at=excluded.updated_at`,
    userId,
    t.athlete.id,
    t.access_token,
    t.refresh_token,
    t.expires_at,
    now,
  );
}

/** Devuelve el `access_token` válido, renovándolo primero si está a punto de caducar. */
export async function ensureFreshToken(db: DB, cfg: AppConfig, userId: string): Promise<string> {
  const row = get(db, "SELECT * FROM strava_tokens WHERE user_id = ?", userId);
  if (!row) throw new HttpError(409, "Strava no está conectado");
  const nowS = Math.floor(Date.now() / 1000);
  if ((row.expires_at as number) - nowS > REFRESH_MARGIN_S) return row.access_token as string;

  const t = await tokenRequest(cfg, { refresh_token: row.refresh_token as string, grant_type: "refresh_token" });
  run(db, "UPDATE strava_tokens SET access_token=?, refresh_token=?, expires_at=?, updated_at=? WHERE user_id=?", t.access_token, t.refresh_token, t.expires_at, Date.now(), userId);
  return t.access_token;
}

export interface StravaActivity {
  id: number;
  type: string;
  /** UTC (ISO); `start_date_local` es la hora local sin zona, para la fecha del día. */
  start_date?: string;
  start_date_local: string;
  name: string;
  distance: number;
  moving_time: number;
  average_heartrate?: number;
  max_heartrate?: number;
  total_elevation_gain?: number;
  kilojoules?: number;
  map?: { summary_polyline?: string };
}

const PER_PAGE = 100;
/** Tope por sincronización: cada actividad con mapa gasta además una petición de su ruta, y Strava
 *  limita a 100 peticiones cada 15 min. Lo que no quepa llega en la siguiente sincronización. */
const MAX_PAGES = 2;

/**
 * Actividades desde `afterEpochS`, paginando (antes solo se pedía una página de 50 y el resto se
 * perdía: el móvil avanza `lastStravaSync` igualmente). Strava devuelve con `after` en orden
 * ascendente, así que si se corta por el tope, lo que falta es lo más reciente y el móvil lo
 * pedirá después — **siempre que avance su marca solo hasta la última actividad recibida**.
 */
export async function fetchActivities(accessToken: string, afterEpochS: number): Promise<{ activities: StravaActivity[]; truncated: boolean }> {
  const all: StravaActivity[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const params = new URLSearchParams({ after: String(afterEpochS), per_page: String(PER_PAGE), page: String(page) });
    const res = await fetch(`${API_BASE}/athlete/activities?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new HttpError(502, `Strava no respondió al pedir las actividades (${res.status})`);
    const batch = (await res.json()) as StravaActivity[];
    all.push(...batch);
    if (batch.length < PER_PAGE) return { activities: all, truncated: false };
  }
  return { activities: all, truncated: true };
}

/** Solo se llama si `activity.map.summary_polyline` existe — evita gastar cuota en actividades sin ruta. */
export async function fetchLatLng(accessToken: string, activityId: number): Promise<{ lat: number; lon: number }[] | null> {
  const res = await fetch(`${API_BASE}/activities/${activityId}/streams?keys=latlng&key_by_type=true`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return null;
  const json = (await res.json()) as { latlng?: { data?: [number, number][] } };
  const data = json.latlng?.data;
  if (!data || data.length < 2) return null;
  return compactRoute(data.map(([lat, lon]) => ({ lat, lon })));
}

/** Mismo criterio que `apps/mobile/src/domain/route.ts` (`compactRoute`): hasta 300 puntos
 *  repartidos por igual, conservando el primero y el último, y 5 decimales (≈ 1 m). Un stream de
 *  Strava trae un punto por segundo; sin esto una tirada larga son decenas de miles. */
const MAX_ROUTE_POINTS = 300;
function compactRoute(points: { lat: number; lon: number }[]): { lat: number; lon: number }[] {
  let out = points;
  if (points.length > MAX_ROUTE_POINTS) {
    const stride = (points.length - 1) / (MAX_ROUTE_POINTS - 1);
    out = Array.from({ length: MAX_ROUTE_POINTS }, (_, i) => points[Math.round(i * stride)]!);
  }
  return out.map((p) => ({ lat: Math.round(p.lat * 1e5) / 1e5, lon: Math.round(p.lon * 1e5) / 1e5 }));
}

const TYPE_MAP: Record<string, "run" | "walk"> = { Run: "run", TrailRun: "run", Walk: "walk", Hike: "walk" };

/** Mapea una actividad de Strava a la forma `Omit<Activity,"id">` del móvil — ver `domain/running.ts`. */
export function toImportedActivity(a: StravaActivity, route: { lat: number; lon: number }[] | null): Record<string, unknown> | null {
  const type = TYPE_MAP[a.type];
  if (!type) return null;
  return {
    date: a.start_date_local.slice(0, 10),
    type,
    source: "strava",
    title: a.name?.trim() || (type === "run" ? "Carrera" : "Caminata"),
    distanceM: Math.round(a.distance),
    durationS: a.moving_time,
    avgHr: a.average_heartrate ? Math.round(a.average_heartrate) : undefined,
    maxHr: a.max_heartrate ? Math.round(a.max_heartrate) : undefined,
    ascentM: a.total_elevation_gain ? Math.round(a.total_elevation_gain) : undefined,
    // Strava da `kilojoules` = trabajo mecánico realizado, no energía gastada. Con una
    // eficiencia muscular de ~24 %, 1 kJ de trabajo ≈ 1 kcal gastada (4,184 kJ/kcal × 0,24 ≈ 1):
    // es la misma equivalencia que usa la propia Strava. Dividir por 4,184 daba ~4 veces menos.
    kcal: a.kilojoules ? Math.round(a.kilojoules) : undefined,
    externalId: `strava-${a.id}`,
    route: route ?? undefined,
  };
}

export function disconnectStrava(db: DB, userId: string): void {
  run(db, "DELETE FROM strava_tokens WHERE user_id = ?", userId);
}

export function isStravaConnected(db: DB, userId: string): boolean {
  return !!get(db, "SELECT 1 AS x FROM strava_tokens WHERE user_id = ?", userId);
}
