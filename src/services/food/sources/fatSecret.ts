import { buildRemoteFood, fetchJson, gramsFromText } from "@/services/food/normalize";
import { FoodSource, FoodSourceError } from "@/services/food/types";
import { DatabaseFood, Nutrients100g } from "@/types/domain";

/**
 * FatSecret Platform API.
 *
 * FatSecret is available only through a server proxy. The proxy owns OAuth
 * credentials and IP allow-listing; the Expo client never receives them.
 */

type FSServing = {
  serving_id?: string;
  serving_description?: string;
  metric_serving_amount?: string;
  metric_serving_unit?: string;
  number_of_units?: string;
  measurement_description?: string;
  calories?: string;
  protein?: string;
  carbohydrate?: string;
  fat?: string;
  fiber?: string;
  sugar?: string;
  sodium?: string;
  saturated_fat?: string;
  cholesterol?: string;
  potassium?: string;
};

type FSFood = {
  food_id?: string;
  food_name?: string;
  brand_name?: string;
  food_description?: string;
  servings?: { serving?: FSServing | FSServing[] };
};

export const fatSecretSource: FoodSource = {
  id: "fatsecret",
  label: "FatSecret",
  requiresCredentials: false,
  credentialHint: "Requires a BiteIQ-managed server proxy URL.",
  isConfigured: (settings) => Boolean(settings.baseUrl?.trim()),

  async search({ query, limit, settings, signal }) {
    const base = settings.baseUrl?.trim();
    if (!base) throw new FoodSourceError("fatsecret", "FatSecret requires a server proxy URL.");

    const url = `${base.replace(/\/$/, "")}/server.api?method=foods.search&format=json&max_results=${limit}&search_expression=${encodeURIComponent(query)}`;

    try {
      const payload = await fetchJson<{ foods?: { food?: FSFood | FSFood[] }; error?: { message?: string } }>(url, { signal });
      if (payload.error?.message) throw new Error(payload.error.message);
      return asArray(payload.foods?.food)
        .map(toFood)
        .filter((food): food is DatabaseFood => Boolean(food));
    } catch (error) {
      throw new FoodSourceError("fatsecret", messageFor(error));
    }
  }
};

function toFood(food: FSFood): DatabaseFood | null {
  const servings = asArray(food.servings?.serving);
  // `foods.search` returns a summary line rather than full servings, so fall
  // back to parsing "Per 100g - Calories: 165kcal | Fat: 3.57g | ...".
  const primary = servings[0];
  const parsed = primary ? fromServing(primary) : fromDescription(food.food_description);

  if (!food.food_name || !parsed) return null;

  return buildRemoteFood({
    sourceId: "fatsecret",
    externalId: food.food_id || food.food_name,
    name: food.food_name,
    brand: food.brand_name,
    per100g: parsed.per100g,
    servings: servings.length
      ? servings.map((serving) => servingSeed(serving)).filter((seed): seed is { label: string; grams: number } => Boolean(seed))
      : parsed.servings
  });
}

/** Converts one serving's absolute values into a per-100 g rate. */
function fromServing(serving: FSServing): { per100g: Nutrients100g; servings: { label: string; grams: number }[] } | null {
  const grams = metricGrams(serving) ?? gramsFromText(serving.serving_description);
  const calories = number(serving.calories);
  if (!grams || calories === undefined) return null;

  const factor = 100 / grams;
  const per = (value: string | undefined) => {
    const parsed = number(value);
    return parsed === undefined ? undefined : parsed * factor;
  };

  return {
    per100g: {
      calories: calories * factor,
      proteinGrams: per(serving.protein) ?? 0,
      carbGrams: per(serving.carbohydrate) ?? 0,
      fatGrams: per(serving.fat) ?? 0,
      fiberGrams: per(serving.fiber),
      sugarGrams: per(serving.sugar),
      sodiumMg: per(serving.sodium),
      saturatedFatGrams: per(serving.saturated_fat),
      cholesterolMg: per(serving.cholesterol),
      potassiumMg: per(serving.potassium)
    },
    servings: [{ label: serving.serving_description || `1 serving (${Math.round(grams)} g)`, grams }]
  };
}

function servingSeed(serving: FSServing): { label: string; grams: number } | null {
  const grams = metricGrams(serving) ?? gramsFromText(serving.serving_description);
  if (!grams) return null;
  return { label: serving.serving_description || `1 serving (${Math.round(grams)} g)`, grams };
}

function metricGrams(serving: FSServing): number | undefined {
  const amount = number(serving.metric_serving_amount);
  const unit = serving.metric_serving_unit?.toLowerCase();
  if (amount === undefined) return undefined;
  if (unit === "g" || unit === "ml") return amount;
  if (unit === "oz") return amount * 28.35;
  return undefined;
}

function fromDescription(description: string | undefined) {
  if (!description) return null;

  const grams = gramsFromText(description.split("-")[0]);
  const pick = (label: string) => {
    const match = description.match(new RegExp(`${label}:\\s*([\\d.]+)`, "i"));
    return match ? Number(match[1]) : undefined;
  };

  const calories = pick("Calories");
  if (!grams || calories === undefined) return null;

  const factor = 100 / grams;
  return {
    per100g: {
      calories: calories * factor,
      proteinGrams: (pick("Protein") ?? 0) * factor,
      carbGrams: (pick("Carbs") ?? 0) * factor,
      fatGrams: (pick("Fat") ?? 0) * factor
    } as Nutrients100g,
    servings: [{ label: `1 serving (${Math.round(grams)} g)`, grams }]
  };
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function number(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function messageFor(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "Search timed out.";
  return error instanceof Error ? error.message : "Could not reach FatSecret.";
}
