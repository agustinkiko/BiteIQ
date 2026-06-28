import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { MealCard } from "@/components/MealCard";
import { Screen } from "@/components/Screen";
import { colors, spacing } from "@/config/theme";
import { useAppStore } from "@/store/useAppStore";

export function MealHistoryScreen({ navigation }: any) {
  const logs = useAppStore((state) => state.logs);

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title" weight="800">History</AppText>
        <AppText color={colors.muted}>Review saved meals and AI estimates.</AppText>
      </View>

      {logs.map((log) => (
        <View key={log.date} style={styles.day}>
          <AppText variant="small" color={colors.muted} weight="800">{log.date}</AppText>
          {log.meals.map((meal) => (
            <MealCard key={meal.id} meal={meal} onPress={() => navigation.navigate("MealDetail", { mealId: meal.id })} />
          ))}
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm
  },
  day: {
    gap: spacing.md
  }
});
