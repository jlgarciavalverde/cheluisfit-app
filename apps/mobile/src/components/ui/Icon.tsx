import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/theme/ThemeProvider";
import { type IconSize, iconSize, type Palette } from "@/theme/tokens";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

export function Icon({
  name,
  size = "md",
  color = "text",
}: {
  name: IconName;
  /** Nombre de la escala (`xs`…`hero`). */
  size?: IconSize;
  color?: keyof Palette;
}) {
  const { c } = useTheme();
  return <Ionicons name={name} size={iconSize[size]} color={c[color]} accessible={false} />;
}
