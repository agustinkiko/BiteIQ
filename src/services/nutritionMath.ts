import { DailyLog, Goal, Meal, MealType, NutritionEstimate } from "@/types/domain";

export function emptyNutrition(): NutritionEstimate {
  return {
    calories: 0,
    proteinGrams: 0,
    carbGrams: 0,
    fatGrams: 0,
    fiberGrams: 0,
    sugarGrams: 0,
    sodiumMg: 0,
    saturatedFatGrams: 0,
    cholesterolMg: 0,
    potassiumMg: 0,
    provenance: []
  };
}

export function sumMeals(meals: Meal[]): NutritionEstimate {
  return meals.reduce((total, meal) => {
    meal.entries.forEach((entry) => {
      const nutrition = entry.foodItem.nutrition;
      total.calories += nutrition.calories;
      total.proteinGrams += nutrition.proteinGrams;
      total.carbGrams += nutrition.carbGrams;
      total.fatGrams += nutrition.fatGrams;
      total.fiberGrams = (total.fiberGrams || 0) + (nutrition.fiberGrams || 0);
      total.sugarGrams = (total.sugarGrams || 0) + (nutrition.sugarGrams || 0);
      total.sodiumMg = (total.sodiumMg || 0) + (nutrition.sodiumMg || 0);
      total.saturatedFatGrams = (total.saturatedFatGrams || 0) + (nutrition.saturatedFatGrams || 0);
      total.cholesterolMg = (total.cholesterolMg || 0) + (nutrition.cholesterolMg || 0);
      total.potassiumMg = (total.potassiumMg || 0) + (nutrition.potassiumMg || 0);
    });
    return total;
  }, emptyNutrition());
}

export function mealsForType(log: DailyLog, mealType: MealType): Meal[] {
  return log.meals.filter((meal) => meal.mealType === mealType);
}

export function caloriesForType(log: DailyLog, mealType: MealType): number {
  return mealsForType(log, mealType).reduce((sum, meal) => sum + mealCalories(meal), 0);
}

export function mealCalories(meal: Meal): number {
  return meal.entries.reduce((sum, entry) => sum + entry.foodItem.nutrition.calories, 0);
}

export function exerciseCalories(log: DailyLog): number {
  return log.exercises.reduce((sum, entry) => sum + entry.caloriesBurned, 0);
}

export function exerciseMinutes(log: DailyLog): number {
  return log.exercises.reduce((sum, entry) => sum + entry.minutes, 0);
}

/** MyFitnessPal's headline equation: Remaining = Goal - Food + Exercise. */
export function caloriesRemaining(log: DailyLog, goal: Goal): number {
  return goal.calories - sumMeals(log.meals).calories + exerciseCalories(log);
}

export function macroProgress(total: NutritionEstimate, goal: Goal) {
  return {
    calories: ratio(total.calories, goal.calories),
    protein: ratio(total.proteinGrams, goal.proteinGrams),
    carbs: ratio(total.carbGrams, goal.carbGrams),
    fat: ratio(total.fatGrams, goal.fatGrams)
  };
}

/** Share of consumed calories coming from each macro, as whole percentages. */
export function macroSplit(total: Pick<NutritionEstimate, "proteinGrams" | "carbGrams" | "fatGrams">) {
  const proteinCals = total.proteinGrams * 4;
  const carbCals = total.carbGrams * 4;
  const fatCals = total.fatGrams * 9;
  const sum = proteinCals + carbCals + fatCals;

  if (sum <= 0) return { protein: 0, carbs: 0, fat: 0 };

  const protein = Math.round((proteinCals / sum) * 100);
  const carbs = Math.round((carbCals / sum) * 100);
  return { protein, carbs, fat: Math.max(0, 100 - protein - carbs) };
}

/** Target macro split implied by the goal's gram targets. */
export function goalMacroSplit(goal: Goal) {
  return macroSplit(goal);
}

/** Convert a calorie target plus a macro split into gram targets. */
export function goalFromSplit(calories: number, split: { protein: number; carbs: number; fat: number }) {
  return {
    proteinGrams: Math.round((calories * (split.protein / 100)) / 4),
    carbGrams: Math.round((calories * (split.carbs / 100)) / 4),
    fatGrams: Math.round((calories * (split.fat / 100)) / 9)
  };
}

export function ratio(value: number, goal: number): number {
  return goal <= 0 ? 0 : Math.min(1, value / goal);
}

/** Unclamped ratio, for readouts that should show an overshoot. */
export function rawRatio(value: number, goal: number): number {
  return goal <= 0 ? 0 : value / goal;
}
