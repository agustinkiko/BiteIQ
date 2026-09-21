import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { colors, spacing } from "@/config/theme";
import { useDayLog } from "@/hooks/useDayLog";
import { formatDiaryDate, formatTime } from "@/services/dates";
import { mealCalories } from "@/services/nutritionMath";
import { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "MealDetail">;

export function MealDetailScreen({ navigation, route }: Props) {
  const { mealId, date } = route.params;
  const { log, deleteEntry, isLoading } = useDayLog(date);
  const meal = log.meals.find((item) => item.id === mealId);

  if (isLoading && !meal) {
    return (
      <Screen>
        <ScreenHeader title="Meal details" onBack={() => navigation.goBack()} />
        <View style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <AppText color={colors.muted}>Loading diary entry…</AppText>
        </View>
      </Screen>
    );
  }

  if (!meal) {
    return (
      <Screen>
        <ScreenHeader title="Meal not found" onBack={() => navigation.goBack()} />
        <AppText color={colors.muted}>This meal is no longer in your diary.</AppText>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screen}>
      <ScreenHeader
        title={meal.title}
        subtitle={`${meal.mealType} • ${formatDiaryDate(date)} at ${formatTime(meal.capturedAt)}`}
        onBack={() => navigation.goBack()}
      />

      <Card style={styles.summary}>
        <AppText variant="small" color={colors.muted} weight="700">
          Meal calories
        </AppText>
        <AppText variant="title" weight="800">
          {Math.round(mealCalories(meal))}
        </AppText>
        {meal.inference ? (
          <>
            <ConfidenceBadge value={meal.inference.confidence} />
            <AppText color={colors.muted}>{meal.inference.summary}</AppText>
            <AppText variant="tiny" color={colors.subtle}>
              {meal.inference.modelName} • captured with {meal.capturedWith}
            </AppText>
          </>
        ) : (
          <AppText color={colors.muted}>
            Logged from the food database — no AI estimate involved.
          </AppText>
        )}
      </Card>

      {meal.entries.map((entry) => (
        <Card key={entry.id} style={styles.entry}>
          <View style={styles.row}>
            <View style={styles.entryText}>
              <AppText variant="h3" weight="800">
                {entry.foodItem.name}
              </AppText>
              <AppText variant="small" color={colors.muted}>
                {entry.foodItem.quantity === 1 ? entry.foodItem.servingSize : `${entry.foodItem.quantity} × ${entry.foodItem.servingSize}`}
              </AppText>
            </View>
            <AppText variant="h3" weight="800">
              {Math.round(entry.foodItem.nutrition.calories)}
            </AppText>
          </View>
          <AppText color={colors.muted}>
            P {Math.round(entry.foodItem.nutrition.proteinGrams)}g • C {Math.round(entry.foodItem.nutrition.carbGrams)}g • F{" "}
            {Math.round(entry.foodItem.nutrition.fatGrams)}g
          </AppText>
          <AppText variant="tiny" color={colors.subtle}>
            Sources: {entry.foodItem.provenance.join(", ")}
            {entry.userEdited ? " • edited by you" : ""}
          </AppText>
          <Button
            label="Edit entry"
            variant="secondary"
            icon="create"
            onPress={() =>
              navigation.navigate("FoodDetail", {
                mode: "edit",
                date,
                mealType: meal.mealType,
                mealId: meal.id,
                entryId: entry.id,
                foodId: entry.foodItem.sourceFoodId
              })
            }
          />
        </Card>
      ))}

      <Button
        label="Delete meal"
        variant="secondary"
        icon="trash"
        onPress={() => {
          const entryId = meal.entries[0]?.id;
          if (!entryId) return;
          void deleteEntry(entryId)
            .then((day) => {
              if (day) navigation.goBack();
              else Alert.alert("Meal not found", "This meal is no longer in your diary.");
            })
            .catch((error) =>
              Alert.alert(
                "Cannot delete entry",
                error instanceof Error ? error.message : "Try again."
              )
            );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md
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
  },
  loading: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xl
  }
});
