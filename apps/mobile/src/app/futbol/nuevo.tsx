import { router } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { MatchInfoFields, type MatchInfo } from "@/components/football/MatchInfoFields";
import { DayPicker } from "@/components/running/DayPicker";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Button, DurationField, FieldGroup, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useRunning } from "@/data/runningStore";
import { todayKey } from "@/domain/dates";
import { parseNum } from "@/domain/format";
import { space } from "@/theme/tokens";

/** Registrar a mano un partido que no grabó el reloj (los del Garmin llegan solos al sincronizar). */
export default function NewMatchScreen() {
  const addMatch = useRunning((s) => s.addMatch);
  const [title, setTitle] = useState("Partido");
  const [date, setDate] = useState(todayKey());
  const [durationS, setDurationS] = useState<number | null>(3600);
  const [km, setKm] = useState("");
  const [info, setInfo] = useState<MatchInfo>({ format: "7" });
  const [tried, setTried] = useState(false);

  const distance = km.trim() ? parseNum(km) : null;
  const durationOk = durationS != null && durationS >= 5 * 60 && durationS <= 4 * 3600;
  const kmOk = !km.trim() || (distance != null && distance > 0 && distance < 30);

  const save = () => {
    setTried(true);
    if (!durationOk || !kmOk) return;
    const id = addMatch({
      date,
      source: "manual",
      title: title.trim() || "Partido",
      durationS: durationS!,
      distanceM: distance ? Math.round(distance * 1000) : undefined,
      ...info,
      notes: info.notes?.trim() || undefined,
    });
    toast("Partido registrado");
    router.replace({ pathname: "/futbol/[id]", params: { id } });
  };

  return (
    <Screen variant="form" testID="screen-futbol-nuevo" footer={<Button testID="save-match" label="Registrar partido" size="lg" fullWidth onPress={save} />}>
      <ScreenHeader title="Nuevo partido" back />
      <View style={{ gap: space.lg }}>
        <Text variant="caption" color="muted">
          Para partidos que no ha grabado el reloj. Los del Garmin (actividad «Fútbol») llegan solos al sincronizar.
        </Text>
        <TextField testID="m-title" label="Nombre" value={title} onChangeText={setTitle} maxLength={50} />
        <FieldGroup label="Día">
          <DayPicker value={date} onChange={setDate} />
        </FieldGroup>
        <DurationField testID="m-time" label="Tiempo jugado" hours value={durationS} onChange={setDurationS} error={tried && !durationOk ? "Entre 5 minutos y 4 horas" : undefined} />
        <TextField testID="m-km" label="Distancia (opcional)" suffix="km" keyboardType="decimal-pad" value={km} onChangeText={setKm} placeholder="6,5" error={tried && !kmOk ? "Revisa la distancia" : undefined} />
        <MatchInfoFields value={info} onChange={(p) => setInfo((cur) => ({ ...cur, ...p }))} />
      </View>
    </Screen>
  );
}
