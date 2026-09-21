import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { ProgressBar } from "@/components/ProgressBar";
import { colors, dataColors, spacing } from "@/config/theme";
import { rawRatio } from "@/services/nutritionMath";
import { Goal, NutritionEstimate } from "@/types/domain";

type Props = {
  totals: Pick<NutritionEstimate, "proteinGrams" | "carbGrams" | "fatGrams">;
  goal: Goal;
};

/** Carbs / fat / protein as labelled meters — denser than rings, easier to compare. */
export function MacroBars({ totals, goal }: Props) {
  const macros = [
    { key: "carbs", label: "Carbs", value: totals.carbGrams, target: goal.carbGrams, color: dataColors.carbs },
    { key: "fat", label: "Fat", value: totals.fatGrams, target: goal.fatGrams, color: dataColors.fat },
    { key: "protein", label: "Protein", value: totals.proteinGrams, target: goal.proteinGrams, color: dataColors.protein }
  ];

  return (
    <View style={styles.list}>
      {macros.map((macro) => {
        const left = Math.round(macro.target - macro.value);
        return (
          <View key={macro.key} style={styles.item}>
            <View style={styles.head}>
              <View style={[styles.dot, { backgroundColor: macro.color }]} />
              <AppText variant="small" weight="700" style={styles.label}>
                {macro.label}
              </AppText>
              <AppText variant="small" weight="700">
                {Math.round(macro.value)}
                <AppText variant="small" color={colors.subtle}>
                  {" "}/ {Math.round(macro.target)} g
                </AppText>
              </AppText>
            </View>
            <ProgressBar value={rawRatio(macro.value, macro.target)} color={macro.color} height={6} />
            <AppText variant="tiny" color={left >= 0 ? colors.muted : colors.warning}>
              {left >= 0 ? `${left} g left` : `${Math.abs(left)} g over`}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.lg
  },
  item: {
    gap: 6
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4
  },
  label: {
    flex: 1
  }
});
