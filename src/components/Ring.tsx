import { PropsWithChildren, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";

import { colors, motion } from "@/config/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Props = PropsWithChildren<{
  /** Fraction of the goal reached. Values above 1 render as a full ring. */
  progress: number;
  size: number;
  thickness?: number;
  color?: string;
  trackColor?: string;
}>;

/**
 * Circular progress arc starting at 12 o'clock. Children render centered
 * inside the ring, which is how every macro/calorie readout in the app shows
 * its number. The arc sweeps from empty on mount and eases between values.
 */
export function Ring({ progress, size, thickness = 8, color = colors.primary, trackColor = colors.lavender, children }: Props) {
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withTiming(clamped, { duration: motion.fill, easing: Easing.out(Easing.cubic) });
  }, [clamped, sweep]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - sweep.value),
    // A round cap on a zero-length arc still paints a dot at 12 o'clock.
    strokeOpacity: sweep.value > 0.002 ? 1 : 0
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={thickness} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  }
});
