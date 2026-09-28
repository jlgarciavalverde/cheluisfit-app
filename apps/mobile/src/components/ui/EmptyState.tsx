import { View } from "react-native";
import { space } from "@/theme/tokens";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import { Text } from "./Text";

export function EmptyState({
  icon,
  title,
  text,
  actionLabel,
  onAction,
}: {
  icon: IconName;
  title: string;
  text?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={{ alignItems: "center", gap: space.md, paddingVertical: space.xxl, paddingHorizontal: space.xl }}>
      <Icon name={icon} size="hero" color="faint" />
      <Text variant="heading" align="center">
        {title}
      </Text>
      {text ? (
        <Text variant="body" color="muted" align="center">
          {text}
        </Text>
      ) : null}
      {actionLabel ? <Button label={actionLabel} onPress={onAction} /> : null}
    </View>
  );
}
