import { foodDatabase } from "@/data/foodDatabase";
import { currentFoodDevelopmentFeatures } from "@/config/defaults";
import { resolveFood } from "@/services/food/resolveFood";
import { DatabaseFood, FoodCategory, FoodSelection, RecentFood } from "@/types/domain";

export type SearchScope = "all" | FoodCategory;

/**
 * Ranked offline search. Exact prefix matches beat word-boundary matches,
 * which beat loose substring matches; brand text is searchable but weighted
 * below the food name so "cola" surfaces Coca-Cola rather than every drink.
 */
export function searchFoods(query: string, options?: { limit?: number; scope?: SearchScope }): DatabaseFood[] {
  if (!currentFoodDevelopmentFeatures().bundledFoods) return [];
  const limit = options?.limit ?? 40;
  const scope = options?.scope ?? "all";
  const needle = query.trim().toLowerCase();
  const pool = scope === "all" ? foodDatabase : foodDatabase.filter((food) => food.category === scope);

  if (!needle) {
    return pool.slice(0, limit).map(asDevelopmentExample);
  }

  const terms = needle.split(/\s+/).filter(Boolean);

  return pool
    .map((food) => ({ food, score: scoreFood(food, terms) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.food.name.length - b.food.name.length)
    .slice(0, limit)
    .map((row) => asDevelopmentExample(row.food));
}

function asDevelopmentExample(food: DatabaseFood): DatabaseFood {
  return { ...food, developmentExample: true };
}

function scoreFood(food: DatabaseFood, terms: string[]): number {
  const name = food.name.toLowerCase();
  const brand = (food.brand || "").toLowerCase();
  let total = 0;

  for (const term of terms) {
    let best = 0;
    if (name.startsWith(term)) best = 100;
    else if (new RegExp(`\\b${escapeRegExp(term)}`).test(name)) best = 70;
    else if (name.includes(term)) best = 40;

    if (brand) {
      if (brand.startsWith(term)) best = Math.max(best, 60);
      else if (brand.includes(term)) best = Math.max(best, 30);
    }

    // Every term has to land somewhere, so an unmatched term kills the result.
    if (best === 0) return 0;
    total += best;
  }

  return total + (food.verified ? 5 : 0);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Most-used foods first, ties broken by how recently they were logged. */
export function frequentFoods(recents: RecentFood[], limit = 20): DatabaseFood[] {
  return [...recents]
    .sort((a, b) => b.useCount - a.useCount || b.lastUsedAt.localeCompare(a.lastUsedAt))
    .map((recent) => resolveFood(recent.foodId))
    .filter((food): food is DatabaseFood => Boolean(food))
    .slice(0, limit);
}

/** Most recently logged foods first. */
export function recentFoods(recents: RecentFood[], limit = 20): DatabaseFood[] {
  return [...recents]
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    .map((recent) => resolveFood(recent.foodId))
    .filter((food): food is DatabaseFood => Boolean(food))
    .slice(0, limit);
}

export const categoryLabels: Record<FoodCategory, string> = {
  protein: "Protein",
  grain: "Grains",
  vegetable: "Veggies",
  fruit: "Fruit",
  dairy: "Dairy",
  snack: "Snacks",
  beverage: "Drinks",
  condiment: "Condiments",
  prepared: "Meals",
  restaurant: "Restaurants"
};

export const searchScopes: SearchScope[] = [
  "all",
  "protein",
  "grain",
  "vegetable",
  "fruit",
  "dairy",
  "prepared",
  "restaurant",
  "snack",
  "beverage",
  "condiment"
];

export function scopeLabel(scope: SearchScope): string {
  return scope === "all" ? "All" : categoryLabels[scope];
}

export function foodQualityLabel(food: DatabaseFood): string {
  if (isDevelopmentFood(food)) return "Development example";
  if (food.dataQuality === "verified_authoritative") return "Authoritative";
  if (food.dataQuality === "verified_manufacturer") return "Manufacturer verified";
  if (food.dataQuality === "community") return "Community sourced";
  if (food.dataQuality === "user_created") return "User created";
  return "Unverified";
}

export function isDevelopmentFood(food: DatabaseFood): boolean {
  return Boolean(
    currentFoodDevelopmentFeatures().localAdd &&
      (food.developmentExample ||
        (food.source === "local" && food.sourceDetails === undefined && food.dataQuality === undefined))
  );
}

/** The only canonical food fields handed to the server-owned diary mutation. */
export function canonicalFoodSelection(foodId: string, servingId: string, quantity: number): FoodSelection {
  return { foodId, servingId, quantity };
}
