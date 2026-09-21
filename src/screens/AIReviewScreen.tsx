import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMemo, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { Screen } from "@/components/Screen";
import { Segmented } from "@/components/Segmented";
import { TextField } from "@/components/TextField";
import { colors, spacing } from "@/config/theme";
import { useAppStore } from "@/store/useAppStore";
import { MealEntry, MealType } from "@/types/domain";
import { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "AIReview">;

const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export function AIReviewScreen({ navigation, route }: Props) {
  const draft = useAppStore((state) => state.drafts[route.params.draftId]);
  const updateDraft = useAppStore((state) => state.updateDraft);
  const commitDraft = useAppStore((state) => state.commitDraft);
  const selectedDate = useAppStore((state) => state.selectedDate);
  const [entries, setEntries] = useState<MealEntry[]>(draft?.entries || []);
  const [mealType, setMealType] = useState<MealType>(draft?.mealType || "snack");

  const totals = useMemo(
    () =>
      entries.reduce(
        (sum, entry) => {
          sum.calories += entry.foodItem.nutrition.calories;
          sum.protein += entry.foodItem.nutrition.proteinGrams;
          sum.carbs += entry.foodItem.nutrition.carbGrams;
          sum.fat += entry.foodItem.nutrition.fatGrams;
          return sum;
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 }
      ),
    [entries]
  );

  if (!draft) {
    return (
      <Screen>
        <AppText variant="h2" weight="800">Draft not found</AppText>
        <Button label="Back home" onPress={() => navigation.navigate("MainTabs")} />
      </Screen>
    );
  }

  function updateEntry(index: number, field: "name" | "servingSize" | "calories" | "protein" | "carbs" | "fat", value: string) {
    setEntries((current) =>
      current.map((entry, entryIndex) => {
        if (entryIndex !== index) return entry;
        const foodItem = { ...entry.foodItem };
        if (field === "name") foodItem.name = value;
        if (field === "servingSize") foodItem.servingSize = value;
        if (field === "calories") foodItem.nutrition.calories = Number(value) || 0;
        if (field === "protein") foodItem.nutrition.proteinGrams = Number(value) || 0;
        if (field === "carbs") foodItem.nutrition.carbGrams = Number(value) || 0;
        if (field === "fat") foodItem.nutrition.fatGrams = Number(value) || 0;
        foodItem.provenance = Array.from(new Set([...foodItem.provenance, "user_correction" as const]));
        foodItem.nutrition.provenance = Array.from(new Set([...foodItem.nutrition.provenance, "user_correction" as const]));
        return { ...entry, userEdited: true, foodItem };
      })
    );
  }

  function save() {
    updateDraft(draft.draftId, { entries, mealType });
    const meal = commitDraft(draft.draftId, selectedDate);
    if (!meal) {
      Alert.alert("Could not save", "Please try again.");
      return;
    }
    navigation.navigate("MealDetail", { mealId: meal.id, date: selectedDate });
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Button label="Back" variant="ghost" icon="chevron-back" onPress={() => navigation.goBack()} />
        <View style={styles.titleBlock}>
          <AppText variant="h1" weight="800">{draft.title}</AppText>
          {draft.inference ? <ConfidenceBadge value={draft.inference.confidence} /> : null}
        </View>
      </View>

      <Card style={styles.summary}>
        <AppText variant="small" color={colors.muted} weight="700">Estimated totals</AppText>
        <View style={styles.totalRow}>
          <Macro label="Cal" value={totals.calories} />
          <Macro label="Protein" value={totals.protein} unit="g" />
          <Macro label="Carbs" value={totals.carbs} unit="g" />
          <Macro label="Fat" value={totals.fat} unit="g" />
        </View>
      </Card>

      <Card style={styles.questions}>
        <AppText variant="small" color={colors.muted} weight="700">Meal</AppText>
        <Segmented value={mealType} onChange={setMealType} options={mealTypes.map((type) => ({ value: type, label: mealTypeLabel(type) }))} />
      </Card>

      {draft.inference?.clarifyingQuestions.length ? (
        <Card style={styles.questions}>
          <AppText variant="small" color={colors.warning} weight="800">Check before saving</AppText>
          {draft.inference.clarifyingQuestions.map((question) => (
            <AppText key={question} color={colors.muted}>{question}</AppText>
          ))}
        </Card>
      ) : null}

      {entries.map((entry, index) => (
        <Card key={entry.id} style={styles.entry}>
          <View style={styles.entryTop}>
            <AppText variant="h3" weight="800">Food {index + 1}</AppText>
            <ConfidenceBadge value={entry.foodItem.confidence} />
          </View>
          <TextField label="Food" value={entry.foodItem.name} onChangeText={(value) => updateEntry(index, "name", value)} />
          <TextField label="Serving" value={entry.foodItem.servingSize} onChangeText={(value) => updateEntry(index, "servingSize", value)} />
          <View style={styles.nutrientGrid}>
            <TextField label="Cal" keyboardType="number-pad" value={String(Math.round(entry.foodItem.nutrition.calories))} onChangeText={(value) => updateEntry(index, "calories", value)} />
            <TextField label="Protein" keyboardType="number-pad" value={String(Math.round(entry.foodItem.nutrition.proteinGrams))} onChangeText={(value) => updateEntry(index, "protein", value)} />
            <TextField label="Carbs" keyboardType="number-pad" value={String(Math.round(entry.foodItem.nutrition.carbGrams))} onChangeText={(value) => updateEntry(index, "carbs", value)} />
            <TextField label="Fat" keyboardType="number-pad" value={String(Math.round(entry.foodItem.nutrition.fatGrams))} onChangeText={(value) => updateEntry(index, "fat", value)} />
          </View>
          <AppText variant="tiny" color={colors.muted}>
            Sources: {entry.foodItem.provenance.join(", ")}
          </AppText>
        </Card>
      ))}

      <Button label="Save meal" icon="checkmark" onPress={save} />
    </Screen>
  );
}

function mealTypeLabel(type: MealType) {
  return type === "snack" ? "Snacks" : type.slice(0, 1).toUpperCase() + type.slice(1);
}

function Macro({ label, value, unit = "" }: { label: string; value: number; unit?: string }) {
  return (
    <View style={styles.macro}>
      <AppText variant="h2" weight="800">{Math.round(value)}{unit}</AppText>
      <AppText variant="tiny" color={colors.muted} weight="700">{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm
  },
  titleBlock: {
    gap: spacing.sm
  },
  summary: {
    gap: spacing.md
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.sm
  },
  macro: {
    minWidth: 66,
    gap: spacing.xs
  },
  questions: {
    gap: spacing.sm
  },
  entry: {
    gap: spacing.md
  },
  entryTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md
  },
  nutrientGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  }
});
