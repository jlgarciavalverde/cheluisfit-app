import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";
import type { Palette } from "@/theme/tokens";
import { useDuration } from "./motion";

export function ProgressBar({
  value,
  max,
  color = "brand",
  height = 8,
  label,
}: {
  value: number;
  max: number;
  color?: keyof Palette;
  height?: number;
  /** Nombre accesible («Proteína: 67 de 156 gramos»). */
  label: string;
}) {
  const { c } = useTheme();
  const duration = useDuration(500);
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const w = useSharedValue(0);
  useEffect(() => {
    w.value = withTiming(pct, { duration });
  }, [pct, duration, w]);
  const style = useAnimatedStyle(() => ({ width: `${w.value * 100}%` }));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: Math.round(max), now: Math.round(value) }}
      style={{ height, borderRadius: height, backgroundColor: c.surfaceAlt, overflow: "hidden" }}
    >
      <Animated.View style={[{ height: "100%", borderRadius: height, backgroundColor: c[color] }, style]} />
    </View>
  );
}
