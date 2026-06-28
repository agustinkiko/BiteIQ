import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { colors, radius, spacing } from "@/config/theme";

export function ConfidenceBadge({ value }: { value: number }) {
  const color = value >= 0.85 ? colors.success : value >= 0.7 ? colors.warning : colors.danger;
  return (
    <View style={[styles.badge, { borderColor: color }]}>
      <AppText variant="tiny" color={color} weight="800">
        {Math.round(value * 100)}% confidence
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs
  }
});
