import { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { colors, motion, radius } from "@/config/theme";

type Props = {
  value: number;
  color?: string;
  height?: number;
};

/** A thin meter that fills from the left on mount and eases between values. */
export function ProgressBar({ value, color = colors.primary, height = 8 }: Props) {
  const clamped = Math.min(1, Math.max(0, value));
  const fill = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming(clamped, { duration: motion.fill, easing: Easing.out(Easing.cubic) });
  }, [clamped, fill]);

  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={[styles.track, { height }]}>
      <Animated.View style={[styles.fill, { backgroundColor: color }, fillStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.lavender
  },
  fill: {
    height: "100%",
    borderRadius: radius.pill
  }
});
