import { openFoodFactsSource } from "@/services/food/sources/openFoodFacts";
import { FoodSource, FoodSourceError } from "@/services/food/types";
import { DatabaseFood, FoodSourceConfig, FoodSourceId } from "@/types/domain";

/** Credential-free barcode fallback only. Food search and USDA stay server-backed. */
export const remoteSources: FoodSource[] = [openFoodFactsSource];

export function getSource(id: FoodSourceId): FoodSource | undefined {
  return remoteSources.find((source) => source.id === id);
}

export const sourceLabels: Record<FoodSourceId, string> = {
  local: "BiteIQ",
  openfoodfacts: "Open Food Facts",
  usda: "USDA",
  fatsecret: "FatSecret"
};

export type RemoteSearchResult = {
  foods: DatabaseFood[];
  /** Per-source failures, surfaced in the UI instead of thrown. */
  errors: { sourceId: FoodSourceId; message: string }[];
};

/**
 * Short-lived cache of remote results.
 *
 * Open Food Facts rate limits search to roughly ten calls a minute, and users
 * routinely retype or backspace into a query they just ran, so repeating a
 * search inside this window is served from memory instead of the network.
 */
const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; result: RemoteSearchResult }>();

function cacheKey(query: string, config: FoodSourceConfig): string {
  const enabled = remoteSources
    .filter((source) => config[source.id as Exclude<FoodSourceId, "local">]?.enabled)
    .map((source) => source.id)
    .join(",");
  return `${enabled}|${query.toLowerCase()}`;
}

export function clearFoodSearchCache() {
  cache.clear();
}

/**
 * Queries every configured remote catalog in parallel and merges the results.
 *
 * One source failing must not take down the search box, so failures are
 * collected rather than propagated — the local database has already produced
 * results by the time this resolves.
 */
export async function searchRemoteFoods(
  query: string,
  config: FoodSourceConfig,
  options?: { limit?: number; signal?: AbortSignal }
): Promise<RemoteSearchResult> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return { foods: [], errors: [] };

  const key = cacheKey(trimmed, config);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.result;

  const limit = options?.limit ?? 20;
  const active = remoteSources.filter((source) => {
    const settings = config[source.id as Exclude<FoodSourceId, "local">];
    return settings?.enabled && source.isConfigured(settings);
  });

  if (!active.length) return { foods: [], errors: [] };

  const settled = await Promise.allSettled(
    active.map((source) =>
      source.search({
        query: trimmed,
        limit,
        settings: config[source.id as Exclude<FoodSourceId, "local">],
        signal: options?.signal
      })
    )
  );

  const foods: DatabaseFood[] = [];
  const errors: RemoteSearchResult["errors"] = [];

  settled.forEach((result, index) => {
    if (result.status === "fulfilled") {
      foods.push(...result.value);
      return;
    }
    const reason = result.reason;
    if (reason instanceof Error && reason.name === "AbortError") return;
    errors.push({
      sourceId: active[index].id,
      message: reason instanceof FoodSourceError ? reason.message : reason instanceof Error ? reason.message : "Search failed."
    });
  });

  const result = { foods: dedupe(foods), errors };
  // Only cache clean runs; a rate-limited attempt should be retried.
  if (!errors.length) cache.set(key, { at: Date.now(), result });
  return result;
}

/** Barcode scans resolve through whichever configured source knows the code. */
export async function lookupBarcode(
  barcode: string,
  config: FoodSourceConfig,
  options?: { signal?: AbortSignal }
): Promise<DatabaseFood | undefined> {
  const capable = remoteSources.filter((source) => {
    const settings = config[source.id as Exclude<FoodSourceId, "local">];
    return Boolean(source.lookupBarcode) && settings?.enabled && source.isConfigured(settings);
  });

  for (const source of capable) {
    try {
      const food = await source.lookupBarcode?.({
        barcode,
        settings: config[source.id as Exclude<FoodSourceId, "local">],
        signal: options?.signal
      });
      if (food) return food;
    } catch {
      // Try the next catalog rather than failing the whole scan.
    }
  }

  return undefined;
}

/** Same name + brand from two catalogs is one food; keep the first seen. */
function dedupe(foods: DatabaseFood[]): DatabaseFood[] {
  const seen = new Set<string>();
  const unique: DatabaseFood[] = [];

  for (const food of foods) {
    const key = `${food.name.toLowerCase()}|${(food.brand || "").toLowerCase()}|${Math.round(food.per100g.calories)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(food);
  }

  return unique;
}
