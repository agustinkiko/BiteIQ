import { Decimal } from "decimal.js";
import type {
  CalculableFood,
  FoodServing,
  NutrientAmount,
  NutrientSnapshot,
} from "./contracts.js";

const MAX_QUANTITY = new Decimal("1000000");

function positiveDecimal(value: string, code: string): Decimal {
  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    throw new Error(code);
  }

  if (!decimal.isFinite() || decimal.lte(0) || decimal.gt(MAX_QUANTITY)) {
    throw new Error(code);
  }
  return decimal;
}

function nonNegativeDecimal(value: string, code: string): Decimal {
  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    throw new Error(code);
  }

  if (!decimal.isFinite() || decimal.lt(0)) {
    throw new Error(code);
  }
  return decimal;
}

function calculateNutrients(
  nutrients: Record<string, NutrientAmount>,
  factor: Decimal,
): Record<string, NutrientAmount> {
  return Object.fromEntries(
    Object.entries(nutrients).map(([name, nutrient]) => [
      name,
      {
        amount: nonNegativeDecimal(nutrient.amount, "INVALID_NUTRIENT_AMOUNT")
          .times(factor)
          .toFixed(6),
        unit: nutrient.unit,
      },
    ]),
  );
}

export function calculateServingNutrition(
  food: CalculableFood,
  serving: FoodServing,
  quantity: string,
): NutrientSnapshot {
  const servingCount = positiveDecimal(quantity, "INVALID_QUANTITY");
  const sourceBasis = positiveDecimal(food.basisQuantity, "INVALID_NUTRITION_BASIS");

  let consumedBasis: Decimal;
  let consumedGrams: string | null = null;
  let consumedMilliliters: string | null = null;

  if (food.basisUnit === "g") {
    if (serving.gramWeight === null) {
      throw new Error(
        serving.milliliterVolume === null ? "MISSING_GRAM_WEIGHT" : "MISSING_VOLUME_BASIS",
      );
    }
    consumedBasis = positiveDecimal(serving.gramWeight, "INVALID_GRAM_WEIGHT").times(servingCount);
    consumedGrams = consumedBasis.toFixed(4);
  } else if (food.basisUnit === "ml") {
    if (serving.milliliterVolume === null) {
      throw new Error("MISSING_MILLILITER_VOLUME");
    }
    consumedBasis = positiveDecimal(
      serving.milliliterVolume,
      "INVALID_MILLILITER_VOLUME",
    ).times(servingCount);
    consumedMilliliters = consumedBasis.toFixed(4);
  } else {
    throw new Error("UNSUPPORTED_NUTRITION_BASIS_UNIT");
  }

  const factor = consumedBasis.div(sourceBasis);
  return {
    calories: nonNegativeDecimal(food.calories, "INVALID_CALORIE_AMOUNT").times(factor).toFixed(6),
    nutrients: calculateNutrients(food.nutrients, factor),
    consumedGrams,
    consumedMilliliters,
  };
}
