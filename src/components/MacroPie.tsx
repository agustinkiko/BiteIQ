import { ReactNode, useEffect } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import Svg, { Circle, G, Path } from "react-native-svg";

import { AppText } from "@/components/AppText";
import { colors, motion, spacing } from "@/config/theme";

export type PieSlice = {
  key: string;
  label: string;
  /** Drives the slice angle and the legend percentage. */
  value: number;
  color: string;
  /** Secondary readout for the legend, e.g. "158 g". */
  detail?: string;
};

type Props = {
  slices: PieSlice[];
  size?: number;
  /** Radius of the hole, as a fraction of the pie radius. 0 draws a full pie. */
  innerRatio?: number;
  /** Readout drawn in the hole of a donut. */
  children?: ReactNode;
};

/** Gap between slices, in radians, so adjacent colors don't bleed together. */
const SLICE_GAP = 0.035;

export function MacroPie({ slices, size = 200, innerRatio = 0, children }: Props) {
  const reveal = useSharedValue(0);
  useEffect(() => {
    reveal.value = withTiming(1, { duration: motion.fill, easing: Easing.out(Easing.cubic) });
  }, [reveal]);
  // The chart turns and opens into place, like a dial settling.
  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ rotate: `${(reveal.value - 1) * 90}deg` }, { scale: 0.86 + reveal.value * 0.14 }]
  }));

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const radius = size / 2;
  const center = radius;

  if (total <= 0) {
    return (
      <View style={{ width: size, height: size }}>
        <Svg width={size} height={size}>
          <Circle cx={center} cy={center} r={radius - 1} fill="none" stroke={colors.borderStrong} strokeWidth={2} strokeDasharray="4 6" />
        </Svg>
        <View style={styles.emptyLabel}>
          <AppText variant="small" color={colors.muted}>
            No food logged
          </AppText>
        </View>
      </View>
    );
  }

  let angle = -Math.PI / 2;
  const visible = slices.filter((slice) => slice.value > 0).length;
  const gap = visible > 1 ? SLICE_GAP : 0;

  return (
    <View style={{ width: size, height: size }}>
      <Animated.View style={revealStyle}>
        <Svg width={size} height={size}>
          <G>
            {slices.map((slice) => {
              const sweep = (slice.value / total) * Math.PI * 2;
              const start = angle;
              const end = angle + sweep;
              angle = end;
              if (sweep <= 0) return null;

              // A slice covering the whole circle can't be drawn as an arc, since
              // its start and end points coincide.
              if (sweep >= Math.PI * 2 - 0.0001) {
                return <Circle key={slice.key} cx={center} cy={center} r={radius} fill={slice.color} />;
              }

              const inset = Math.min(gap / 2, sweep / 4);
              return <Path key={slice.key} d={slicePath(center, radius, start + inset, end - inset)} fill={slice.color} />;
            })}
            {innerRatio > 0 ? <Circle cx={center} cy={center} r={radius * innerRatio} fill={colors.surface} /> : null}
          </G>
        </Svg>
      </Animated.View>
      {children ? (
        <View style={styles.emptyLabel} pointerEvents="none">
          {children}
        </View>
      ) : null}
    </View>
  );
}

function slicePath(center: number, radius: number, start: number, end: number): string {
  const x1 = center + radius * Math.cos(start);
  const y1 = center + radius * Math.sin(start);
  const x2 = center + radius * Math.cos(end);
  const y2 = center + radius * Math.sin(end);
  const largeArc = end - start > Math.PI ? 1 : 0;

  return `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

export function PieLegend({ slices }: { slices: PieSlice[] }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  return (
    <View style={styles.legend}>
      {slices.map((slice) => (
        <View key={slice.key} style={styles.legendRow}>
          <View style={[styles.swatch, { backgroundColor: slice.color }]} />
          <AppText style={styles.legendLabel} numberOfLines={1}>
            {slice.label}
          </AppText>
          {slice.detail ? <AppText weight="700">{slice.detail}</AppText> : null}
          <AppText weight="700" color={colors.muted} style={styles.legendPercent}>
            {total > 0 ? Math.round((slice.value / total) * 100) : 0}%
          </AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyLabel: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center"
  },
  legend: {
    gap: spacing.sm
  },
  legendRow: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 5
  },
  legendLabel: {
    flex: 1
  },
  legendPercent: {
    minWidth: 48,
    textAlign: "right"
  }
});
