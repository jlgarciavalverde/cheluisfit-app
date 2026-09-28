import { View } from "react-native";
import { radius, space } from "@/theme/tokens";
import { useTheme } from "@/theme/ThemeProvider";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export type Tone = "neutral" | "success" | "warning" | "danger" | "brand";

export function Badge({ label, tone = "neutral", icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const { c } = useTheme();
  const map = {
    neutral: { bg: c.surfaceAlt, fg: "muted" },
    success: { bg: c.successSoft, fg: "success" },
    warning: { bg: c.warningSoft, fg: "warning" },
    danger: { bg: c.dangerSoft, fg: "danger" },
    brand: { bg: c.brandSoft, fg: "brandText" },
  } as const;
  const t = map[tone];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.xs,
        alignSelf: "flex-start",
        backgroundColor: t.bg,
        paddingHorizontal: space.sm,
        paddingVertical: space.hair + 1,
        borderRadius: radius.pill,
      }}
    >
      {icon && <Icon name={icon} size="xs" color={t.fg} />}
      <Text variant="tiny" color={t.fg}>
        {label}
      </Text>
    </View>
  );
}
