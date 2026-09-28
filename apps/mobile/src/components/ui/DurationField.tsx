import { useState } from "react";
import { View } from "react-native";
import { space } from "@/theme/tokens";
import { Text } from "./Text";
import { TextField } from "./TextField";

const digits = (s: string) => s.replace(/\D/g, "").slice(0, 2);

/**
 * Duración en campos numéricos separados (h · min · s). Evita escribir «52:30»:
 * el teclado numérico de Android no tiene los dos puntos.
 * `onChange` recibe los segundos, o `null` si está todo vacío.
 */
export function DurationField({
  label,
  value,
  onChange,
  hours = false,
  error,
  hint,
  testID,
}: {
  label: string;
  value: number | null;
  onChange: (seconds: number | null) => void;
  hours?: boolean;
  error?: string;
  hint?: string;
  testID?: string;
}) {
  const [h, setH] = useState(() => (value && hours && value >= 3600 ? String(Math.floor(value / 3600)) : ""));
  const [m, setM] = useState(() => (value ? String(Math.floor((value % (hours ? 3600 : 1e9)) / 60)) : ""));
  const [s, setS] = useState(() => (value ? String(value % 60) : ""));

  const emit = (hh: string, mm: string, ss: string) => {
    if (!hh && !mm && !ss) return onChange(null);
    onChange((Number(hh) || 0) * 3600 + (Number(mm) || 0) * 60 + (Number(ss) || 0));
  };

  return (
    <View style={{ gap: space.xs, flex: 1 }}>
      <Text variant="caption" color="muted">
        {label}
      </Text>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        {hours ? (
          <TextField
            testID={testID ? `${testID}-h` : undefined}
            label="Horas"
            suffix="h"
            keyboardType="number-pad"
            value={h}
            onChangeText={(t) => {
              const v = digits(t);
              setH(v);
              emit(v, m, s);
            }}
            placeholder="0"
          />
        ) : null}
        <TextField
          testID={testID ? `${testID}-m` : undefined}
          label="Minutos"
          suffix="min"
          keyboardType="number-pad"
          value={m}
          onChangeText={(t) => {
            const v = hours ? digits(t) : t.replace(/\D/g, "").slice(0, 3);
            setM(v);
            emit(h, v, s);
          }}
          placeholder="0"
        />
        <TextField
          testID={testID ? `${testID}-s` : undefined}
          label="Segundos"
          suffix="s"
          keyboardType="number-pad"
          value={s}
          onChangeText={(t) => {
            const v = digits(t);
            setS(v);
            emit(h, m, v);
          }}
          placeholder="0"
        />
      </View>
      {error ? (
        <Text variant="caption" color="danger">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}
