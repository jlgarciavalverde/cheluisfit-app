import { Platform, View } from "react-native";
import { RectButton } from "react-native-gesture-handler";
import ReanimatedSwipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { fmtGrams, fmtInt, fmtNum } from "@/domain/format";
import { MEAL_LABEL, type Entry, type MealSlot, type Nutrients } from "@/domain/types";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { Button, IconButton } from "../ui/Button";
import { Card } from "../ui/Card";
import { Icon, type IconName } from "../ui/Icon";
import { ListRow } from "../ui/ListRow";
import { Text } from "../ui/Text";

export const MEAL_ICON: Record<MealSlot, IconName> = {
  breakfast: "cafe-outline",
  midmorning: "leaf-outline",
  lunch: "restaurant-outline",
  snack: "ice-cream-outline",
  dinner: "moon-outline",
};

function EntryRow({
  entry,
  onOpen,
  onDelete,
}: {
  entry: Entry;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { c } = useTheme();
  const n = entry.nutrients;
  const main = (
    <View style={{ flex: 1 }}>
      <ListRow
        testID={`entry-${entry.id}`}
        accessibilityLabel={`${entry.name}, ${fmtGrams(entry.grams)}, ${fmtInt(n.kcal)} kilocalorías`}
        title={entry.name}
        subtitle={`${entry.brand ? `${entry.brand} · ` : ""}${fmtGrams(entry.grams)}`}
        meta={
          <Text variant="caption" color="faint" numberOfLines={1} tabular>
            P {fmtNum(n.protein)} · H {fmtNum(n.carbs)} · G {fmtNum(n.fat)}
          </Text>
        }
        value={
          <Text variant="bodyStrong" tabular>
            {fmtInt(n.kcal)}
            <Text variant="caption" color="muted">
              {" "}
              kcal
            </Text>
          </Text>
        }
        onPress={onOpen}
      />
    </View>
  );
  // En web no hay gesto de deslizar: botón de papelera aparte (no anidado en el botón principal).
  const row = (
    <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.surface }}>
      {main}
      {Platform.OS === "web" ? (
        <IconButton icon="trash-outline" label={`Eliminar ${entry.name}`} color="muted" onPress={onDelete} size="md" />
      ) : null}
    </View>
  );
  if (Platform.OS === "web") return row;
  return (
    <ReanimatedSwipeable
      overshootRight={false}
      rightThreshold={40}
      renderRightActions={() => (
        <View
          style={{
            width: 88,
            backgroundColor: c.dangerSoft,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <RectButton
            accessibilityLabel={`Eliminar ${entry.name}`}
            onPress={onDelete}
            style={{ flex: 1, width: "100%", alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="trash-outline" color="danger" />
          </RectButton>
        </View>
      )}
    >
      {row}
    </ReanimatedSwipeable>
  );
}

export function MealCard({
  slot,
  entries,
  totals,
  targetKcal,
  onAdd,
  onOpenEntry,
  onDeleteEntry,
  canCopyYesterday,
  onCopyYesterday,
  onSaveMeal,
}: {
  slot: MealSlot;
  entries: Entry[];
  totals: Nutrients;
  targetKcal: number;
  onAdd: () => void;
  onOpenEntry: (e: Entry) => void;
  onDeleteEntry: (e: Entry) => void;
  canCopyYesterday: boolean;
  onCopyYesterday: () => void;
  onSaveMeal?: () => void;
}) {
  const { c } = useTheme();
  const over = totals.kcal > targetKcal;
  return (
    <Card padded={false} testID={`meal-${slot}`} style={{ overflow: "hidden" }}>
      <View
        accessibilityRole="header"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.md,
          paddingHorizontal: space.lg,
          paddingTop: space.lg,
          paddingBottom: space.sm,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: radius.pill,
            backgroundColor: c.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={MEAL_ICON[slot]} size="md" color="brandText" />
        </View>
        <Text variant="heading" style={{ flex: 1 }}>
          {MEAL_LABEL[slot]}
        </Text>
        <Text variant="caption" color={over ? "warning" : "muted"} tabular>
          <Text variant="bodyStrong" color={over ? "warning" : "text"} tabular>
            {fmtInt(totals.kcal)}
          </Text>{" "}
          / {fmtInt(targetKcal)} kcal
        </Text>
      </View>

      <View style={{ paddingHorizontal: space.lg }}>
        {entries.length === 0 ? (
          <Text variant="body" color="faint" style={{ paddingVertical: space.sm }}>
            Nada registrado todavía
          </Text>
        ) : (
          entries.map((e, i) => (
            <View
              key={e.id}
              style={i > 0 ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}
            >
              <EntryRow entry={e} onOpen={() => onOpenEntry(e)} onDelete={() => onDeleteEntry(e)} />
            </View>
          ))
        )}
      </View>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: space.sm,
          padding: space.lg,
          paddingTop: space.sm,
        }}
      >
        <Button
          testID={`add-${slot}`}
          label="Añadir alimento"
          icon="add"
          variant={entries.length ? "secondary" : "primary"}
          size="sm"
          onPress={onAdd}
        />
        {canCopyYesterday && entries.length === 0 ? (
          <Button label="Copiar de ayer" icon="copy-outline" variant="ghost" size="sm" onPress={onCopyYesterday} />
        ) : null}
        {entries.length > 0 && onSaveMeal ? (
          <Button
            testID={`save-meal-${slot}`}
            label="Guardar como mi comida"
            icon="bookmark-outline"
            variant="ghost"
            size="sm"
            onPress={onSaveMeal}
          />
        ) : null}
      </View>
    </Card>
  );
}
