import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Ring } from "@/components/Ring";
import { colors, dataColors, spacing } from "@/config/theme";
import { rawRatio } from "@/services/nutritionMath";
import { Goal, NutritionEstimate } from "@/types/domain";

export const macroColors = {
  protein: dataColors.protein,
  carbs: dataColors.carbs,
  fat: dataColors.fat
};

type Props = {
  totals: Pick<NutritionEstimate, "proteinGrams" | "carbGrams" | "fatGrams">;
  goal: Goal;
  size?: number;
  showRemaining?: boolean;
};

/** Protein / Carbs / Fats rings, each with its grams in the middle and a keyed legend below. */
export function MacroRings({ totals, goal, size = 84, showRemaining = true }: Props) {
  const macros = [
    { key: "protein", label: "Protein", value: totals.proteinGrams, target: goal.proteinGrams, color: macroColors.protein },
    { key: "carbs", label: "Carbs", value: totals.carbGrams, target: goal.carbGrams, color: macroColors.carbs },
    { key: "fat", label: "Fats", value: totals.fatGrams, target: goal.fatGrams, color: macroColors.fat }
  ];

  return (
    <View style={styles.row}>
      {macros.map((macro) => {
        const left = Math.round(macro.target - macro.value);
        return (
          <View key={macro.key} style={styles.item}>
            <Ring progress={rawRatio(macro.value, macro.target)} size={size} thickness={size >= 80 ? 9 : 7} color={macro.color}>
              <AppText variant={size >= 80 ? "h2" : "h3"} weight="700" style={styles.value}>
                {Math.round(macro.value)}
              </AppText>
              <AppText variant="small" weight="600" style={styles.unit}>
                g
              </AppText>
            </Ring>
            <View style={styles.legend}>
              <View style={styles.legendValue}>
                <View style={[styles.swatch, { backgroundColor: macro.color }]} />
                <AppText variant="small" weight="600">
                  {macro.label}
                </AppText>
              </View>
              <AppText variant="tiny" color={colors.muted}>
                of {Math.round(macro.target)}g
              </AppText>
              {showRemaining ? (
                <AppText variant="tiny" color={left >= 0 ? colors.subtle : colors.warning}>
                  {left >= 0 ? `${left} g left` : `${Math.abs(left)} g over`}
                </AppText>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: spacing.md
  },
  value: {
    marginBottom: -6
  },
  unit: {
    marginTop: -2
  },
  legend: {
    alignSelf: "stretch",
    alignItems: "center",
    gap: 2
  },
  legendValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2
  }
});
