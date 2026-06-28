import { StyleSheet, View } from "react-native";

import { colors, radius } from "@/config/theme";

type Props = {
  value: number;
  color?: string;
};

export function ProgressBar({ value, color = colors.primary }: Props) {
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${Math.min(100, Math.max(0, value * 100))}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted
  },
  fill: {
    height: "100%",
    borderRadius: radius.sm
  }
});
