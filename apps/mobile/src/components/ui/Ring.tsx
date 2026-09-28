import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { useTheme } from "@/theme/ThemeProvider";
import type { Palette } from "@/theme/tokens";
import { useDuration } from "./motion";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Anillo de progreso animado. Pasado el 100 % se completa en color de aviso. */
export function Ring({
  value,
  max,
  size = 200,
  stroke = 16,
  color = "brand",
  overColor = "warning",
  children,
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  color?: keyof Palette;
  overColor?: keyof Palette;
  children?: React.ReactNode;
}) {
  const { c } = useTheme();
  const duration = useDuration(650);
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const ratio = max > 0 ? Math.max(0, value / max) : 0;
  const over = ratio > 1;
  const offset = useSharedValue(circ);

  useEffect(() => {
    offset.value = withTiming(circ * (1 - Math.min(1, ratio)), { duration });
  }, [ratio, circ, duration, offset]);

  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }));

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} style={{ position: "absolute", transform: [{ rotate: "-90deg" }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.surfaceAlt} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? c[overColor] : c[color]}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circ} ${circ}`}
          animatedProps={animatedProps}
        />
      </Svg>
      {children}
    </View>
  );
}
