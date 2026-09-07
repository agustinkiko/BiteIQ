import { describe, expect, it } from "vitest";
import type { CalculableFood, FoodServing } from "../../src/modules/foods/contracts.js";
import { calculateServingNutrition } from "../../src/modules/foods/nutrition.js";

const chickenPer100g: CalculableFood = {
  calories: "165",
  nutrients: {
    protein: { amount: "31", unit: "g" },
    carbohydrate: { amount: "0", unit: "g" },
    fat: { amount: "3.6", unit: "g" },
  },
  basisQuantity: "100",
  basisUnit: "g",
};

const serving150g: FoodServing = {
  id: "chicken-150g",
  name: "150 g",
  quantity: "1",
  unit: "serving",
  gramWeight: "150",
  milliliterVolume: null,
  isDefault: true,
  source: "development",
  sourceServingId: "chicken-150g",
};

describe("calculateServingNutrition", () => {
  it("scales the chicken fixture from a 100 g basis to one 150 g serving", () => {
    expect(calculateServingNutrition(chickenPer100g, serving150g, "1")).toEqual({
      calories: "247.500000",
      nutrients: {
        protein: { amount: "46.500000", unit: "g" },
        carbohydrate: { amount: "0.000000", unit: "g" },
        fat: { amount: "5.400000", unit: "g" },
      },
      consumedGrams: "150.0000",
      consumedMilliliters: null,
    });
  });

  it.each(["0", "-0.25"])("rejects a non-positive quantity of %s", (quantity) => {
    expect(() => calculateServingNutrition(chickenPer100g, serving150g, quantity)).toThrow(
      "INVALID_QUANTITY",
    );
  });

  it("rejects a mass-based food when its serving has no gram weight", () => {
    const servingWithoutMass = { ...serving150g, gramWeight: null };

    expect(() => calculateServingNutrition(chickenPer100g, servingWithoutMass, "1")).toThrow(
      "MISSING_GRAM_WEIGHT",
    );
  });

  it("rejects a volume-only serving when the food has no volume basis", () => {
    const volumeServing = {
      ...serving150g,
      gramWeight: null,
      milliliterVolume: "240",
      unit: "ml" as const,
    };

    expect(() => calculateServingNutrition(chickenPer100g, volumeServing, "1")).toThrow(
      "MISSING_VOLUME_BASIS",
    );
  });

  it("calculates a volume-based food without converting volume to mass", () => {
    const milkPer100ml: CalculableFood = {
      calories: "60",
      nutrients: { protein: { amount: "3.2", unit: "g" } },
      basisQuantity: "100",
      basisUnit: "ml",
    };
    const cup: FoodServing = {
      ...serving150g,
      id: "milk-cup",
      name: "1 cup",
      gramWeight: null,
      milliliterVolume: "250",
      sourceServingId: "milk-cup",
    };

    expect(calculateServingNutrition(milkPer100ml, cup, "0.5")).toEqual({
      calories: "75.000000",
      nutrients: { protein: { amount: "4.000000", unit: "g" } },
      consumedGrams: null,
      consumedMilliliters: "125.0000",
    });
  });
});
