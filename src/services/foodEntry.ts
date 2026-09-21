import {
  DatabaseFood,
  FoodItem,
  Meal,
  MealEntry,
  MealType,
  Nutrients100g,
  NutritionEstimate,
  ProvenanceSource,
  ServingOption
} from "@/types/domain";

let counter = 0;

/** Unique enough for local-only state, and stable across a single session. */
export function localId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter.toString(36)}`;
}

export function scaleNutrients(per100g: Nutrients100g, grams: number, provenance: ProvenanceSource[]): NutritionEstimate {
  const factor = grams / 100;
  const scale = (value: number | undefined) => (value === undefined ? undefined : round(value * factor));

  return {
    calories: round(per100g.calories * factor),
    proteinGrams: round(per100g.proteinGrams * factor),
    carbGrams: round(per100g.carbGrams * factor),
    fatGrams: round(per100g.fatGrams * factor),
    fiberGrams: scale(per100g.fiberGrams),
    sugarGrams: scale(per100g.sugarGrams),
    sodiumMg: scale(per100g.sodiumMg),
    saturatedFatGrams: scale(per100g.saturatedFatGrams),
    cholesterolMg: scale(per100g.cholesterolMg),
    potassiumMg: scale(per100g.potassiumMg),
    provenance
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export function findServing(food: DatabaseFood, servingId?: string): ServingOption {
  return food.servings.find((serving) => serving.id === servingId) || food.servings[0];
}

/** Preview a database food at a given serving and quantity without logging it. */
export function previewNutrition(food: DatabaseFood, servingId: string | undefined, quantity: number): NutritionEstimate {
  const serving = findServing(food, servingId);
  return scaleNutrients(food.per100g, serving.grams * quantity, ["nutrition_database"]);
}

export function buildFoodItem(food: DatabaseFood, servingId: string | undefined, quantity: number): FoodItem {
  const serving = findServing(food, servingId);
  const grams = serving.grams * quantity;

  return {
    id: localId("food"),
    name: food.name,
    brand: food.brand,
    servingSize: serving.label,
    quantity,
    grams,
    sourceFoodId: food.id,
    servingId: serving.id,
    nutrition: scaleNutrients(food.per100g, grams, ["nutrition_database"]),
    confidence: 1,
    provenance: ["nutrition_database"]
  };
}

/** A database pick becomes a single-entry meal with no AI inference attached. */
export function buildDatabaseMeal(food: DatabaseFood, servingId: string | undefined, quantity: number, mealType: MealType, date: string): Meal {
  const foodItem = buildFoodItem(food, servingId, quantity);
  const entry: MealEntry = { id: localId("entry"), foodItem, userEdited: false };

  return {
    id: localId("meal"),
    title: food.name,
    mealType,
    capturedWith: "search",
    capturedAt: timestampFor(date),
    entries: [entry]
  };
}

export function buildQuickAddMeal(
  values: { name: string; calories: number; proteinGrams: number; carbGrams: number; fatGrams: number },
  mealType: MealType,
  date: string
): Meal {
  const foodItem: FoodItem = {
    id: localId("food"),
    name: values.name || "Quick add",
    servingSize: "1 serving",
    quantity: 1,
    nutrition: {
      calories: values.calories,
      proteinGrams: values.proteinGrams,
      carbGrams: values.carbGrams,
      fatGrams: values.fatGrams,
      provenance: ["manual_entry"]
    },
    confidence: 1,
    provenance: ["manual_entry"]
  };

  return {
    id: localId("meal"),
    title: foodItem.name,
    mealType,
    capturedWith: "quick",
    capturedAt: timestampFor(date),
    entries: [{ id: localId("entry"), foodItem, userEdited: true }]
  };
}

/**
 * Log entries carry a full timestamp, but they must land on the diary day the
 * user is looking at. For today that means "now"; for any other day it means
 * midday on that date, which keeps ordering sensible without faking a time.
 */
export function timestampFor(date: string): string {
  const now = new Date();
  const [year, month, day] = date.split("-").map(Number);
  const isToday = now.getFullYear() === year && now.getMonth() + 1 === month && now.getDate() === day;
  if (isToday) return now.toISOString();
  return new Date(year, month - 1, day, 12, 0, 0).toISOString();
}

/** Re-derive an entry's nutrition after the user changes serving or quantity. */
export function reprice(item: FoodItem, food: DatabaseFood | undefined, servingId: string | undefined, quantity: number): FoodItem {
  if (!food) {
    // Foods without a database source (AI or quick add) scale off their own
    // per-serving values rather than a per-100g rate.
    const factor = item.quantity > 0 ? quantity / item.quantity : quantity;
    return {
      ...item,
      quantity,
      nutrition: {
        ...item.nutrition,
        calories: round(item.nutrition.calories * factor),
        proteinGrams: round(item.nutrition.proteinGrams * factor),
        carbGrams: round(item.nutrition.carbGrams * factor),
        fatGrams: round(item.nutrition.fatGrams * factor)
      }
    };
  }

  const serving = findServing(food, servingId);
  const grams = serving.grams * quantity;

  return {
    ...item,
    servingSize: serving.label,
    servingId: serving.id,
    quantity,
    grams,
    nutrition: scaleNutrients(food.per100g, grams, item.nutrition.provenance)
  };
}
