import { View } from "react-native";
import { fmtInt } from "@/domain/format";
import type { Food } from "@/domain/types";
import { space } from "@/theme/tokens";
import { Badge } from "../ui/Badge";
import { IconButton } from "../ui/Button";
import { ListRow } from "../ui/ListRow";

export function FoodBadge({ food }: { food: Food }) {
  if (food.source === "user") return <Badge label="Mío" tone="brand" icon="person" />;
  if (food.source === "usda") return <Badge label="Genérico" tone="neutral" />;
  if (food.reliability === "verified") return <Badge label="Verificado" tone="success" icon="checkmark-circle" />;
  if (food.reliability === "incomplete") return <Badge label="Datos incompletos" tone="warning" icon="warning" />;
  return <Badge label="Comunitario" tone="neutral" icon="people-outline" />;
}

export function FoodRow({
  food,
  onOpen,
  onQuickAdd,
  divider,
}: {
  food: Food;
  onOpen: () => void;
  /** «+» que añade la ración habitual sin abrir la ficha. */
  onQuickAdd?: () => void;
  divider?: boolean;
}) {
  const serving = food.servings[0];
  return (
    <ListRow
      testID={`food-${food.id}`}
      accessibilityLabel={`${food.name}${food.brand ? `, ${food.brand}` : ""}, ${fmtInt(food.per100.kcal)} kilocalorías por 100 gramos`}
      title={food.name}
      subtitle={`${food.brand ? `${food.brand} · ` : ""}${food.per100.kcal > 0 ? `${fmtInt(food.per100.kcal)} kcal / 100 g` : "Sin datos nutricionales"}${serving ? ` · ${serving.label}` : ""}`}
      meta={
        <View style={{ alignItems: "flex-start", paddingTop: space.xs }}>
          <FoodBadge food={food} />
        </View>
      }
      minHeight={64}
      divider={divider}
      onPress={onOpen}
      trailing={
        onQuickAdd ? (
          <IconButton
            testID={`quick-add-${food.id}`}
            icon="add-circle"
            label={`Añadir ${serving ? serving.label : "100 g"} de ${food.name}`}
            color="brandText"
            size="xl"
            onPress={onQuickAdd}
          />
        ) : undefined
      }
    />
  );
}
