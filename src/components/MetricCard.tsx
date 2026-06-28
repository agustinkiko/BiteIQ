import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { ProgressBar } from "@/components/ProgressBar";
import { colors, spacing } from "@/config/theme";

type Props = {
  label: string;
  value: number;
  goal: number;
  unit: string;
  color?: string;
};

export function MetricCard({ label, value, goal, unit, color = colors.primary }: Props) {
  return (
    <View style={styles.wrap}>
      <AppText variant="small" color={colors.muted} weight="600">
        {label}
      </AppText>
      <AppText variant="h2" weight="800">
        {Math.round(value)}
        <AppText variant="small" color={colors.muted}> / {goal}{unit}</AppText>
      </AppText>
      <ProgressBar value={goal ? value / goal : 0} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minWidth: 138,
    gap: spacing.sm
  }
});
