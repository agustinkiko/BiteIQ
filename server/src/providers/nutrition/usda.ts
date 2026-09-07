import { Decimal } from "decimal.js";
import type { FoodServing, NutrientValues } from "../../modules/foods/contracts.js";
import type {
  NutritionProvider,
  ProviderFood,
  VerificationState,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.nal.usda.gov/fdc/v1";
const REQUEST_TIMEOUT_MS = 8_000;
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1_000;

export interface UsdaProviderConfig {
  apiKey: string;
  baseUrl?: string;
}

interface CacheEntry {
  expiresAt: number;
  foods: ProviderFood[];
}

type JsonRecord = Record<string, unknown>;

const nutrientDefinitions = [
  { ids: [1003], numbers: ["203"], name: "protein", unit: "g" },
  { ids: [1005], numbers: ["205"], name: "carbohydrate", unit: "g" },
  { ids: [1004], numbers: ["204"], name: "fat", unit: "g" },
  { ids: [1079], numbers: ["291"], name: "fiber", unit: "g" },
  { ids: [2000, 1063], numbers: ["269"], name: "sugar", unit: "g" },
  { ids: [1093], numbers: ["307"], name: "sodium", unit: "mg" },
  { ids: [1258], numbers: ["606"], name: "saturated_fat", unit: "g" },
  { ids: [1253], numbers: ["601"], name: "cholesterol", unit: "mg" },
  { ids: [1092], numbers: ["306"], name: "potassium", unit: "mg" },
] as const;

function providerError(code: string): Error {
  return new Error(code);
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredRecord(value: unknown): JsonRecord {
  if (!isRecord(value)) throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredString(value: unknown): string {
  const normalized = optionalString(value);
  if (normalized === null) throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
  return normalized;
}

function nonNegativeDecimal(value: unknown): Decimal {
  if (typeof value !== "number" && typeof value !== "string") {
    throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
  }

  let decimal: Decimal;
  try {
    decimal = new Decimal(value);
  } catch {
    throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
  }
  if (!decimal.isFinite() || decimal.isNegative()) {
    throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
  }
  return decimal;
}

function positiveDecimal(value: unknown): Decimal {
  const decimal = nonNegativeDecimal(value);
  if (decimal.isZero()) throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
  return decimal;
}

function foodId(food: JsonRecord): string {
  const id = food.fdcId;
  if (
    (typeof id !== "number" && typeof id !== "string") ||
    !/^\d+$/.test(String(id)) ||
    new Decimal(String(id)).lte(0)
  ) {
    throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
  }
  return String(id);
}

function nutrientRecords(food: JsonRecord): JsonRecord[] {
  if (!Array.isArray(food.foodNutrients)) {
    throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
  }
  return food.foodNutrients.map(requiredRecord);
}

function nutrientIdentity(record: JsonRecord): {
  id: number | null;
  number: string | null;
  unit: string | null;
  value: unknown;
} {
  const nested = isRecord(record.nutrient) ? record.nutrient : null;
  const rawId = record.nutrientId ?? nested?.id;
  const numericId = typeof rawId === "number" && Number.isInteger(rawId) ? rawId : null;
  return {
    id: numericId,
    number: optionalString(record.nutrientNumber ?? nested?.number),
    unit: optionalString(record.unitName ?? nested?.unitName)?.toLowerCase() ?? null,
    value: record.value ?? record.amount,
  };
}

function normalizedNutrition(food: JsonRecord): {
  calories: string;
  nutrients: NutrientValues;
} {
  const records = nutrientRecords(food);
  let kcal: Decimal | null = null;
  let kilojoules: Decimal | null = null;
  const nutrients: NutrientValues = {};

  for (const record of records) {
    const nutrient = nutrientIdentity(record);
    if (nutrient.value === undefined || nutrient.value === null) continue;
    const amount = nonNegativeDecimal(nutrient.value);

    const isEnergy =
      (nutrient.id !== null && [1008, 1062, 2047, 2048].includes(nutrient.id)) ||
      (nutrient.number !== null && ["208", "268"].includes(nutrient.number));
    if (isEnergy) {
      if (nutrient.unit === "kcal") kcal ??= amount;
      else if (nutrient.unit === "kj") kilojoules ??= amount;
      else throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
      continue;
    }

    const definition = nutrientDefinitions.find(
      (candidate) =>
        (nutrient.id !== null && (candidate.ids as readonly number[]).includes(nutrient.id)) ||
        (nutrient.number !== null &&
          (candidate.numbers as readonly string[]).includes(nutrient.number)),
    );
    if (definition) {
      if (nutrient.unit !== definition.unit) {
        throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
      }
      nutrients[definition.name] = { amount: amount.toFixed(6), unit: definition.unit };
    }
  }

  const calories = kcal ?? kilojoules?.div("4.184") ?? null;
  if (calories === null) throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
  return { calories: calories.toFixed(6), nutrients };
}

function normalizedVerificationState(dataType: string): VerificationState {
  const normalized = dataType.trim().replace(/\s+/g, " ").toLocaleLowerCase();
  if (["foundation", "survey (fndds)", "fndds", "sr legacy"].includes(normalized)) {
    return "verified_authoritative";
  }
  if (normalized === "branded") return "verified_manufacturer";
  return "unverified";
}

function preparationState(description: string): string | null {
  const normalized = description.toLocaleLowerCase();
  for (const state of ["raw", "cooked", "fried", "roasted", "baked", "grilled", "boiled"]) {
    if (new RegExp(`\\b${state}\\b`).test(normalized)) return state;
  }
  return null;
}

function serving(params: {
  externalId: string;
  suffix: string;
  name: string;
  gramWeight?: unknown;
  milliliterVolume?: unknown;
}): FoodServing {
  const hasMass = params.gramWeight !== undefined && params.gramWeight !== null;
  const hasVolume = params.milliliterVolume !== undefined && params.milliliterVolume !== null;
  if (!hasMass && !hasVolume) throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
  return {
    id: `usda-${params.externalId}-${params.suffix}`,
    name: requiredString(params.name),
    quantity: "1.0000",
    unit: "serving",
    gramWeight: hasMass ? positiveDecimal(params.gramWeight).toFixed(4) : null,
    milliliterVolume: hasVolume ? positiveDecimal(params.milliliterVolume).toFixed(4) : null,
    isDefault: false,
    source: "usda",
    sourceServingId: params.suffix,
  };
}

function normalizedServings(food: JsonRecord, externalId: string): FoodServing[] {
  const result: FoodServing[] = [];

  if (food.servingSize !== undefined && food.servingSize !== null) {
    const unit = requiredString(food.servingSizeUnit).toLocaleLowerCase();
    if (unit !== "g" && unit !== "grm") {
      throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
    }
    result.push(
      serving({
        externalId,
        suffix: "label-serving",
        name: optionalString(food.householdServingFullText) ?? "1 serving",
        gramWeight: food.servingSize,
      }),
    );
  }

  const portions = food.foodPortions ?? food.foodMeasures;
  if (portions !== undefined) {
    if (!Array.isArray(portions)) throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
    portions.map(requiredRecord).forEach((portion, index) => {
      const rawId = portion.id;
      const suffix =
        typeof rawId === "number" || typeof rawId === "string" ? String(rawId) : `measure-${index}`;
      const name =
        optionalString(portion.portionDescription) ??
        optionalString(portion.disseminationText) ??
        optionalString(portion.modifier) ??
        "1 portion";
      result.push(
        serving({
          externalId,
          suffix,
          name,
          gramWeight: portion.gramWeight,
        }),
      );
    });
  }

  if (result.length === 0) {
    result.push(
      serving({
        externalId,
        suffix: "100g",
        name: "100 g",
        gramWeight: 100,
      }),
    );
  }
  result[0] = { ...result[0], isDefault: true };
  return result;
}

function normalizedCategory(food: JsonRecord): string | null {
  if (typeof food.foodCategory === "string") return optionalString(food.foodCategory);
  if (isRecord(food.foodCategory)) return optionalString(food.foodCategory.description);
  return null;
}

function normalizeFood(value: unknown): ProviderFood {
  const food = requiredRecord(value);
  const externalId = foodId(food);
  const name = requiredString(food.description);
  const dataType = requiredString(food.dataType);
  const nutrition = normalizedNutrition(food);

  return {
    provider: "usda",
    externalId,
    dataType,
    name,
    brand: optionalString(food.brandName) ?? optionalString(food.brandOwner),
    description: name,
    category: normalizedCategory(food),
    foodType: dataType.trim().toLocaleLowerCase() === "branded" ? "branded" : "generic",
    preparationState: preparationState(name),
    ingredientsText: optionalString(food.ingredients),
    verificationState: normalizedVerificationState(dataType),
    sourceUpdatedAt:
      optionalString(food.modifiedDate) ?? optionalString(food.publicationDate) ?? null,
    attribution: "USDA FoodData Central",
    calories: nutrition.calories,
    nutrients: nutrition.nutrients,
    basisQuantity: "100.0000",
    basisUnit: "g",
    servings: normalizedServings(food, externalId),
  };
}

function cloneFoods(foods: ProviderFood[]): ProviderFood[] {
  return structuredClone(foods);
}

export function createUsdaProvider(
  config: UsdaProviderConfig,
  fetchImpl: typeof fetch = fetch,
): NutritionProvider {
  const apiKey = config.apiKey.trim();
  if (!apiKey) throw providerError("USDA_API_KEY_REQUIRED");
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const cache = new Map<string, CacheEntry>();
  const inFlight = new Map<string, Promise<ProviderFood[]>>();

  async function requestJson(
    path: string,
    init?: Omit<RequestInit, "signal">,
  ): Promise<{ found: boolean; body: unknown }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const url = `${baseUrl}${path}${path.includes("?") ? "&" : "?"}api_key=${encodeURIComponent(apiKey)}`;
      const response = await fetchImpl(url, { ...init, signal: controller.signal });
      if (response.status === 404) return { found: false, body: null };
      if (!response.ok) throw providerError("NUTRITION_PROVIDER_UNAVAILABLE");
      try {
        return { found: true, body: await response.json() };
      } catch {
        throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
      }
    } catch (error) {
      if (controller.signal.aborted) throw providerError("NUTRITION_PROVIDER_TIMEOUT");
      if (
        error instanceof Error &&
        ["INVALID_NUTRITION_PROVIDER_PAYLOAD", "NUTRITION_PROVIDER_UNAVAILABLE"].includes(
          error.message,
        )
      ) {
        throw error;
      }
      throw providerError("NUTRITION_PROVIDER_UNAVAILABLE");
    } finally {
      clearTimeout(timeout);
    }
  }

  async function fetchSearch(query: string, limit: number): Promise<ProviderFood[]> {
    const response = await requestJson("/foods/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, pageSize: limit }),
    });
    const body = requiredRecord(response.body);
    if (!Array.isArray(body.foods)) {
      throw providerError("INVALID_NUTRITION_PROVIDER_PAYLOAD");
    }
    return body.foods.map(normalizeFood);
  }

  return {
    id: "usda",
    searchFoods(input) {
      const query = input.query.trim().replace(/\s+/g, " ");
      if (!query || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) {
        return Promise.reject(providerError("INVALID_FOOD_SEARCH_INPUT"));
      }
      const key = `${query.toLocaleLowerCase()}\u0000${input.limit}`;
      const cached = cache.get(key);
      if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cloneFoods(cached.foods));
      cache.delete(key);

      const active = inFlight.get(key);
      if (active) return active.then(cloneFoods);

      const request = fetchSearch(query, input.limit)
        .then((foods) => {
          cache.set(key, { foods: cloneFoods(foods), expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
          return foods;
        })
        .finally(() => {
          if (inFlight.get(key) === request) inFlight.delete(key);
        });
      inFlight.set(key, request);
      return request.then(cloneFoods);
    },
    async getFood(externalId) {
      if (!/^\d+$/.test(externalId) || new Decimal(externalId).lte(0)) {
        throw providerError("INVALID_FOOD_EXTERNAL_ID");
      }
      const response = await requestJson(`/food/${encodeURIComponent(externalId)}`);
      return response.found ? normalizeFood(response.body) : null;
    },
    async lookupBarcode() {
      return null;
    },
    providerMetadata() {
      return {
        id: "usda",
        displayName: "USDA FoodData Central",
        attribution: "U.S. Department of Agriculture, Agricultural Research Service",
      };
    },
  };
}
