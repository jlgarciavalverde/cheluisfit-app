import { Image } from "expo-image";
import { View } from "react-native";
import { Text } from "@/components/ui";
import { useTheme } from "@/theme/ThemeProvider";
import { radius } from "@/theme/tokens";

const SIZE = { sm: 32, md: 40, lg: 64 } as const;

/** Iniciales del avatar cuando no hay foto — igual de reconocible, sin depender de la red. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Avatar({ name, url, size = "md" }: { name: string; url?: string; size?: keyof typeof SIZE }) {
  const { c } = useTheme();
  const d = SIZE[size];
  if (url) {
    return (
      <Image
        source={{ uri: url }}
        contentFit="cover"
        accessibilityLabel={`Foto de ${name}`}
        style={{ width: d, height: d, borderRadius: radius.pill, backgroundColor: c.surfaceAlt }}
      />
    );
  }
  return (
    <View
      accessibilityLabel={`Foto de ${name}`}
      style={{ width: d, height: d, borderRadius: radius.pill, backgroundColor: c.brandSoft, alignItems: "center", justifyContent: "center" }}
    >
      <Text variant={size === "lg" ? "heading" : "bodyStrong"} color="brandText">
        {initials(name)}
      </Text>
    </View>
  );
}
