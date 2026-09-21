import { buildRemoteFood, fetchJson, gramsFromText } from "@/services/food/normalize";
import { FoodSource, FoodSourceError } from "@/services/food/types";
import { DatabaseFood, Nutrients100g } from "@/types/domain";

/**
 * USDA FoodData Central — the authoritative source for generic whole foods.
 *
 * Branded entries report nutrients per 100 g directly; Foundation and
 * SR Legacy entries do too, with `foodPortions` describing household measures.
 * Production search is server-managed so provider credentials never enter the
 * Expo bundle. This legacy adapter only accepts an explicit server proxy URL.
 */

type FDCNutrient = {
  nutrientId?: number;
  nutrientNumber?: string;
  nutrientName?: string;
  unitName?: string;
  value?: number;
};

type FDCPortion = {
  gramWeight?: number;
  modifier?: string;
  measureUnit?: { name?: string };
  portionDescription?: string;
  amount?: number;
};

type FDCFood = {
  fdcId: number;
  description?: string;
  brandName?: string;
  brandOwner?: string;
  gtinUpc?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  dataType?: string;
  foodNutrients?: FDCNutrient[];
  foodPortions?: FDCPortion[];
};

export const usdaSource: FoodSource = {
  id: "usda",
  label: "USDA FoodData Central",
  requiresCredentials: false,
  credentialHint: "Managed by the BiteIQ server.",
  isConfigured: (settings) => Boolean(settings.baseUrl?.trim()),

  async search({ query, limit, settings, signal }) {
    const base = settings.baseUrl?.trim();
    if (!base) throw new FoodSourceError("usda", "USDA search is managed by the BiteIQ server.");

    const url =
      `${base.replace(/\/$/, "")}/foods/search?query=${encodeURIComponent(query)}&pageSize=${limit}` +
      `&dataType=${encodeURIComponent("Foundation,SR Legacy,Branded")}`;

    try {
      const payload = await fetchJson<{ foods?: FDCFood[] }>(url, { signal });
      return (payload.foods || []).map(toFood).filter((food): food is DatabaseFood => Boolean(food));
    } catch (error) {
      throw new FoodSourceError("usda", messageFor(error));
    }
  }
};

function toFood(food: FDCFood): DatabaseFood | null {
  const name = food.description;
  const calories = energy(food);
  // Some Foundation entries carry only micronutrients; without an energy
  // value they can't become a diary row, so they're dropped.
  if (!name || calories === undefined) return null;

  const per100g: Nutrients100g = {
    calories,
    proteinGrams: nutrient(food, [1003], ["203"]) ?? 0,
    carbGrams: nutrient(food, [1005], ["205"]) ?? 0,
    fatGrams: nutrient(food, [1004], ["204"]) ?? 0,
    fiberGrams: nutrient(food, [1079], ["291"]),
    sugarGrams: nutrient(food, [2000, 1063], ["269"]),
    sodiumMg: nutrient(food, [1093], ["307"]),
    saturatedFatGrams: nutrient(food, [1258], ["606"]),
    cholesterolMg: nutrient(food, [1253], ["601"]),
    potassiumMg: nutrient(food, [1092], ["306"])
  };

  return buildRemoteFood({
    sourceId: "usda",
    externalId: String(food.fdcId),
    name,
    brand: food.brandName || food.brandOwner,
    barcode: food.gtinUpc,
    per100g,
    servings: servingsFor(food)
  });
}

function servingsFor(food: FDCFood) {
  const servings: { label: string; grams: number }[] = [];

  // Branded foods carry a single labelled serving.
  if (food.servingSize && isGramLike(food.servingSizeUnit)) {
    const label = food.householdServingFullText
      ? `${food.householdServingFullText} (${Math.round(food.servingSize)} g)`
      : `1 serving (${Math.round(food.servingSize)} g)`;
    servings.push({ label, grams: food.servingSize });
  } else if (food.householdServingFullText) {
    const grams = gramsFromText(food.householdServingFullText);
    if (grams) servings.push({ label: food.householdServingFullText, grams });
  }

  // Foundation and SR Legacy foods carry household measures instead.
  for (const portion of food.foodPortions || []) {
    if (!portion.gramWeight) continue;
    const unit = portion.measureUnit?.name && portion.measureUnit.name !== "undetermined" ? portion.measureUnit.name : "";
    const descriptor = portion.portionDescription || [portion.amount, unit, portion.modifier].filter(Boolean).join(" ").trim();
    servings.push({
      label: `${descriptor || "1 portion"} (${Math.round(portion.gramWeight)} g)`,
      grams: portion.gramWeight
    });
  }

  return servings;
}

function isGramLike(unit: string | undefined): boolean {
  const normalized = unit?.toLowerCase();
  // FDC uses "g" for solids and "ml"/"GRM" variants elsewhere; ml is close
  // enough to grams for the beverage entries that report it.
  return normalized === "g" || normalized === "grm" || normalized === "ml" || normalized === "mlt";
}

/**
 * Nutrient values are already per 100 g. Search results and detail responses
 * label nutrients differently, so both the numeric id and the legacy nutrient
 * number are checked.
 */
function nutrient(food: FDCFood, ids: number[], numbers: string[]): number | undefined {
  return find(food, ids, numbers)?.value;
}

/**
 * Energy is reported as kcal for most foods, but some entries only carry the
 * kJ figure or the Atwater-derived values, so all three are tried in order.
 */
function energy(food: FDCFood): number | undefined {
  const kcal = find(food, [1008, 2047, 2048], ["208"]);
  if (kcal?.value !== undefined && !isKilojoules(kcal.unitName)) return kcal.value;
  if (kcal?.value !== undefined) return kcal.value / 4.184;

  const kj = find(food, [1062], ["268"]);
  return kj?.value === undefined ? undefined : kj.value / 4.184;
}

function isKilojoules(unit: string | undefined): boolean {
  return unit?.toLowerCase() === "kj";
}

function find(food: FDCFood, ids: number[], numbers: string[]): FDCNutrient | undefined {
  const match = (food.foodNutrients || []).find(
    (item) =>
      (item.nutrientId !== undefined && ids.includes(item.nutrientId)) ||
      (item.nutrientNumber !== undefined && numbers.includes(item.nutrientNumber))
  );
  return match?.value !== undefined && Number.isFinite(match.value) ? match : undefined;
}

function messageFor(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "Search timed out.";
  if (error instanceof Error && error.message.startsWith("403")) return "FoodData Central rejected the API key.";
  if (error instanceof Error && error.message.startsWith("429")) return "FoodData Central rate limit reached.";
  return error instanceof Error ? error.message : "Could not reach FoodData Central.";
}
