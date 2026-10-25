import type { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/theme/ThemeProvider";
import { radius, space } from "@/theme/tokens";
import { haptic } from "./ui/haptics";
import { Icon, type IconName } from "./ui/Icon";
import { Text } from "./ui/Text";
import { useNotifications } from "@/data/notificationsStore";

/** Props que recibe la barra personalizada de `Tabs` (el tipo no se exporta directamente). */
export type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>["tabBar"]>>[0];

export const TAB_META: Record<string, { label: string; icon: IconName; active: IconName }> = {
  index: { label: "Hoy", icon: "home-outline", active: "home" },
  nutricion: { label: "Nutrición", icon: "nutrition-outline", active: "nutrition" },
  running: { label: "Running", icon: "walk-outline", active: "walk" },
  fuerza: { label: "Fuerza", icon: "barbell-outline", active: "barbell" },
  social: { label: "Social", icon: "people-outline", active: "people" },
  mas: { label: "Más", icon: "ellipsis-horizontal-circle-outline", active: "ellipsis-horizontal-circle" },
};

/**
 * Barra inferior en móvil. En escritorio la navegación la pinta `DesktopSidebar` (persistente
 * en todo `Shell`, no solo dentro de `(tabs)`); esta solo se usa como `tabBar` de `Tabs` en
 * compacto/medio.
 */
export function AppTabBar({ state, navigation }: TabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const unread = useNotifications((s) => s.unread);

  const items = state.routes.map((route, index) => {
    const meta = TAB_META[route.name];
    if (!meta) return null;
    const focused = state.index === index;
    const go = () => {
      haptic.tap();
      const e = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
      if (!focused && !e.defaultPrevented) navigation.navigate(route.name, route.params);
    };
    return (
      <Pressable
        key={route.key}
        testID={`tab-${route.name}`}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={route.name === "social" && unread > 0 ? `${meta.label}, ${unread} ${unread === 1 ? "aviso nuevo" : "avisos nuevos"}` : meta.label}
        onPress={go}
        style={{ flex: 1, alignItems: "center", justifyContent: "center", minHeight: 56, gap: 2 }}
      >
        <View
          style={{
            paddingHorizontal: space.lg,
            paddingVertical: 4,
            // Radio explícito (mitad de la altura): en Android 999 no se aplicaba aquí.
            borderRadius: radius.tab,
            overflow: "hidden",
            backgroundColor: focused ? c.brandSoft : "transparent",
          }}
        >
          <Icon name={focused ? meta.active : meta.icon} size="lg" color={focused ? "brandText" : "muted"} />
          {route.name === "social" && unread > 0 ? <UnreadDot /> : null}
        </View>
        {/* Seis pestañas en 360 dp: «Nutrición» con la letra grande se partía en dos líneas. */}
        <Text variant="tiny" color={focused ? "brandText" : "muted"} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.2}>
          {meta.label}
        </Text>
      </Pressable>
    );
  });

  return (
    <View
      testID="app-tab-bar"
      accessibilityRole="tablist"
      style={{
        flexDirection: "row",
        backgroundColor: c.surface,
        borderTopWidth: 1,
        borderTopColor: c.border,
        paddingBottom: insets.bottom,
        paddingTop: space.xs,
      }}
    >
      {items}
    </View>
  );
}

/** Punto de «hay avisos nuevos» sobre el icono de Social (también lo usa `DesktopSidebar`). */
export function UnreadDot() {
  const { c } = useTheme();
  return (
    <View
      testID="social-unread-dot"
      pointerEvents="none"
      style={{ position: "absolute", top: 3, right: space.md, width: 8, height: 8, borderRadius: radius.xs, backgroundColor: c.danger, borderWidth: 2, borderColor: c.surface }}
    />
  );
}
