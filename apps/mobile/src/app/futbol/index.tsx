import { router } from "expo-router";
import { useMemo, useState } from "react";
import { View } from "react-native";
import { SyncPanel } from "@/components/running/SyncPanel";
import { Screen, ScreenHeader } from "@/components/Screen";
import { Badge, Button, EmptyState, ListGroup, ListRow, Section, SegmentedControl, Stat, StatGrid } from "@/components/ui";
import { useRunning } from "@/data/runningStore";
import { dayLabel, todayKey } from "@/domain/dates";
import { footballSummary, inMonth, OUTCOME_LABEL, outcomeOf, scoreText } from "@/domain/football";
import { fmtDuration, fmtKm } from "@/domain/format";
import { space } from "@/theme/tokens";

const OUTCOME_TONE = { win: "success", draw: "neutral", loss: "danger" } as const;
const PAGE = 30;

/**
 * Fútbol: partidos del Garmin (actividad «Fútbol» de Health Connect, se traen con el mismo
 * «Sincronizar» que el running) o registrados a mano, con resultado, goles y asistencias.
 */
export default function FootballScreen() {
  const matches = useRunning((s) => s.matches);
  const [range, setRange] = useState<"month" | "year">("month");
  const [shown, setShown] = useState(PAGE);
  const today = todayKey();
  const sorted = useMemo(() => [...matches].sort((a, b) => b.date.localeCompare(a.date)), [matches]);
  const scope = range === "month" ? inMonth(matches, today.slice(0, 7)) : matches.filter((m) => m.date.startsWith(today.slice(0, 4)));
  const s = footballSummary(scope);

  return (
    <Screen testID="screen-futbol" footer={<Button testID="new-match" label="Registrar partido" icon="add" size="lg" fullWidth onPress={() => router.push("/futbol/nuevo")} />}>
      <ScreenHeader title="Fútbol" subtitle="Tus partidos, goles y estado físico" back />
      <View style={{ gap: space.xl }}>
        <View style={{ gap: space.md }}>
          <SegmentedControl
            value={range}
            onChange={setRange}
            options={[
              { value: "month", label: "Este mes" },
              { value: "year", label: "Este año" },
            ]}
          />
          <StatGrid columns={2}>
            <Stat label="Partidos" value={String(s.matches)} unit={s.minutes ? `${Math.round(s.minutes / 60)} h` : undefined} size="md" valueTestID="fb-matches" />
            <Stat label="Balance (G-E-P)" value={`${s.wins}-${s.draws}-${s.losses}`} size="md" />
            <Stat label="Goles" value={String(s.goals)} size="md" valueTestID="fb-goals" />
            <Stat label="Asistencias" value={String(s.assists)} size="md" />
            {s.avgKm != null ? <Stat label="Km por partido" value={String(s.avgKm).replace(".", ",")} unit="km" size="md" /> : null}
            {s.avgHr != null ? <Stat label="FC media" value={String(s.avgHr)} unit="ppm" size="md" /> : null}
          </StatGrid>
        </View>

        <Section title="Partidos" kind="overline" gap={space.sm}>
          <SyncPanel />
          {sorted.length === 0 ? (
            <EmptyState
              icon="football-outline"
              title="Aún no hay partidos"
              text="Graba el partido en el reloj como «Fútbol» y sincroniza, o regístralo a mano. Luego apunta el resultado y tus goles."
            />
          ) : (
            <>
              <ListGroup testID="match-list">
                {sorted.slice(0, shown).map((m) => {
                  const outcome = outcomeOf(m);
                  const score = scoreText(m);
                  return (
                    <ListRow
                      key={m.id}
                      testID={`match-${m.id}`}
                      icon="football-outline"
                      title={m.title}
                      subtitle={[dayLabel(m.date, today), fmtDuration(m.durationS), m.distanceM ? `${fmtKm(m.distanceM)} km` : null, m.goals ? `${m.goals} ⚽` : null].filter(Boolean).join(" · ")}
                      value={outcome ? <Badge label={`${score} ${OUTCOME_LABEL[outcome].charAt(0)}`} tone={OUTCOME_TONE[outcome]} /> : undefined}
                      chevron
                      onPress={() => router.push({ pathname: "/futbol/[id]", params: { id: m.id } })}
                    />
                  );
                })}
              </ListGroup>
              {sorted.length > shown ? <Button label={`Ver más (${sorted.length - shown})`} variant="secondary" onPress={() => setShown((n) => n + PAGE)} /> : null}
            </>
          )}
        </Section>
      </View>
    </Screen>
  );
}
