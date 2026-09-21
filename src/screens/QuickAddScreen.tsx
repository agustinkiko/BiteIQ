import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Segmented } from "@/components/Segmented";
import { TextField } from "@/components/TextField";
import { DEVELOPMENT_PREVIEW, featureFlags } from "@/config/features";
import { colors, spacing } from "@/config/theme";
import { buildQuickAddMeal } from "@/services/foodEntry";
import { useAppStore } from "@/store/useAppStore";
import { MealType } from "@/types/domain";
import { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "QuickAdd">;

const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

/** Calories-only logging for foods that aren't worth looking up. */
export function QuickAddScreen({ navigation, route }: Props) {
  const addMeal = useAppStore((state) => state.addMeal);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [mealType, setMealType] = useState<MealType>(route.params.mealType);

  function save() {
    const parsedCalories = Number(calories);
    if (!Number.isFinite(parsedCalories) || parsedCalories <= 0) {
      Alert.alert("Add calories", "Enter the calorie amount you want to log.");
      return;
    }

    addMeal(
      buildQuickAddMeal(
        {
          name: name.trim() || "Quick add",
          calories: parsedCalories,
          proteinGrams: numberOrZero(protein),
          carbGrams: numberOrZero(carbs),
          fatGrams: numberOrZero(fat)
        },
        mealType,
        route.params.date
      ),
      route.params.date
    );

    navigation.goBack();
  }

  if (!featureFlags.quickAdd.enabled) {
    return (
      <Screen contentStyle={styles.screen}>
        <ScreenHeader
          title="Quick add"
          subtitle="Quick add is not available."
          onBack={() => navigation.goBack()}
        />
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screen}>
      <ScreenHeader title="Quick add" subtitle={DEVELOPMENT_PREVIEW} onBack={() => navigation.goBack()} />

      <Card style={styles.card}>
        <TextField label="Name (optional)" value={name} onChangeText={setName} placeholder="Quick add" />
        <TextField label="Calories" value={calories} onChangeText={setCalories} keyboardType="number-pad" placeholder="0" />
      </Card>

      <Card style={styles.card}>
        <AppText variant="h3" weight="800">
          Macros (optional)
        </AppText>
        <View style={styles.macroRow}>
          <View style={styles.macroField}>
            <TextField label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="number-pad" placeholder="0" />
          </View>
          <View style={styles.macroField}>
            <TextField label="Carbs (g)" value={carbs} onChangeText={setCarbs} keyboardType="number-pad" placeholder="0" />
          </View>
          <View style={styles.macroField}>
            <TextField label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="number-pad" placeholder="0" />
          </View>
        </View>
        <AppText variant="tiny" color={colors.muted}>
          Leave macros blank to log calories only. They stay out of the macro rings when empty.
        </AppText>
      </Card>

      <Card style={styles.card}>
        <AppText variant="h3" weight="800">
          Meal
        </AppText>
        <Segmented value={mealType} onChange={setMealType} options={mealTypes.map((type) => ({ value: type, label: label(type) }))} />
      </Card>

      <Button label="Add to diary" icon="checkmark" onPress={save} />
    </Screen>
  );
}

function numberOrZero(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function label(type: MealType) {
  return type === "snack" ? "Snacks" : type.slice(0, 1).toUpperCase() + type.slice(1);
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md
  },
  card: {
    gap: spacing.md
  },
  macroRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  macroField: {
    flex: 1
  }
});
