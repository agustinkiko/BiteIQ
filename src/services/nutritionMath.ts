import { Goal, Meal, NutritionEstimate } from "@/types/domain";

export function emptyNutrition(): NutritionEstimate {
  return {
    calories: 0,
    proteinGrams: 0,
    carbGrams: 0,
    fatGrams: 0,
    provenance: []
  };
}

export function sumMeals(meals: Meal[]): NutritionEstimate {
  return meals.reduce((total, meal) => {
    meal.entries.forEach((entry) => {
      total.calories += entry.foodItem.nutrition.calories;
      total.proteinGrams += entry.foodItem.nutrition.proteinGrams;
      total.carbGrams += entry.foodItem.nutrition.carbGrams;
      total.fatGrams += entry.foodItem.nutrition.fatGrams;
    });
    return total;
  }, emptyNutrition());
}

export function macroProgress(total: NutritionEstimate, goal: Goal) {
  return {
    calories: ratio(total.calories, goal.calories),
    protein: ratio(total.proteinGrams, goal.proteinGrams),
    carbs: ratio(total.carbGrams, goal.carbGrams),
    fat: ratio(total.fatGrams, goal.fatGrams)
  };
}

export function mealCalories(meal: Meal) {
  return meal.entries.reduce((sum, entry) => sum + entry.foodItem.nutrition.calories, 0);
}

export function ratio(value: number, goal: number) {
  return goal <= 0 ? 0 : Math.min(1, value / goal);
}
