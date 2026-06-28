import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Screen } from "@/components/Screen";
import { colors, spacing } from "@/config/theme";
import { mealCalories } from "@/services/nutritionMath";
import { useAppStore } from "@/store/useAppStore";
import { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "MealDetail">;

export function MealDetailScreen({ navigation, route }: Props) {
  const meal = useAppStore((state) => state.logs.flatMap((log) => log.meals).find((item) => item.id === route.params.mealId));

  if (!meal) {
    return (
      <Screen>
        <AppText variant="h2" weight="800">Meal not found</AppText>
        <Button label="Back" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Button label="Back" variant="ghost" icon="chevron-back" onPress={() => navigation.goBack()} />
      <View style={styles.header}>
        <AppText variant="title" weight="800">{meal.title}</AppText>
        <AppText color={colors.muted}>{meal.mealType} • captured with {meal.capturedWith}</AppText>
        <ConfidenceBadge value={meal.inference.confidence} />
      </View>

      <Card style={styles.summary}>
        <AppText variant="small" color={colors.muted} weight="700">Meal calories</AppText>
        <AppText variant="title" weight="800">{Math.round(mealCalories(meal))}</AppText>
        <AppText color={colors.muted}>{meal.inference.summary}</AppText>
      </Card>

      {meal.entries.map((entry) => (
        <Card key={entry.id} style={styles.entry}>
          <View style={styles.row}>
            <View style={styles.entryText}>
              <AppText variant="h3" weight="800">{entry.foodItem.name}</AppText>
              <AppText variant="small" color={colors.muted}>{entry.foodItem.servingSize}</AppText>
            </View>
            <AppText variant="h3" weight="800">{Math.round(entry.foodItem.nutrition.calories)}</AppText>
          </View>
          <AppText color={colors.muted}>
            P {Math.round(entry.foodItem.nutrition.proteinGrams)}g • C {Math.round(entry.foodItem.nutrition.carbGrams)}g • F {Math.round(entry.foodItem.nutrition.fatGrams)}g
          </AppText>
          <AppText variant="tiny" color={colors.muted}>Sources: {entry.foodItem.provenance.join(", ")}</AppText>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm
  },
  summary: {
    gap: spacing.sm
  },
  entry: {
    gap: spacing.sm
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  entryText: {
    flex: 1,
    gap: spacing.xs
  }
});
