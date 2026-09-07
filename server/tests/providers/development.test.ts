import { describe, expect, it } from "vitest";
import { createDevelopmentNutritionProvider } from "../../src/providers/nutrition/development.js";

describe("development nutrition provider", () => {
  it("returns the stable, clearly unverified chicken fixture", async () => {
    const provider = createDevelopmentNutritionProvider({ nodeEnv: "development" });

    await expect(provider.searchFoods({ query: "  CHICKEN ", limit: 10 })).resolves.toEqual([
      expect.objectContaining({
        provider: "development",
        externalId: "chicken-test-food",
        name: "Chicken Test Food",
        dataType: "Development Seed",
        preparationState: "cooked",
        verificationState: "unverified",
        calories: "165.000000",
        basisQuantity: "100.0000",
        basisUnit: "g",
        nutrients: {
          protein: { amount: "31.000000", unit: "g" },
          carbohydrate: { amount: "0.000000", unit: "g" },
          fat: { amount: "3.600000", unit: "g" },
        },
        servings: [
          expect.objectContaining({
            name: "150 g",
            gramWeight: "150.0000",
            milliliterVolume: null,
          }),
        ],
      }),
    ]);
    await expect(provider.getFood("chicken-test-food")).resolves.toEqual(
      expect.objectContaining({ externalId: "chicken-test-food" }),
    );
    await expect(provider.lookupBarcode("0123456789012")).resolves.toBeNull();
    expect(provider.providerMetadata()).toEqual({
      id: "development",
      displayName: "Development nutrition fixtures",
      attribution: "BiteIQ deterministic development data",
    });
  });

  it("returns no search result when the fixture does not match", async () => {
    const provider = createDevelopmentNutritionProvider({ nodeEnv: "test" });

    await expect(provider.searchFoods({ query: "banana", limit: 10 })).resolves.toEqual([]);
    await expect(provider.getFood("unknown")).resolves.toBeNull();
  });

  it.each([
    { query: "", limit: 10 },
    { query: "   ", limit: 10 },
    { query: "chicken", limit: 0 },
    { query: "chicken", limit: 51 },
    { query: "chicken", limit: 1.5 },
  ])("rejects invalid search input $query/$limit", async (input) => {
    const provider = createDevelopmentNutritionProvider({ nodeEnv: "test" });

    await expect(provider.searchFoods(input)).rejects.toThrow("INVALID_FOOD_SEARCH_INPUT");
  });

  it("cannot be constructed in production", () => {
    expect(() => createDevelopmentNutritionProvider({ nodeEnv: "production" })).toThrow(
      "DEVELOPMENT_PROVIDER_DISABLED",
    );
  });
});
