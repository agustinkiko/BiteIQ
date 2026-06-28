import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { MealCard } from "@/components/MealCard";
import { MetricCard } from "@/components/MetricCard";
import { Screen } from "@/components/Screen";
import { colors, spacing } from "@/config/theme";
import { useTodayLog } from "@/hooks/useTodayLog";
import { useAppStore } from "@/store/useAppStore";
export function HomeScreen({ navigation }: any) {
  const goal = useAppStore((state) => state.goal);
  const user = useAppStore((state) => state.user);
  const { log, totals } = useTodayLog();

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText variant="small" color={colors.muted} weight="700">
            Today
          </AppText>
          <AppText variant="title" weight="800">
            Hi, {user.name}
          </AppText>
        </View>
        <Button label="Add" icon="camera" onPress={() => navigation.navigate("AddMeal")} style={styles.addButton} />
      </View>

      <Card style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View>
            <AppText variant="small" color={colors.muted} weight="700">
              Calories
            </AppText>
            <AppText variant="title" weight="800">
              {Math.round(totals.calories)}
              <AppText variant="h3" color={colors.muted}> / {goal.calories}</AppText>
            </AppText>
          </View>
          <AppText variant="small" color={colors.primary} weight="800">
            {Math.max(0, goal.calories - totals.calories)} left
          </AppText>
        </View>
        <View style={styles.metricGrid}>
          <MetricCard label="Protein" value={totals.proteinGrams} goal={goal.proteinGrams} unit="g" color={colors.primary} />
          <MetricCard label="Carbs" value={totals.carbGrams} goal={goal.carbGrams} unit="g" color={colors.blue} />
          <MetricCard label="Fat" value={totals.fatGrams} goal={goal.fatGrams} unit="g" color={colors.accent} />
        </View>
      </Card>

      <View style={styles.sectionHeader}>
        <AppText variant="h2" weight="800">
          Meals logged
        </AppText>
        <AppText variant="small" color={colors.muted}>
          {log.meals.length} today
        </AppText>
      </View>

      {log.meals.map((meal) => (
        <MealCard key={meal.id} meal={meal} onPress={() => navigation.navigate("MealDetail", { mealId: meal.id })} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  addButton: {
    minWidth: 96
  },
  heroCard: {
    gap: spacing.lg
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  metricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  }
});
