export type NutritionBasisUnit = "g" | "ml";

export type ServingUnit = "serving" | "g" | "ml";

export interface NutrientAmount {
  amount: string;
  unit: string;
}

export type NutrientValues = Record<string, NutrientAmount>;

export interface CalculableFood {
  calories: string;
  nutrients: NutrientValues;
  basisQuantity: string;
  basisUnit: NutritionBasisUnit;
}

export interface FoodServing {
  id: string;
  name: string;
  quantity: string;
  unit: ServingUnit;
  gramWeight: string | null;
  milliliterVolume: string | null;
  isDefault: boolean;
  source: string;
  sourceServingId: string | null;
}

export interface NutrientSnapshot {
  calories: string;
  nutrients: NutrientValues;
  consumedGrams: string | null;
  consumedMilliliters: string | null;
}
