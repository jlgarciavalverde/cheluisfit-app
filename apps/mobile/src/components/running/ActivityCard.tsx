import { Pressable, View } from "react-native";
import { dayLabel, shortDayLabel } from "@/domain/dates";
import { fmtDuration, fmtKm, fmtPace } from "@/domain/format";
import { type Activity, avgPace, SOURCE_LABEL, type Template } from "@/domain/running";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { Badge } from "../ui/Badge";
import { Card } from "../ui/Card";
import { Icon, type IconName } from "../ui/Icon";

export const SOURCE_ICON: Record<Activity["source"], IconName> = { garmin: "watch-outline", strava: "navigate-outline", manual: "create-outline" };
import { Stat } from "../ui/Stat";
import { Text } from "../ui/Text";

export function ActivityCard({
  activity,
  template,
  onPress,
}: {
  activity: Activity;
  template?: Template;
  onPress: () => void;
}) {
  const { c } = useTheme();
  const rel = dayLabel(activity.date);
  const when = ["Hoy", "Ayer", "Mañana"].includes(rel) ? `${rel} · ${shortDayLabel(activity.date)}` : rel;
  return (
    <Pressable
      testID={`activity-${activity.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${activity.title}, ${when}, ${fmtKm(activity.distanceM)} kilómetros`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Card style={{ gap: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: radius.pill,
              backgroundColor: c.brandSoft,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="walk" size="md" color="brandText" />
          </View>
          <View style={{ flex: 1 }}>
            <Text variant="subheading" numberOfLines={1}>
              {activity.title}
            </Text>
            <Text variant="caption" color="muted">
              {when}
            </Text>
          </View>
          <Badge label={SOURCE_LABEL[activity.source]} icon={SOURCE_ICON[activity.source]} tone="neutral" />
        </View>
        <View style={{ flexDirection: "row", gap: space.md }}>
          <Stat style={{ flex: 1 }} value={fmtKm(activity.distanceM)} unit="km" label="Distancia" />
          <Stat style={{ flex: 1 }} value={fmtDuration(activity.durationS)} label="Tiempo" />
          <Stat style={{ flex: 1 }} value={fmtPace(avgPace(activity))} unit="/km" label="Ritmo" />
          {activity.avgHr ? <Stat style={{ flex: 1 }} value={String(activity.avgHr)} unit="ppm" label="FC media" /> : null}
        </View>
        {template ? (
          <Text variant="caption" color="brandText">
            De la plantilla «{template.name}»
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}
