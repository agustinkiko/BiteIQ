import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Svg, { Defs, RadialGradient, Rect, Stop } from "react-native-svg";

import { colors } from "@/config/theme";

type Props = {
  /** How far down the screen the glow reaches, in px. */
  height?: number;
};

/**
 * A soft pool of brand light behind a screen's header — two offset radial
 * gradients, so it reads as ambient light rather than a flat wash.
 */
export function AmbientGlow({ height = 420 }: Props) {
  // SVG gradient ids are document-global on web; colons break url(#…).
  const id = useId().replace(/:/g, "");

  return (
    <View pointerEvents="none" style={[styles.wrap, { height }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id={`${id}-primary`} cx="18%" cy="0%" rx="75%" ry="70%">
            <Stop offset="0" stopColor={colors.primary} stopOpacity={0.1} />
            <Stop offset="1" stopColor={colors.primary} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id={`${id}-violet`} cx="92%" cy="10%" rx="60%" ry="55%">
            <Stop offset="0" stopColor={colors.violet} stopOpacity={0.06} />
            <Stop offset="1" stopColor={colors.blue} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id}-primary)`} />
        <Rect width="100%" height="100%" fill={`url(#${id}-violet)`} />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0
  }
});
