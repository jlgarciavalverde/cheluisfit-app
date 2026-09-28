import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { Screen, ScreenHeader } from "@/components/Screen";
import { DayPicker } from "@/components/running/DayPicker";
import { Callout, Button, Chip, DurationField, FieldGroup, Text, TextField } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useRunning } from "@/data/runningStore";
import { todayKey } from "@/domain/dates";
import { fmtPace, parseNum } from "@/domain/format";
import { applyTemplate, checkManualRun } from "@/domain/running";
import { space } from "@/theme/tokens";

export default function NewSessionScreen() {
  const params = useLocalSearchParams<{ date?: string; templateId?: string }>();
  const templates = useRunning((s) => s.templates);
  const addActivity = useRunning((s) => s.addActivity);

  const [title, setTitle] = useState("Carrera");
  const [date, setDate] = useState(params.date ?? todayKey());
  const [km, setKm] = useState("");
  const [durationS, setDurationS] = useState<number | null>(null);
  const [hr, setHr] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(params.templateId ?? null);
  const [rpe, setRpe] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [tried, setTried] = useState(false);

  const check = checkManualRun({ distanceKm: parseNum(km), durationS, avgHr: parseNum(hr) });
  const distErr = tried && (parseNum(km) === null || (parseNum(km) ?? 0) <= 0);
  const timeErr = tried && (durationS === null || durationS <= 0);

  const save = () => {
    setTried(true);
    if (!check.ok) return;
    const tpl = templateId ? templates.find((t) => t.id === templateId) : undefined;
    const base = {
      date,
      type: "run" as const,
      source: "manual" as const,
      title: title.trim() || "Carrera",
      distanceM: Math.round((parseNum(km) as number) * 1000),
      durationS: durationS as number,
      avgHr: parseNum(hr) ? Math.round(parseNum(hr) as number) : undefined,
      rpe: rpe ?? undefined,
      notes: notes.trim() || undefined,
    };
    const id = addActivity(tpl ? applyTemplate({ ...base, id: "" }, tpl) : base);
    toast("Carrera guardada");
    router.replace({ pathname: "/sesion/[id]", params: { id } });
  };

  return (
    <Screen variant="form"
      testID="screen-nueva-sesion"
      footer={<Button testID="save-session" label="Registrar carrera" size="lg" fullWidth onPress={save} />}
    >
      <ScreenHeader title="Registrar carrera" back />
      <View style={{ gap: space.lg }}>
        <Text variant="caption" color="muted">
          Para carreras que no ha grabado el reloj. Las del Garmin llegan solas al sincronizar.
        </Text>
        <TextField testID="s-title" label="Nombre" value={title} onChangeText={setTitle} maxLength={50} />
        <FieldGroup label="Día">
          <DayPicker value={date} onChange={setDate} />
        </FieldGroup>
        <TextField
          testID="s-km"
          label="Distancia"
          suffix="km"
          keyboardType="decimal-pad"
          value={km}
          onChangeText={setKm}
          placeholder="10,5"
          error={distErr ? "Indica la distancia" : undefined}
        />
        <DurationField
          testID="s-time"
          label="Tiempo"
          hours
          value={durationS}
          onChange={setDurationS}
          error={timeErr ? "Indica el tiempo" : undefined}
        />
        {check.paceSecPerKm ? (
          <Callout icon="speedometer-outline" title={`Ritmo medio: ${fmtPace(check.paceSecPerKm)}/km`} testID="pace-preview">
            {check.warnings.map((w) => (
              <Text key={w} variant="caption" color="warning">
                {w}
              </Text>
            ))}
          </Callout>
        ) : null}
        <View style={{ flexDirection: "row" }}>
          <TextField
            testID="s-hr"
            label="FC media (opcional)"
            suffix="ppm"
            keyboardType="number-pad"
            value={hr}
            onChangeText={setHr}
            error={tried && check.problems.some((p) => p.includes("cardiaca")) ? "Fuera de rango" : undefined}
          />
        </View>

        <FieldGroup label="Plantilla (opcional)">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            <Chip label="Ninguna" selected={templateId === null} onPress={() => setTemplateId(null)} />
            {templates.map((t) => (
              <Chip key={t.id} label={t.name} selected={templateId === t.id} onPress={() => setTemplateId(t.id)} />
            ))}
          </View>
        </FieldGroup>
        <FieldGroup label="Esfuerzo percibido (opcional)">
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <Chip key={n} label={String(n)} selected={rpe === n} onPress={() => setRpe(rpe === n ? null : n)} />
            ))}
          </View>
        </FieldGroup>
        <TextField label="Notas" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 72, textAlignVertical: "top" }} />
        {tried && !check.ok ? (
          <View accessibilityLiveRegion="polite">
            {check.problems.map((p) => (
              <Text key={p} variant="caption" color="danger">
                • {p}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
