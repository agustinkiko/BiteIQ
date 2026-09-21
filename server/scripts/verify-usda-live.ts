/**
 * Read-only live check. From the repository root:
 * node --env-file=.env --import ./server/node_modules/tsx/dist/loader.mjs server/scripts/verify-usda-live.ts
 * The API key and request URLs are never logged. No database is accessed.
 */
import assert from "node:assert/strict";
import { Decimal } from "decimal.js";
import { calculateServingNutrition } from "../src/modules/foods/nutrition.js";
import { createUsdaProvider } from "../src/providers/nutrition/usda.js";
import type { ProviderFood } from "../src/providers/nutrition/types.js";

type RawNutrient = {
  nutrient?: { id?: number; number?: string; unitName?: string };
  nutrientId?: number; nutrientNumber?: string; number?: string;
  unitName?: string; amount?: number; value?: number;
};
type RawFood = {
  fdcId: number; dataType: string; description: string;
  foodNutrients: RawNutrient[];
  servingSizeUnit?: string; servingSize?: number;
  foodPortions?: Array<{ id: number; gramWeight: number }>;
};

const apiKey = process.env.USDA_FDC_API_KEY?.trim();
if (!apiKey) throw new Error("USDA_FDC_API_KEY is required");
const responses: unknown[] = [];
const provider = createUsdaProvider({ apiKey }, async (input, init) => {
  const response = await fetch(input, init);
  responses.push(await response.clone().json());
  return response;
});

const nutrientNumbers = {
  protein: ["203"], fat: ["204"], carbohydrate: ["205"], sugar: ["269", "269.3"], fiber: ["291"],
  sodium: ["307"], potassium: ["306"], cholesterol: ["601"], saturated_fat: ["606"],
};

function numberOf(nutrient: RawNutrient): string | undefined {
  return nutrient.nutrientNumber ?? nutrient.nutrient?.number ?? nutrient.number;
}

function verify(food: ProviderFood, raw: RawFood): void {
  assert.equal(food.externalId, String(raw.fdcId));
  assert.equal(food.name, raw.description.trim());
  const expectedBasis = raw.dataType === "Branded" && /^(ml|mlt)$/i.test(raw.servingSizeUnit ?? "")
    ? "ml" : "g";
  assert.equal(food.basisUnit, expectedBasis);
  assert.equal(food.basisQuantity, "100.0000");
  assert.ok(food.servings.some((s) => s.name === `100 ${expectedBasis}`),
    "An exact metric serving must be available alongside household portions");
  const energies = raw.foodNutrients.filter((n) =>
    ["208", "957", "958"].includes(numberOf(n) ?? ""));
  assert.ok(energies.some((n) => new Decimal(n.value ?? n.amount!).eq(food.calories)),
    `Calories must match a USDA kcal value for ${food.externalId}`);
  for (const [name, numbers] of Object.entries(nutrientNumbers)) {
    const rawValue = raw.foodNutrients.find((n) => numbers.includes(numberOf(n) ?? ""));
    if (rawValue?.amount === undefined && rawValue?.value === undefined) {
      assert.equal(food.nutrients[name], undefined, `Missing ${name} must remain unknown`);
    } else {
      assert.equal(food.nutrients[name]?.amount, new Decimal(rawValue.value ?? rawValue.amount!).toFixed(6));
      assert.equal(food.nutrients[name]?.unit, (rawValue.unitName ?? rawValue.nutrient?.unitName)?.toLowerCase());
    }
  }
  if (raw.servingSize) {
    const label = food.servings.find((s) => s.sourceServingId === "label-serving");
    assert.equal(expectedBasis === "ml" ? label?.milliliterVolume : label?.gramWeight,
      new Decimal(raw.servingSize).toFixed(4));
    if (expectedBasis === "ml") assert.equal(label?.gramWeight, null);
  }
  for (const portion of raw.foodPortions ?? []) {
    assert.equal(food.servings.find((s) => s.sourceServingId === String(portion.id))?.gramWeight,
      new Decimal(portion.gramWeight).toFixed(4));
  }
  const serving = food.servings[0]!;
  const size = expectedBasis === "ml" ? serving.milliliterVolume : serving.gramWeight;
  const snapshot = calculateServingNutrition(food, serving, "1.5");
  const multiplier = new Decimal(size!).times("1.5").div(100);
  assert.equal(snapshot.calories, new Decimal(food.calories).times(multiplier).toFixed(6));
  for (const [name, nutrient] of Object.entries(food.nutrients)) {
    assert.equal(snapshot.nutrients[name]?.amount, new Decimal(nutrient.amount).times(multiplier).toFixed(6));
  }
}

async function main(): Promise<void> {
  let foodChecks = 0;
  for (const query of ["chicken breast cooked", "rice white cooked", "milk", "egg", "banana"]) {
    responses.length = 0;
    const foods = await provider.searchFoods({ query, limit: 5 });
    const raw = responses[0] as { foods: RawFood[] };
    assert.ok(foods.length > 0, `No results for ${query}`);
    for (const food of foods) {
      verify(food, raw.foods.find((row) => String(row.fdcId) === food.externalId)!);
      foodChecks++;
    }
    console.log(JSON.stringify({ search: query, matchedRawRecords: foods.length, ids: foods.map((f) => f.externalId) }));
  }
  for (const id of ["171077", "2708402", "746784", "1909132", "748967"]) {
    responses.length = 0;
    const food = await provider.getFood(id);
    assert.ok(food, `Food ${id} was not found`);
    const full = responses[0] as RawFood;
    const nutrients = (responses.at(-1) as RawFood).foodNutrients;
    verify(food, { ...full, foodNutrients: nutrients });
    foodChecks++;
    console.log(JSON.stringify({ detail: id, name: food.name, calories: food.calories,
      basis: `100 ${food.basisUnit}`, firstServing: food.servings[0], abridgedFallback: responses.length === 2 }));
  }
  console.log(JSON.stringify({ passed: true, rawFoodComparisons: foodChecks }));
}

main().catch((error: unknown) => {
  // Assertion messages contain food IDs/values only. Never print fetch errors,
  // which can include request URLs and their credentials.
  console.error(error instanceof assert.AssertionError ? error.message : "Live USDA verification failed; no credentials logged.");
  process.exitCode = 1;
});
