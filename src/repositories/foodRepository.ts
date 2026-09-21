import { apiRequest } from "@/api/client";
import {
  DatabaseFood,
  FoodCategory,
  FoodDataQuality,
  FoodSearchWarning,
  FoodSourceDetails,
  FoodSourceId,
  Nutrients100g,
  ServingOption
} from "@/types/domain";

type CanonicalNutrient = {
  amount: string;
  unit: string;
};

type CanonicalServing = {
  id: string;
  name: string;
  quantity: string;
  unit: "serving" | "g" | "ml";
  gramWeight: string | null;
  milliliterVolume: string | null;
  isDefault: boolean;
  source: string;
  sourceServingId: string | null;
};

type CanonicalFoodSource = Omit<FoodSourceDetails, "verificationState"> & {
  verificationState: string;
};

type CanonicalFood = {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  preparationState: string | null;
  dataQuality: string;
  verified: boolean;
  source: CanonicalFoodSource | null;
  calories: string | null;
  nutrients: Record<string, CanonicalNutrient>;
  basisQuantity: string | null;
  basisUnit: "g" | "ml" | null;
  servings: CanonicalServing[];
};

type FoodSearchResponse = {
  foods: CanonicalFood[];
  warnings: FoodSearchWarning[];
};

type FoodDetailResponse = { food: CanonicalFood };

const SEARCH_LIMIT = 40;

export const foodRepository = {
  async search(query: string, signal?: AbortSignal): Promise<{ foods: DatabaseFood[]; warnings: FoodSearchWarning[] }> {
    const trimmed = query.trim();
    const response = await apiRequest<FoodSearchResponse>(
      `/foods/search?q=${encodeURIComponent(trimmed)}&limit=${SEARCH_LIMIT}`,
      { signal }
    );

    return {
      foods: response.foods.map(mapCanonicalFood),
      warnings: response.warnings.map(mapWarning)
    };
  },

  async get(foodId: string, signal?: AbortSignal): Promise<DatabaseFood> {
    const response = await apiRequest<FoodDetailResponse>(
      `/foods/${encodeURIComponent(foodId)}`,
      { signal }
    );
    return mapCanonicalFood(response.food);
  }
};

function mapWarning(warning: FoodSearchWarning): FoodSearchWarning {
  return {
    code: warning.code,
    provider: warning.provider,
    message: warning.message
  };
}

function mapCanonicalFood(food: CanonicalFood): DatabaseFood {
  const basisQuantity = positiveNumber(food.basisQuantity) ?? 100;
  const factor = 100 / basisQuantity;
  const servings = food.servings
    .map((serving) => mapServing(serving, food.basisUnit))
    .filter((serving): serving is ServingOption => Boolean(serving))
    .sort((left, right) => Number(right.isDefault) - Number(left.isDefault));

  return {
    id: food.id,
    name: food.name,
    ...(food.brand ? { brand: food.brand } : {}),
    category: mapCategory(food.category),
    verified: food.verified,
    source: mapSource(food.source?.provider),
    ...(food.source ? { sourceDetails: mapSourceDetails(food.source) } : {}),
    dataQuality: mapQuality(food.dataQuality),
    ...(food.preparationState ? { preparationState: food.preparationState } : {}),
    ...(food.source?.provider === "development" ? { developmentExample: true } : {}),
    nutritionBasisUnit: food.basisUnit ?? "g",
    per100g: mapNutrients(food, factor),
    servings: servings.length > 0 ? servings : [fallbackServing(food, basisQuantity)]
  };
}

function mapServing(serving: CanonicalServing, basisUnit: CanonicalFood["basisUnit"]): ServingOption | undefined {
  const grams = positiveNumber(serving.gramWeight);
  const milliliters = positiveNumber(serving.milliliterVolume);
  const directAmount = serving.unit === basisUnit ? positiveNumber(serving.quantity) : undefined;
  const amount =
    basisUnit === "ml"
      ? milliliters ?? directAmount
      : basisUnit === "g"
        ? grams ?? directAmount
        : grams ?? milliliters ?? positiveNumber(serving.quantity);
  if (amount === undefined) return undefined;

  return {
    id: serving.id,
    label: serving.name,
    grams: amount,
    ...(milliliters === undefined ? {} : { milliliters }),
    unit: serving.unit,
    quantity: positiveNumber(serving.quantity) ?? 1,
    isDefault: serving.isDefault,
    source: serving.source,
    ...(serving.sourceServingId ? { sourceServingId: serving.sourceServingId } : {})
  };
}

function fallbackServing(food: CanonicalFood, basisQuantity: number): ServingOption {
  const unit = food.basisUnit ?? "g";
  return {
    id: `${food.id}-basis`,
    label: `${basisQuantity} ${unit}`,
    grams: basisQuantity,
    ...(unit === "ml" ? { milliliters: basisQuantity } : {}),
    unit,
    quantity: basisQuantity,
    isDefault: true,
    source: food.source?.provider ?? "canonical"
  };
}

function mapNutrients(food: CanonicalFood, factor: number): Nutrients100g {
  const nutrient = (name: string): number | undefined => {
    const amount = finiteNumber(food.nutrients[name]?.amount);
    return amount === undefined ? undefined : amount * factor;
  };

  return {
    calories: (finiteNumber(food.calories) ?? 0) * factor,
    proteinGrams: nutrient("protein") ?? 0,
    carbGrams: nutrient("carbohydrate") ?? 0,
    fatGrams: nutrient("fat") ?? 0,
    fiberGrams: nutrient("fiber"),
    sugarGrams: nutrient("sugar"),
    sodiumMg: nutrient("sodium"),
    saturatedFatGrams: nutrient("saturated_fat"),
    cholesterolMg: nutrient("cholesterol"),
    potassiumMg: nutrient("potassium")
  };
}

function mapSource(provider: string | undefined): FoodSourceId {
  if (provider === "usda" || provider === "openfoodfacts" || provider === "fatsecret") {
    return provider;
  }
  return "local";
}

function mapSourceDetails(source: CanonicalFoodSource): FoodSourceDetails {
  return {
    ...source,
    verificationState: mapQuality(source.verificationState)
  };
}

function mapQuality(value: string): FoodDataQuality {
  if (
    value === "verified_authoritative" ||
    value === "verified_manufacturer" ||
    value === "community" ||
    value === "user_created"
  ) {
    return value;
  }
  return "unverified";
}

function mapCategory(value: string | null): FoodCategory {
  const category = value?.toLocaleLowerCase("en-US") ?? "";
  if (/poultry|meat|seafood|fish|egg|legume|protein/.test(category)) return "protein";
  if (/grain|cereal|bread|rice|pasta/.test(category)) return "grain";
  if (/vegetable/.test(category)) return "vegetable";
  if (/fruit/.test(category)) return "fruit";
  if (/dairy|milk|cheese|yogurt/.test(category)) return "dairy";
  if (/beverage|drink/.test(category)) return "beverage";
  if (/snack|sweet|candy/.test(category)) return "snack";
  if (/condiment|sauce|spice/.test(category)) return "condiment";
  if (/restaurant/.test(category)) return "restaurant";
  return "prepared";
}

function positiveNumber(value: string | null): number | undefined {
  const parsed = finiteNumber(value);
  return parsed !== undefined && parsed > 0 ? parsed : undefined;
}

function finiteNumber(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
