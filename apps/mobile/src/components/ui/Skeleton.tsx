import { useEffect } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { useTheme } from "@/theme/ThemeProvider";

/** Marcador de carga: un bloque que «respira» (quieto con «reducir movimiento»). */
export function Skeleton({ style }: { style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (reduce) return;
    o.value = withRepeat(withTiming(0.5, { duration: 800 }), -1, true);
  }, [reduce, o]);
  const anim = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[{ backgroundColor: c.surfaceAlt }, anim, style]} />;
}
