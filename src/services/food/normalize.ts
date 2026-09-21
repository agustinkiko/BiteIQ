import { DatabaseFood, FoodCategory, FoodSourceId, Nutrients100g, ServingOption } from "@/types/domain";

/**
 * Shared normalization for remote catalogs. Each upstream reports nutrition
 * differently — per 100 g, per serving, or per arbitrary unit — so adapters
 * convert to a per-100 g rate here and hand over the servings they know about.
 */

export type ServingSeed = {
  label: string;
  grams: number;
};

export function buildRemoteFood(input: {
  sourceId: FoodSourceId;
  externalId: string;
  name: string;
  brand?: string;
  barcode?: string;
  category?: FoodCategory;
  per100g: Nutrients100g;
  servings: ServingSeed[];
}): DatabaseFood {
  return {
    id: `${prefixFor(input.sourceId)}:${input.externalId}`,
    name: cleanText(input.name),
    brand: input.brand ? cleanText(input.brand) : undefined,
    barcode: input.barcode,
    category: input.category || guessCategory(input.name, input.per100g),
    source: input.sourceId,
    verified: true,
    per100g: sanitize(input.per100g),
    servings: dedupeServings(input.servings, input.externalId)
  };
}

export function prefixFor(sourceId: FoodSourceId): string {
  if (sourceId === "openfoodfacts") return "off";
  if (sourceId === "usda") return "usda";
  if (sourceId === "fatsecret") return "fs";
  return "local";
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Drops NaN/negative noise that upstream catalogs occasionally contain. */
function sanitize(per100g: Nutrients100g): Nutrients100g {
  const clamp = (value: number | undefined) =>
    value === undefined || !Number.isFinite(value) || value < 0 ? undefined : Math.round(value * 10) / 10;

  return {
    calories: clamp(per100g.calories) ?? 0,
    proteinGrams: clamp(per100g.proteinGrams) ?? 0,
    carbGrams: clamp(per100g.carbGrams) ?? 0,
    fatGrams: clamp(per100g.fatGrams) ?? 0,
    fiberGrams: clamp(per100g.fiberGrams),
    sugarGrams: clamp(per100g.sugarGrams),
    sodiumMg: clamp(per100g.sodiumMg),
    saturatedFatGrams: clamp(per100g.saturatedFatGrams),
    cholesterolMg: clamp(per100g.cholesterolMg),
    potassiumMg: clamp(per100g.potassiumMg)
  };
}

function dedupeServings(seeds: ServingSeed[], externalId: string): ServingOption[] {
  const options: ServingOption[] = [];

  for (const seed of seeds) {
    if (!Number.isFinite(seed.grams) || seed.grams <= 0) continue;
    if (options.some((option) => Math.abs(option.grams - seed.grams) < 0.5)) continue;
    options.push({ id: `${externalId}-s${options.length}`, label: seed.label, grams: Math.round(seed.grams * 10) / 10 });
  }

  if (!options.some((option) => option.grams === 100)) {
    options.push({ id: `${externalId}-s100g`, label: "100 g", grams: 100 });
  }

  return options;
}

/** Rough bucketing so remote results can use the same category filters. */
function guessCategory(name: string, per100g: Nutrients100g): FoodCategory {
  const text = name.toLowerCase();
  if (/(water|juice|soda|cola|coffee|tea|milk drink|smoothie|beer|wine|drink)/.test(text)) return "beverage";
  if (/(yogurt|cheese|milk|cream|butter)/.test(text)) return "dairy";
  if (/(chicken|beef|pork|fish|salmon|tuna|shrimp|turkey|egg|tofu|bean|lentil|protein)/.test(text)) return "protein";
  if (/(bread|rice|pasta|oat|cereal|tortilla|bagel|cracker|noodle)/.test(text)) return "grain";
  if (/(apple|banana|berry|berries|orange|grape|mango|melon|peach|pear|fruit)/.test(text)) return "fruit";
  if (/(broccoli|spinach|lettuce|carrot|potato|tomato|pepper|onion|vegetable|salad)/.test(text)) return "vegetable";
  if (/(chip|cookie|candy|chocolate|bar|snack|nut|popcorn|pretzel)/.test(text)) return "snack";
  if (/(sauce|dressing|oil|syrup|ketchup|mustard|mayo|vinegar)/.test(text)) return "condiment";
  if (per100g.calories > 0 && per100g.proteinGrams >= 8) return "protein";
  return "prepared";
}

/**
 * Turns free-text serving descriptions like "1 cup (240 g)", "2 slices",
 * or "1 serving (28g)" into grams when the upstream doesn't give a number.
 */
export function gramsFromText(text: string | undefined): number | undefined {
  if (!text) return undefined;

  const grams = text.match(/([\d.]+)\s*g\b/i);
  if (grams) {
    const value = Number(grams[1]);
    if (Number.isFinite(value) && value > 0) return value;
  }

  const millilitres = text.match(/([\d.]+)\s*ml\b/i);
  if (millilitres) {
    const value = Number(millilitres[1]);
    // Close enough for water-like foods, which is most of what reports ml.
    if (Number.isFinite(value) && value > 0) return value;
  }

  const ounces = text.match(/([\d.]+)\s*oz\b/i);
  if (ounces) {
    const value = Number(ounces[1]);
    if (Number.isFinite(value) && value > 0) return value * 28.35;
  }

  return undefined;
}

/** `fetch` with a timeout, so a hung catalog can't wedge the search box. */
export async function fetchJson<T>(url: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 8000, signal, ...rest } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(url, { ...rest, signal: controller.signal });
    if (response.status === 429) {
      throw new Error("Rate limited — try again in a moment.");
    }
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}
