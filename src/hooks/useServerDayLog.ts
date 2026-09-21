import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Network from "expo-network";
import { useEffect } from "react";

import { authClient } from "@/auth/authClient";
import { clearUserSessionData } from "@/auth/sessionCleanup";
import {
  DiaryDay,
  DiaryEntryValues,
  createClientId,
  diaryRepository
} from "@/repositories/diaryRepository";
import { emptyNutrition } from "@/services/nutritionMath";
import { useAppStore } from "@/store/useAppStore";
import {
  captureUserSessionEpoch,
  isUserSessionEpochCurrent,
  useOfflineStore
} from "@/store/useOfflineStore";
import {
  DailyLog,
  FoodSelection,
  Meal,
  MealType,
  NutritionEstimate,
  ProvenanceSource
} from "@/types/domain";

export const OFFLINE_EDIT_MESSAGE = "Reconnect to edit or delete this entry.";
export const OFFLINE_SYNC_INTERVAL_MS = 5_000;

export class OfflineDiaryMutationError extends Error {
  constructor() {
    super(OFFLINE_EDIT_MESSAGE);
    this.name = "OfflineDiaryMutationError";
  }
}

type CreateSelection = FoodSelection & { mealType: MealType };
type UpdateSelection = FoodSelection & { mealType: MealType };

export function useServerDayLog(date: string) {
  const session = authClient.useSession();
  const userId = session.data?.user.id;
  const queryClient = useQueryClient();
  const timezone = useAppStore((state) => state.user.timezone);
  const hasOfflineHydrated = useOfflineStore((state) => state.hasHydrated);
  const cachedDay = useOfflineStore((state) =>
    userId ? state.cachedDays[userId]?.[date] : undefined
  );

  const queryKey = ["diary", userId, date] as const;
  const query = useQuery({
    queryKey,
    enabled: Boolean(userId && hasOfflineHydrated),
    initialData: cachedDay,
    retry: false,
    queryFn: async () => {
      if (!userId) throw new Error("Sign in to load your diary.");
      const sessionEpoch = captureUserSessionEpoch(userId);
      await useOfflineStore.getState().flushCreates(userId);
      if (!isUserSessionEpochCurrent(userId, sessionEpoch)) {
        throw new Error("Session changed while loading the diary.");
      }
      const day = await diaryRepository.getDay(date);
      if (!isUserSessionEpochCurrent(userId, sessionEpoch)) {
        throw new Error("Session changed while loading the diary.");
      }
      useOfflineStore.getState().cacheDay(userId, day);
      return day;
    }
  });

  function replaceDay(day: DiaryDay, sessionEpoch: number) {
    if (!userId || !isUserSessionEpochCurrent(userId, sessionEpoch)) return;
    queryClient.setQueryData(["diary", userId, day.localDate], day);
    useOfflineStore.getState().cacheDay(userId, day);
  }

  async function createEntry(selection: CreateSelection) {
    if (!userId) throw new Error("Sign in to add food.");
    const sessionEpoch = captureUserSessionEpoch(userId);
    const input = {
      ...selection,
      clientId: createClientId(),
      consumedAt: noonInTimeZone(date, timezone)
    };

    try {
      const day = await diaryRepository.createEntry(date, input);
      replaceDay(day, sessionEpoch);
      return { queued: false as const, day };
    } catch (error) {
      if (!isUserSessionEpochCurrent(userId, sessionEpoch)) throw error;
      if (!isOfflineError(error)) throw error;
      useOfflineStore.getState().enqueueCreate(userId, date, input);
      return { queued: true as const };
    }
  }

  async function updateEntry(entryId: string, selection: UpdateSelection) {
    if (!userId) throw new Error("Sign in to edit food.");
    const sessionEpoch = captureUserSessionEpoch(userId);
    const input: DiaryEntryValues = {
      ...selection,
      consumedAt: noonInTimeZone(date, timezone)
    };
    try {
      const day = await diaryRepository.updateEntry(entryId, input);
      if (day) replaceDay(day, sessionEpoch);
      return day;
    } catch (error) {
      if (isOfflineError(error)) throw new OfflineDiaryMutationError();
      throw error;
    }
  }

  async function deleteEntry(entryId: string) {
    if (!userId) throw new Error("Sign in to delete food.");
    const sessionEpoch = captureUserSessionEpoch(userId);
    try {
      const day = await diaryRepository.deleteEntry(entryId);
      if (day) replaceDay(day, sessionEpoch);
      return day;
    } catch (error) {
      if (isOfflineError(error)) throw new OfflineDiaryMutationError();
      throw error;
    }
  }

  const day = query.data ?? cachedDay;

  return {
    ...query,
    userId,
    date,
    day,
    log: mapDiaryDayToLog(day, date),
    totals: mapDiarySummary(day),
    isOffline: query.isError && Boolean(day),
    createEntry,
    updateEntry,
    deleteEntry
  };
}

/**
 * Runs once near the authenticated navigator root. Expo SDK 51 has no network
 * change subscription, so a bounded poll checks connectivity without allowing
 * overlapping checks or outbox flushes.
 */
export function useOfflineDiaryLifecycle(userId: string | undefined) {
  const queryClient = useQueryClient();
  const hasHydrated = useOfflineStore((state) => state.hasHydrated);

  useEffect(() => {
    if (!userId || !hasHydrated) return;
    const authenticatedUserId = userId;
    let active = true;
    let checking = false;

    async function syncIfOnline() {
      if (checking || !active) return;
      checking = true;
      try {
        const network = await Network.getNetworkStateAsync();
        if (!active || network.isConnected !== true || network.isInternetReachable === false) return;
        const days = await useOfflineStore.getState().flushCreates(authenticatedUserId);
        if (!active) return;
        for (const day of days) {
          queryClient.setQueryData(["diary", authenticatedUserId, day.localDate], day);
        }
      } catch {
        // A failed connectivity probe or create stays queued for the next poll.
      } finally {
        checking = false;
      }
    }

    void syncIfOnline();
    const interval = setInterval(() => void syncIfOnline(), OFFLINE_SYNC_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [hasHydrated, queryClient, userId]);

  useEffect(
    () => () => {
      if (!userId) return;
      clearUserSessionData(queryClient, userId);
    },
    [queryClient, userId]
  );
}

export function mapDiaryDayToLog(day: DiaryDay | undefined, date: string): DailyLog {
  return {
    date,
    meals: day?.entries.map(mapDiaryEntry) ?? [],
    waterMl: 0,
    exercises: []
  };
}

export function mapDiarySummary(day: DiaryDay | undefined): NutritionEstimate {
  if (!day) return emptyNutrition();
  const nutrients = day.summary.nutrientTotals;
  return {
    calories: finiteNumber(day.summary.calorieTotal),
    proteinGrams: nutrientAmount(nutrients, "protein"),
    carbGrams: nutrientAmount(nutrients, "carbohydrate"),
    fatGrams: nutrientAmount(nutrients, "fat"),
    fiberGrams: nutrientAmount(nutrients, "fiber"),
    sugarGrams: nutrientAmount(nutrients, "sugar"),
    sodiumMg: nutrientAmount(nutrients, "sodium"),
    saturatedFatGrams: nutrientAmount(nutrients, "saturated_fat"),
    cholesterolMg: nutrientAmount(nutrients, "cholesterol"),
    potassiumMg: nutrientAmount(nutrients, "potassium"),
    provenance: []
  };
}

function mapDiaryEntry(entry: DiaryDay["entries"][number]): Meal {
  const provenance: ProvenanceSource[] = ["nutrition_database"];
  const nutrition: NutritionEstimate = {
    calories: finiteNumber(entry.calorieSnapshot),
    proteinGrams: nutrientAmount(entry.nutrientSnapshot, "protein"),
    carbGrams: nutrientAmount(entry.nutrientSnapshot, "carbohydrate"),
    fatGrams: nutrientAmount(entry.nutrientSnapshot, "fat"),
    fiberGrams: nutrientAmount(entry.nutrientSnapshot, "fiber"),
    sugarGrams: nutrientAmount(entry.nutrientSnapshot, "sugar"),
    sodiumMg: nutrientAmount(entry.nutrientSnapshot, "sodium"),
    saturatedFatGrams: nutrientAmount(entry.nutrientSnapshot, "saturated_fat"),
    cholesterolMg: nutrientAmount(entry.nutrientSnapshot, "cholesterol"),
    potassiumMg: nutrientAmount(entry.nutrientSnapshot, "potassium"),
    provenance
  };

  return {
    id: entry.id,
    title: entry.foodNameSnapshot,
    mealType: entry.mealType,
    capturedWith: "search",
    capturedAt: entry.consumedAt,
    entries: [
      {
        id: entry.id,
        userEdited: entry.updatedAt !== entry.createdAt,
        foodItem: {
          id: entry.id,
          name: entry.foodNameSnapshot,
          ...(entry.brandSnapshot ? { brand: entry.brandSnapshot } : {}),
          servingSize: entry.servingSnapshot.name,
          quantity: finiteNumber(entry.quantity),
          ...(entry.consumedGrams ? { grams: finiteNumber(entry.consumedGrams) } : {}),
          ...(entry.foodId ? { sourceFoodId: entry.foodId } : {}),
          servingId: entry.servingSnapshot.id,
          nutrition,
          confidence: 1,
          provenance
        }
      }
    ]
  };
}

function nutrientAmount(
  nutrients: DiaryDay["summary"]["nutrientTotals"],
  name: string
): number {
  return finiteNumber(nutrients[name]?.amount);
}

function finiteNumber(value: string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function noonInTimeZone(date: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Invalid diary date: ${date}`);
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const desiredWallTime = Date.UTC(year, month - 1, day, 12, 0, 0, 0);

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
  } catch {
    throw new Error("A valid saved profile timezone is required to log diary entries.");
  }

  let instant = desiredWallTime;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = zonedParts(formatter, instant);
    const representedWallTime = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    instant += desiredWallTime - representedWallTime;
  }

  const result = zonedParts(formatter, instant);
  if (
    result.year !== year ||
    result.month !== month ||
    result.day !== day ||
    result.hour !== 12 ||
    result.minute !== 0
  ) {
    throw new Error("The saved profile timezone could not represent the diary date.");
  }
  return new Date(instant).toISOString();
}

function zonedParts(formatter: Intl.DateTimeFormat, instant: number) {
  const values = Object.fromEntries(
    formatter
      .formatToParts(new Date(instant))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second
  };
}

function isOfflineError(error: unknown): boolean {
  return error instanceof TypeError ||
    (error instanceof Error && /network request failed|failed to fetch|offline/i.test(error.message));
}
