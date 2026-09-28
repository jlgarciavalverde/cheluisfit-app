import { router, usePathname } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TAB_META } from "./AppTabBar";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { haptic } from "./ui/haptics";
import { Icon } from "./ui/Icon";
import { Text } from "./ui/Text";

/** Orden de las pestañas en la barra lateral (mismo orden que `(tabs)/_layout.tsx`). */
const ROUTES = [
  { name: "index", path: "/" },
  { name: "nutricion", path: "/nutricion" },
  { name: "running", path: "/running" },
  { name: "fuerza", path: "/fuerza" },
  { name: "social", path: "/social" },
  { name: "mas", path: "/mas" },
] as const;

/**
 * Barra lateral de escritorio, persistente en TODA la app (no solo dentro de `(tabs)`).
 * Vive en el `Shell` raíz, fuera del `Stack`, así que se guía por la URL (`usePathname`) en
 * vez del estado interno de `Tabs` — al entrar en una pantalla de detalle (fuera del grupo
 * `(tabs)`) sigue montada. Ver plan de escritorio para el porqué.
 */
export function DesktopSidebar() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  return (
    <View
      accessibilityRole="tablist"
      style={{
        width: 248,
        backgroundColor: c.surface,
        borderRightWidth: 1,
        borderRightColor: c.border,
        paddingTop: insets.top + space.xl,
        paddingHorizontal: space.md,
        gap: space.xs,
      }}
    >
      <View style={{ paddingHorizontal: space.lg, paddingBottom: space.xl }}>
        <Text variant="display" style={{ letterSpacing: 0.5 }}>
          CHELUIS<Text variant="display" color="brand">FIT</Text>
        </Text>
      </View>
      {ROUTES.map(({ name, path }) => {
        const meta = TAB_META[name];
        const focused = pathname === path;
        return (
          <Pressable
            key={name}
            testID={`tab-${name}`}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            onPress={() => {
              haptic.tap();
              if (!focused) router.navigate(path);
            }}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: space.md,
              minHeight: 48,
              paddingHorizontal: space.lg,
              borderRadius: radius.md,
              backgroundColor: focused ? c.brandSoft : "transparent",
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Icon name={focused ? meta.active : meta.icon} size="md" color={focused ? "brandText" : "muted"} />
            <Text variant="bodyStrong" color={focused ? "brandText" : "muted"}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
