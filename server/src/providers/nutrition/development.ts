import type { ProviderFood, NutritionProvider } from "./types.js";

export interface DevelopmentNutritionProviderConfig {
  nodeEnv: string;
}

const chickenFixture: ProviderFood = {
  provider: "development",
  externalId: "chicken-test-food",
  dataType: "Development Seed",
  name: "Chicken Test Food",
  brand: null,
  description: "Deterministic cooked chicken fixture for local development",
  category: "Development fixture",
  foodType: "development",
  preparationState: "cooked",
  ingredientsText: null,
  verificationState: "unverified",
  sourceUpdatedAt: null,
  attribution: "BiteIQ deterministic development data",
  calories: "165.000000",
  basisQuantity: "100.0000",
  basisUnit: "g",
  nutrients: {
    protein: { amount: "31.000000", unit: "g" },
    carbohydrate: { amount: "0.000000", unit: "g" },
    fat: { amount: "3.600000", unit: "g" },
  },
  servings: [
    {
      id: "development-chicken-test-food-150g",
      name: "150 g",
      quantity: "1.0000",
      unit: "serving",
      gramWeight: "150.0000",
      milliliterVolume: null,
      isDefault: true,
      source: "development",
      sourceServingId: "chicken-150g",
    },
  ],
};

function cloneFixture(): ProviderFood {
  return structuredClone(chickenFixture);
}

export function createDevelopmentNutritionProvider(
  config: DevelopmentNutritionProviderConfig,
): NutritionProvider {
  if (config.nodeEnv === "production") {
    throw new Error("DEVELOPMENT_PROVIDER_DISABLED");
  }

  return {
    id: "development",
    async searchFoods(input) {
      const query = input.query.trim().toLocaleLowerCase();
      if (!query || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) {
        throw new Error("INVALID_FOOD_SEARCH_INPUT");
      }
      if (!chickenFixture.name.toLocaleLowerCase().includes(query)) {
        return [];
      }
      return [cloneFixture()].slice(0, input.limit);
    },
    async getFood(externalId) {
      return externalId === chickenFixture.externalId ? cloneFixture() : null;
    },
    async lookupBarcode() {
      return null;
    },
    providerMetadata() {
      return {
        id: "development",
        displayName: "Development nutrition fixtures",
        attribution: "BiteIQ deterministic development data",
      };
    },
  };
}
