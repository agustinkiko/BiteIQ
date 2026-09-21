import { getFoodById } from "@/data/foodDatabase";
import { useAppStore } from "@/store/useAppStore";
import { DatabaseFood } from "@/types/domain";

/**
 * Resolves a food id against the bundled table first, then the cache of
 * remote foods the user has already touched. Diary entries store only the
 * source id, so this is what lets an Open Food Facts item still be re-served
 * and re-priced days later, offline.
 */
export function resolveFood(id: string | undefined): DatabaseFood | undefined {
  if (!id) return undefined;
  return getFoodById(id) || useAppStore.getState().cachedFoods[id];
}
