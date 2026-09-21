import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { AppText } from "@/components/AppText";
import { colors, elevation, motion, radius, spacing } from "@/config/theme";

type Props<T extends string> = {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Scrollable pill row instead of an equal-width segmented bar. */
  scrollable?: boolean;
  /** "pill": white thumb on a lavender track. "underline": tab labels over a sliding rule. */
  variant?: "pill" | "underline";
};

const TRACK_PADDING = 3;

export function Segmented<T extends string>(props: Props<T>) {
  if (props.scrollable) return <ChipRow {...props} />;
  return props.variant === "underline" ? <UnderlineTabs {...props} /> : <SegmentedBar {...props} />;
}

/**
 * Tracks the width of an equal-width row and springs an indicator to the
 * selected slot. The first placement is instant; only user changes slide.
 */
function useSlidingIndicator(count: number, selectedIndex: number, inset: number) {
  const [trackWidth, setTrackWidth] = useState(0);
  const slotWidth = trackWidth ? (trackWidth - inset * 2) / count : 0;
  const offset = useSharedValue(0);
  const placed = useRef(false);

  useEffect(() => {
    if (!slotWidth) return;
    const target = selectedIndex * slotWidth;
    offset.value = placed.current ? withSpring(target, motion.settle) : target;
    placed.current = true;
  }, [offset, slotWidth, selectedIndex]);

  const indicatorStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return { slotWidth, indicatorStyle, onLayout: (width: number) => setTrackWidth(width) };
}

function SegmentedBar<T extends string>({ options, value, onChange }: Props<T>) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const { slotWidth, indicatorStyle, onLayout } = useSlidingIndicator(options.length, selectedIndex, TRACK_PADDING);

  return (
    <View style={styles.bar} onLayout={(event) => onLayout(event.nativeEvent.layout.width)}>
      {slotWidth ? <Animated.View pointerEvents="none" style={[styles.thumb, { width: slotWidth }, indicatorStyle]} /> : null}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, !slotWidth && selected ? styles.segmentFallback : null]}
          >
            <AppText variant="small" weight={selected ? "600" : "500"} color={selected ? colors.ink : colors.muted}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function UnderlineTabs<T extends string>({ options, value, onChange }: Props<T>) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const { slotWidth, indicatorStyle, onLayout } = useSlidingIndicator(options.length, selectedIndex, 0);

  return (
    <View style={styles.tabs} onLayout={(event) => onLayout(event.nativeEvent.layout.width)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={styles.tab}
          >
            <AppText variant="body" weight={selected ? "600" : "500"} color={selected ? colors.primary : colors.muted}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
      {slotWidth ? (
        <Animated.View pointerEvents="none" style={[styles.underline, { width: slotWidth }, indicatorStyle]}>
          <View style={styles.underlineBar} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Horizontally scrolling filter chips; selection fills with brand blue. */
function ChipRow<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.chip, selected ? styles.chipSelected : null, { opacity: pressed ? 0.8 : 1 }]}
          >
            <AppText variant="small" weight="600" color={selected ? colors.onPrimary : colors.muted}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    padding: TRACK_PADDING,
    borderRadius: radius.pill,
    backgroundColor: colors.lavender
  },
  thumb: {
    position: "absolute",
    top: TRACK_PADDING,
    bottom: TRACK_PADDING,
    left: TRACK_PADDING,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    ...elevation.card
  },
  segment: {
    flex: 1,
    minHeight: 34,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  segmentFallback: {
    backgroundColor: colors.surface
  },
  tabs: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  tab: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center"
  },
  underline: {
    position: "absolute",
    left: 0,
    bottom: -1,
    height: 3,
    alignItems: "center"
  },
  underlineBar: {
    width: "70%",
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.primary
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingRight: spacing.lg
  },
  chip: {
    minHeight: 34,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  }
});
