import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { AnalysisCard } from "@/components/ai/AnalysisCard";
import { MatchInfoFields, type MatchInfo } from "@/components/football/MatchInfoFields";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Badge, BottomSheet, Button, Card, EmptyState, IconButton, Stat, StatGrid, Text } from "@/components/ui";
import { toast } from "@/components/ui/Toast";
import { useRunning } from "@/data/runningStore";
import { useNutrition } from "@/data/store";
import { addDays, dayLabel, todayKey } from "@/domain/dates";
import { FORMAT_LABEL, matchAnalysisData, OUTCOME_LABEL, outcomeOf, POSITION_LABEL, scoreText } from "@/domain/football";
import { fmtDuration, fmtKm } from "@/domain/format";
import { defaultMaxHr, hrZoneOf } from "@/domain/running";
import { space } from "@/theme/tokens";

const OUTCOME_TONE = { win: "success", draw: "neutral", loss: "danger" } as const;

/** Ficha de un partido: lo del reloj, lo que apuntas tú (resultado, goles…) y el análisis de la IA. */
export default function MatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const match = useRunning((s) => s.matches.find((m) => m.id === id));
  const all = useRunning((s) => s.matches);
  const updateMatch = useRunning((s) => s.updateMatch);
  const profile = useNutrition((s) => s.profile);
  const [editing, setEditing] = useState<MatchInfo | null>(null);

  if (!match) {
    return (
      <Screen testID="screen-partido">
        <ScreenHeader title="Partido" back />
        <EmptyState icon="football-outline" title="Este partido ya no existe" />
      </Screen>
    );
  }

  const maxHr = profile.maxHr ?? defaultMaxHr(profile.age);
  const outcome = outcomeOf(match);
  const score = scoreText(match);
  const zone = match.avgHr ? hrZoneOf(match.avgHr, maxHr) : 0;

  const remove = () => {
    const removed = useRunning.getState().deleteMatch(match.id);
    router.back();
    if (removed) toast("Partido borrado", { actionLabel: "Deshacer", onAction: () => useRunning.getState().restoreMatch(removed) });
  };

  return (
    <Screen testID="screen-partido">
      <ScreenHeader
        title={match.title}
        subtitle={`${dayLabel(match.date, todayKey())} · ${match.source === "garmin" ? "Garmin" : "Manual"}`}
        back
        right={<IconButton icon="trash-outline" label="Borrar partido" color="danger" onPress={remove} />}
      />
      <View style={{ gap: space.lg }}>
        <Card style={{ gap: space.md }} testID="match-score">
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Text variant="display" tabular style={{ flex: 1 }}>
              {score ?? "Sin resultado"}
            </Text>
            {outcome ? <Badge label={OUTCOME_LABEL[outcome]} tone={OUTCOME_TONE[outcome]} /> : null}
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
            {match.goals ? <Badge label={`${match.goals} ${match.goals === 1 ? "gol" : "goles"}`} tone="brand" icon="football-outline" /> : null}
            {match.assists ? <Badge label={`${match.assists} ${match.assists === 1 ? "asistencia" : "asistencias"}`} tone="brand" /> : null}
            {match.position ? <Badge label={POSITION_LABEL[match.position]} /> : null}
            {match.format ? <Badge label={FORMAT_LABEL[match.format]} /> : null}
            {match.rpe ? <Badge label={`Esfuerzo ${match.rpe}/10`} /> : null}
          </View>
          <Button
            testID="edit-match"
            label={score || match.goals || match.position ? "Editar datos del partido" : "Apuntar resultado y goles"}
            icon="create-outline"
            size="sm"
            variant="secondary"
            onPress={() =>
              setEditing({
                goalsFor: match.goalsFor,
                goalsAgainst: match.goalsAgainst,
                goals: match.goals,
                assists: match.assists,
                position: match.position,
                format: match.format,
                rpe: match.rpe,
                notes: match.notes,
              })
            }
          />
        </Card>

        <StatGrid>
          <Stat label="Tiempo" value={fmtDuration(match.durationS)} size="sm" />
          {match.distanceM ? <Stat label="Distancia" value={fmtKm(match.distanceM)} unit="km" size="sm" /> : null}
          {match.avgHr ? <Stat label={`FC media${zone ? ` · Zona ${zone}` : ""}`} value={String(match.avgHr)} unit="ppm" size="sm" /> : null}
          {match.maxHr ? <Stat label="FC máxima" value={String(match.maxHr)} unit="ppm" size="sm" /> : null}
          {match.kcal ? <Stat label="Calorías" value={String(Math.round(match.kcal))} unit="kcal" size="sm" /> : null}
        </StatGrid>

        {match.notes ? (
          <Card>
            <Text variant="body">{match.notes}</Text>
          </Card>
        ) : null}

        <AnalysisCard
          kind="match"
          analysisKey={match.id}
          // Como las carreras: solo los recientes se analizan solos al abrirlos.
          auto={match.date >= addDays(todayKey(), -3)}
          stored={match.analysis}
          data={() => matchAnalysisData(useRunning.getState().matches.find((m) => m.id === match.id) ?? match, all, maxHr)}
          onSave={(analysis) => updateMatch(match.id, { analysis })}
        />
      </View>

      <BottomSheet visible={editing !== null} onClose={() => setEditing(null)} title="Datos del partido">
        {editing ? (
          <View style={{ gap: space.lg }}>
            <MatchInfoFields value={editing} onChange={(p) => setEditing((cur) => (cur ? { ...cur, ...p } : cur))} />
            <Button
              testID="save-match-info"
              label="Guardar cambios"
              size="lg"
              fullWidth
              onPress={() => {
                updateMatch(match.id, { ...editing, notes: editing.notes?.trim() || undefined });
                setEditing(null);
                toast("Partido actualizado");
              }}
            />
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}
