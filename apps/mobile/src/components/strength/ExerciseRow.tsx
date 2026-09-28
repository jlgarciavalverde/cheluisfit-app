import { View } from "react-native";
import { EQUIPMENT_LABEL, type Exercise, MUSCLE_LABEL } from "@/domain/strength";
import { space } from "@/theme/tokens";
import { Badge } from "../ui/Badge";
import { ListRow } from "../ui/ListRow";
import { ExerciseThumb } from "./MediaStage";

export function muscleText(e: Pick<Exercise, "primary">): string {
  return e.primary.map((m) => MUSCLE_LABEL[m]).join(", ");
}

export function ExerciseRow({
  exercise,
  onPress,
  right,
  divider,
  testID,
}: {
  exercise: Exercise;
  onPress: () => void;
  right?: React.ReactNode;
  divider?: boolean;
  testID?: string;
}) {
  return (
    <ListRow
      testID={testID ?? `ex-${exercise.id}`}
      accessibilityLabel={`${exercise.name}. ${muscleText(exercise)}. ${EQUIPMENT_LABEL[exercise.equipment]}`}
      leading={<ExerciseThumb exercise={exercise} />}
      title={exercise.name}
      subtitle={`${muscleText(exercise)} · ${EQUIPMENT_LABEL[exercise.equipment]}`}
      meta={
        exercise.video || exercise.source === "custom" ? (
          <View style={{ flexDirection: "row", gap: space.xs }}>
            {exercise.video ? <Badge label="Mi vídeo" tone="brand" icon="videocam" /> : null}
            {exercise.source === "custom" ? <Badge label="Mío" tone="brand" icon="person" /> : null}
          </View>
        ) : undefined
      }
      trailing={right}
      divider={divider}
      minHeight={72}
      onPress={onPress}
    />
  );
}
