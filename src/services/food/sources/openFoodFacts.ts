import { Platform } from "react-native";

import { buildRemoteFood, fetchJson, gramsFromText } from "@/services/food/normalize";
import { FoodSource, FoodSourceError } from "@/services/food/types";
import { DatabaseFood, Nutrients100g } from "@/types/domain";

const DEFAULT_BASE_URL = "https://world.openfoodfacts.org";

/**
 * Open Food Facts is an open, crowd-sourced barcode catalog. No credentials
 * are needed, and it already reports nutrition per 100 g, which makes it the
 * cheapest source to support and the best one for barcode scans.
 */

type OFFProduct = {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Record<string, number | string | undefined>;
};

export const openFoodFactsSource: FoodSource = {
  id: "openfoodfacts",
  label: "Open Food Facts",
  requiresCredentials: false,
  credentialHint: "Open catalog — no API key required.",
  isConfigured: () => true,

  async search({ query, limit, settings, signal }) {
    const base = settings.baseUrl || DEFAULT_BASE_URL;
    const url =
      `${base}/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
      `&search_simple=1&action=process&json=1&page_size=${limit}` +
      `&fields=${encodeURIComponent(FIELDS)}`;

    try {
      const payload = await fetchJson<{ products?: OFFProduct[] }>(url, { signal, headers: USER_AGENT });
      return (payload.products || []).map(toFood).filter((food): food is DatabaseFood => Boolean(food));
    } catch (error) {
      throw new FoodSourceError("openfoodfacts", messageFor(error));
    }
  },

  async lookupBarcode({ barcode, settings, signal }) {
    const base = settings.baseUrl || DEFAULT_BASE_URL;
    const url = `${base}/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${encodeURIComponent(FIELDS)}`;

    try {
      const payload = await fetchJson<{ status?: number; product?: OFFProduct }>(url, { signal, headers: USER_AGENT });
      if (payload.status !== 1 || !payload.product) return undefined;
      return toFood(payload.product) || undefined;
    } catch (error) {
      throw new FoodSourceError("openfoodfacts", messageFor(error));
    }
  }
};

const FIELDS = ["code", "product_name", "product_name_en", "generic_name", "brands", "serving_size", "serving_quantity", "nutriments"].join(",");

/**
 * Open Food Facts asks clients to identify themselves, which native builds do.
 * On web any custom header turns the request into a CORS preflight that the
 * legacy `cgi/search.pl` endpoint does not answer, so the web build sends none
 * — the browser's own User-Agent goes out instead.
 */
const USER_AGENT: Record<string, string> =
  Platform.OS === "web" ? {} : { "User-Agent": "BiteIQ/0.1 (nutrition tracking app)" };

function toFood(product: OFFProduct): DatabaseFood | null {
  const name = product.product_name_en || product.product_name || product.generic_name;
  const nutriments = product.nutriments || {};
  const calories = num(nutriments["energy-kcal_100g"]) ?? kcalFromKj(num(nutriments["energy_100g"]));

  // Entries with no name or no energy value are unusable as diary rows.
  if (!name || calories === undefined) return null;

  const per100g: Nutrients100g = {
    calories,
    proteinGrams: num(nutriments["proteins_100g"]) ?? 0,
    carbGrams: num(nutriments["carbohydrates_100g"]) ?? 0,
    fatGrams: num(nutriments["fat_100g"]) ?? 0,
    fiberGrams: num(nutriments["fiber_100g"]),
    sugarGrams: num(nutriments["sugars_100g"]),
    // OFF reports sodium in grams per 100 g.
    sodiumMg: scale(num(nutriments["sodium_100g"]), 1000),
    saturatedFatGrams: num(nutriments["saturated-fat_100g"]),
    cholesterolMg: scale(num(nutriments["cholesterol_100g"]), 1000),
    potassiumMg: scale(num(nutriments["potassium_100g"]), 1000)
  };

  const servingGrams = num(product.serving_quantity) ?? gramsFromText(product.serving_size);

  return buildRemoteFood({
    sourceId: "openfoodfacts",
    externalId: product.code || name,
    name,
    brand: firstBrand(product.brands),
    barcode: product.code,
    per100g,
    servings: servingGrams ? [{ label: product.serving_size || `1 serving (${Math.round(servingGrams)} g)`, grams: servingGrams }] : []
  });
}

function firstBrand(brands: string | undefined): string | undefined {
  return brands?.split(",")[0]?.trim() || undefined;
}

function num(value: number | string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function scale(value: number | undefined, factor: number): number | undefined {
  return value === undefined ? undefined : value * factor;
}

function kcalFromKj(kj: number | undefined): number | undefined {
  return kj === undefined ? undefined : kj / 4.184;
}

function messageFor(error: unknown): string {
  if (error instanceof Error && error.name === "AbortError") return "Search timed out.";
  return error instanceof Error ? error.message : "Could not reach Open Food Facts.";
}
