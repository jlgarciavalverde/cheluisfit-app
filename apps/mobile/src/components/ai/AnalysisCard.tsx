// Tarjeta «Análisis de la IA» de un entreno, una carrera o una semana. Los números los prepara
// `domain/analysis.ts` (`data`); el servidor solo los interpreta. El resultado se guarda con la
// sesión (`onSave`) para no volver a pedirlo: con `auto`, se pide solo la primera vez.
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { Badge, Button, Callout, Card, Icon, Skeleton, Text } from "@/components/ui";
import { api, ApiError } from "@/data/api";
import { useAuth } from "@/data/authStore";
import { useNutrition } from "@/data/store";
import type { AiAnalysis, AnalysisKind, StoredAnalysis } from "@/domain/analysis";
import { fmtRelativeTime } from "@/domain/format";
import { GOAL_LABEL } from "@/domain/nutrition";
import { space } from "@/theme/tokens";

/** Claves ya pedidas automáticamente en esta sesión: un fallo no se reintenta solo en bucle. */
const autoTried = new Set<string>();

function goalText(): string {
  const p = useNutrition.getState().profile;
  return `${GOAL_LABEL[p.goal]}; ${p.sex === "female" ? "mujer" : "hombre"}, ${p.age} años, ${p.weightKg} kg`;
}

function Bullets({ title, icon, items, tone }: { title: string; icon: "checkmark-circle-outline" | "warning-outline" | "arrow-forward-circle-outline"; items: string[]; tone: "success" | "warning" | "brandText" }) {
  if (items.length === 0) return null;
  return (
    <View style={{ gap: space.xs }}>
      <Text variant="caption" color="muted">
        {title}
      </Text>
      {items.map((t, i) => (
        <View key={i} style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-start" }}>
          <Icon name={icon} size="sm" color={tone} />
          <Text variant="body" style={{ flex: 1 }}>
            {t}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function AnalysisBody({ a }: { a: AiAnalysis }) {
  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {a.headline}
        </Text>
        <Badge label={`${Math.round(a.score)}/10`} tone={a.score >= 7 ? "success" : a.score >= 5 ? "brand" : "warning"} />
      </View>
      <Bullets title="Lo mejor" icon="checkmark-circle-outline" items={a.highlights} tone="success" />
      <Bullets title="A vigilar" icon="warning-outline" items={a.warnings} tone="warning" />
      <Bullets title="La próxima vez" icon="arrow-forward-circle-outline" items={a.nextTime} tone="brandText" />
    </View>
  );
}

export function AnalysisCard({
  kind,
  analysisKey,
  data,
  stored,
  onSave,
  auto = false,
  title = "Análisis de la IA",
  testID = "analysis-card",
}: {
  kind: AnalysisKind;
  /** Identifica lo analizado (id del entreno/actividad, lunes de la semana). */
  analysisKey: string;
  /** Se llama solo al pedir el análisis (puede ser caro de calcular). */
  data: () => string;
  stored?: StoredAnalysis;
  onSave: (a: StoredAnalysis) => void;
  auto?: boolean;
  title?: string;
  testID?: string;
}) {
  const token = useAuth((s) => s.token);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const run = async () => {
    if (!token || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await api.aiAnalyze(token, kind, data(), goalText());
      // Se guarda aunque ya no se vea la pantalla: el análisis va con la sesión.
      onSave({ at: new Date().toISOString(), result });
    } catch (e) {
      if (alive.current) setError(e instanceof ApiError ? e.message : "No se pudo analizar ahora");
    } finally {
      if (alive.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!auto || stored || !token || autoTried.has(`${kind}:${analysisKey}`)) return;
    autoTried.add(`${kind}:${analysisKey}`);
    // Pedir el análisis al entrar es justo lo que se quiere (una vez por sesión analizada).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void run();
    // Solo al entrar en la pantalla de esa sesión.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysisKey, token]);

  // Sin sesión no hay IA (igual que la burbuja del asistente): la tarjeta solo ocuparía sitio.
  if (!token) return null;

  return (
    <Card testID={testID} style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Icon name="sparkles-outline" size="sm" color="brandText" />
        <Text variant="heading" style={{ flex: 1 }}>
          {title}
        </Text>
      </View>

      {loading ? (
        <View style={{ gap: space.sm }} accessibilityLabel="Analizando" accessible>
          <Skeleton style={{ height: 20, width: "80%" }} />
          <Skeleton style={{ height: 16 }} />
          <Skeleton style={{ height: 16, width: "90%" }} />
          <Skeleton style={{ height: 16, width: "70%" }} />
        </View>
      ) : error ? (
        <Callout tone="danger" icon="alert-circle-outline" testID={`${testID}-error`} action={<Button label="Reintentar" size="sm" variant="secondary" onPress={run} />}>
          {error}
        </Callout>
      ) : stored ? (
        <>
          <AnalysisBody a={stored.result} />
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
            <Text variant="caption" color="faint" style={{ flexShrink: 1 }}>
              {fmtRelativeTime(Date.parse(stored.at))}
            </Text>
            <Button label="Volver a analizar" icon="refresh" size="sm" variant="ghost" onPress={run} />
          </View>
        </>
      ) : (
        <>
          <Text variant="body" color="muted">
            Compara con tus sesiones anteriores, busca récords y te dice qué ajustar la próxima vez.
          </Text>
          <Button testID={`${testID}-run`} label="Analizar con IA" icon="sparkles-outline" variant="secondary" onPress={run} />
        </>
      )}
    </Card>
  );
}
