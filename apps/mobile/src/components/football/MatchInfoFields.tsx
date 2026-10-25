// Lo que el reloj no sabe de un partido: resultado, tus goles y asistencias, posición,
// formato, esfuerzo y notas. Lo usan «Registrar partido» y la ficha del partido.
import { View } from "react-native";
import { Chip, ChipRow, FieldGroup, SegmentedControl, Stepper, Text, TextField } from "@/components/ui";
import { FORMAT_LABEL, FORMATS, POSITION_LABEL, POSITIONS, type Format, type Match, type Position } from "@/domain/football";
import { space } from "@/theme/tokens";

export type MatchInfo = Pick<Match, "goalsFor" | "goalsAgainst" | "goals" | "assists" | "position" | "format" | "rpe" | "notes">;

export function MatchInfoFields({ value, onChange }: { value: MatchInfo; onChange: (patch: Partial<MatchInfo>) => void }) {
  const hasScore = value.goalsFor != null && value.goalsAgainst != null;
  return (
    <View style={{ gap: space.lg }}>
      <FieldGroup label="Resultado" hint={hasScore ? undefined : "Opcional: si no lo apuntas, el partido sale sin resultado"}>
        {hasScore ? (
          <View style={{ flexDirection: "row", gap: space.md, alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Stepper testID="m-goals-for" label="Tu equipo" value={value.goalsFor ?? 0} min={0} max={50} onChange={(n) => onChange({ goalsFor: n })} />
            </View>
            <Text variant="title" color="muted">
              –
            </Text>
            <View style={{ flex: 1 }}>
              <Stepper testID="m-goals-against" label="Rival" value={value.goalsAgainst ?? 0} min={0} max={50} onChange={(n) => onChange({ goalsAgainst: n })} />
            </View>
          </View>
        ) : (
          <Chip testID="m-add-score" label="Apuntar el resultado" icon="add" onPress={() => onChange({ goalsFor: 0, goalsAgainst: 0 })} />
        )}
      </FieldGroup>
      <View style={{ flexDirection: "row", gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Stepper testID="m-goals" label="Tus goles" value={value.goals ?? 0} min={0} max={30} onChange={(n) => onChange({ goals: n })} />
        </View>
        <View style={{ flex: 1 }}>
          <Stepper testID="m-assists" label="Asistencias" value={value.assists ?? 0} min={0} max={30} onChange={(n) => onChange({ assists: n })} />
        </View>
      </View>
      <FieldGroup label="Posición">
        <ChipRow wrap>
          {POSITIONS.map((p: Position) => (
            <Chip key={p} testID={`m-pos-${p}`} label={POSITION_LABEL[p]} selected={value.position === p} onPress={() => onChange({ position: value.position === p ? undefined : p })} />
          ))}
        </ChipRow>
      </FieldGroup>
      <SegmentedControl<Format>
        role="radio"
        label="Formato"
        value={value.format ?? "7"}
        onChange={(f) => onChange({ format: f })}
        options={FORMATS.map((f) => ({ value: f, label: FORMAT_LABEL[f].replace("Fútbol ", "F") }))}
      />
      <FieldGroup label="Esfuerzo (1 muy suave · 10 al límite)">
        <ChipRow wrap>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <Chip key={n} label={String(n)} selected={value.rpe === n} onPress={() => onChange({ rpe: value.rpe === n ? undefined : n })} />
          ))}
        </ChipRow>
      </FieldGroup>
      <TextField testID="m-notes" label="Notas (opcional)" value={value.notes ?? ""} onChangeText={(t) => onChange({ notes: t })} placeholder="Cómo te sentiste, molestias…" multiline maxLength={500} />
    </View>
  );
}
