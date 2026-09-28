import { useState } from "react";
import { View } from "react-native";
import { fmtKg, parseNum } from "@/domain/format";
import { platesPerSide } from "@/domain/strength";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { BottomSheet } from "../ui/BottomSheet";
import { Button } from "../ui/Button";
import { Text } from "../ui/Text";
import { TextField } from "../ui/TextField";
import { Overline } from "../ui/Section";

/** Calculadora de discos: cuántos discos poner a cada lado para un peso total con la barra. */
export function PlatesSheet({
  visible,
  onClose,
  initialKg,
  barKg,
  plates,
}: {
  visible: boolean;
  onClose: () => void;
  initialKg: number | null;
  barKg: number;
  plates: number[];
}) {
  const { c } = useTheme();
  const [text, setText] = useState(initialKg ? fmtKg(initialKg) : "");
  const total = parseNum(text);
  const load = total !== null && total >= barKg ? platesPerSide(total, barKg, plates) : null;
  return (
    <BottomSheet visible={visible} onClose={onClose} title="Calculadora de discos" subtitle={`Barra de ${fmtKg(barKg)} kg`}>
      <View style={{ gap: space.md }}>
        <TextField testID="plates-total" label="Peso total" suffix="kg" keyboardType="decimal-pad" value={text} onChangeText={setText} selectTextOnFocus />
        {total !== null && total < barKg ? (
          <Text variant="caption" color="warning">
            Es menos que la barra ({fmtKg(barKg)} kg).
          </Text>
        ) : null}
        {load ? (
          <View style={{ gap: space.sm }} testID="plates-result">
            <Overline color="muted">Por cada lado</Overline>
            {load.perSide.length === 0 ? (
              <Text variant="body" color="muted">
                Solo la barra.
              </Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
                {load.perSide.map((p) => (
                  <View
                    key={p.kg}
                    style={{ flexDirection: "row", alignItems: "center", gap: space.xs, paddingHorizontal: space.md, minHeight: 44, borderRadius: radius.pill, backgroundColor: c.surfaceAlt, borderWidth: 1, borderColor: c.border }}
                  >
                    <Text variant="heading" tabular>
                      {p.count} ×
                    </Text>
                    <Text variant="heading" color="brandText" tabular>
                      {fmtKg(p.kg)} kg
                    </Text>
                  </View>
                ))}
              </View>
            )}
            {load.remainder > 0 ? (
              <Text variant="caption" color="warning">
                Sobran {fmtKg(load.remainder)} kg que no se pueden cargar con esos discos.
              </Text>
            ) : null}
          </View>
        ) : null}
        <Button label="Cerrar" variant="secondary" fullWidth onPress={onClose} />
      </View>
    </BottomSheet>
  );
}
