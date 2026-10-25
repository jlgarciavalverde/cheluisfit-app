// Sube el resumen público de estadísticas (`domain/socialStats.ts`) al perfil de Social. Se
// llama tras cada sincronización (`useAutoSync`): sin cambios no sube nada, y con cambios como
// mucho cada 6 h. El editor de perfil la fuerza (`force`) para enseñar valores al día. La marca
// de la última subida vive aparte en AsyncStorage: no es un dato de la persona, no se sincroniza.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";
import { useAuth } from "./authStore";
import { useRunning } from "./runningStore";
import { useStrength } from "./strengthStore";
import { useNutrition } from "./store";
import { todayKey } from "@/domain/dates";
import { buildProfileStats, shouldUploadStats, statsFingerprint, type PublicStat } from "@/domain/socialStats";

const META_KEY = "cf_social_stats_meta_v1";

export function currentProfileStats(): PublicStat[] {
  return buildProfileStats({
    today: todayKey(),
    activities: useRunning.getState().activities,
    workouts: useStrength.getState().workouts,
    activeDates: [
      ...useNutrition.getState().entries.map((e) => e.date),
      ...useRunning.getState().activities.map((a) => a.date),
      ...useStrength.getState().workouts.map((w) => w.date),
    ],
  });
}

export async function uploadProfileStats(force = false): Promise<void> {
  const token = useAuth.getState().token;
  if (!token) return;
  const stats = currentProfileStats();
  const fingerprint = statsFingerprint(stats);
  let prev: { fingerprint: string; at: number } | null = null;
  try {
    prev = JSON.parse((await AsyncStorage.getItem(META_KEY)) ?? "null");
  } catch {
    prev = null;
  }
  if (!force && !shouldUploadStats(prev, fingerprint, Date.now())) return;
  if (force && prev?.fingerprint === fingerprint) return;
  await api.socialUploadStats(token, stats);
  await AsyncStorage.setItem(META_KEY, JSON.stringify({ fingerprint, at: Date.now() })).catch(() => {});
}
