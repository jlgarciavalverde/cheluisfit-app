import { View } from "react-native";
import { dayLabel, shortDayLabel } from "@/domain/dates";
import { fmtDuration, fmtKm, fmtPace } from "@/domain/format";
import { type Activity, avgPace, SOURCE_LABEL, type Template } from "@/domain/running";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { Badge } from "../ui/Badge";
import { PressableCard } from "../ui/Card";
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
    <PressableCard
      testID={`activity-${activity.id}`}
      accessibilityLabel={`${activity.title}, ${when}, ${fmtKm(activity.distanceM)} kilómetros`}
      onPress={onPress}
      style={{ gap: space.md }}
    >
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
        {/* Con 4 datos en un móvil estrecho no caben en una fila (un tiempo de más de una hora se
            partía): bajan de dos en dos. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.md, rowGap: space.sm }}>
          <Stat style={{ flexGrow: 1, flexBasis: activity.avgHr ? "40%" : 0, minWidth: 0 }} value={fmtKm(activity.distanceM)} unit="km" label="Distancia" />
          <Stat style={{ flexGrow: 1, flexBasis: activity.avgHr ? "40%" : 0, minWidth: 0 }} value={fmtDuration(activity.durationS)} label="Tiempo" />
          <Stat style={{ flexGrow: 1, flexBasis: activity.avgHr ? "40%" : 0, minWidth: 0 }} value={activity.distanceM > 0 ? fmtPace(avgPace(activity)) : "—"} unit={activity.distanceM > 0 ? "/km" : undefined} label="Ritmo" />
          {activity.avgHr ? <Stat style={{ flexGrow: 1, flexBasis: "40%", minWidth: 0 }} value={String(activity.avgHr)} unit="ppm" label="FC media" /> : null}
        </View>
        {template ? (
          <Text variant="caption" color="brandText">
            De la plantilla «{template.name}»
          </Text>
        ) : null}
    </PressableCard>
  );
}
