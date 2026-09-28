import { Tabs } from "expo-router";
import { AppTabBar } from "@/components/AppTabBar";
import { useBreakpoint } from "@/theme/ThemeProvider";

export default function TabsLayout() {
  const { isWide } = useBreakpoint();
  return (
    <Tabs
      tabBar={isWide ? () => null : (props) => <AppTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" options={{ title: "Hoy" }} />
      <Tabs.Screen name="nutricion" options={{ title: "Nutrición" }} />
      <Tabs.Screen name="running" options={{ title: "Running" }} />
      <Tabs.Screen name="fuerza" options={{ title: "Fuerza" }} />
      <Tabs.Screen name="social" options={{ title: "Social" }} />
      <Tabs.Screen name="mas" options={{ title: "Más" }} />
    </Tabs>
  );
}
