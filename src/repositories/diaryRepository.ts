import { ApiError } from "@/api/contracts";
import { apiRequest } from "@/api/client";
import { MealType } from "@/types/domain";

export type DiaryNutrient = {
  amount: string;
  unit: string;
};

export type DiarySourceSnapshot = {
  provider: string | null;
  externalId: string | null;
  datasetType: string | null;
  providerUpdatedAt: string | null;
  importedAt: string | null;
  verificationState: string | null;
  attribution: string | null;
  licenseCategory: string | null;
};

export type DiaryServingSnapshot = {
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

export type DiaryEntry = {
  id: string;
  clientId: string;
  userId: string;
  mealType: MealType;
  foodId: string | null;
  foodNameSnapshot: string;
  brandSnapshot: string | null;
  sourceSnapshot: DiarySourceSnapshot;
  servingSnapshot: DiaryServingSnapshot;
  quantity: string;
  consumedGrams: string | null;
  consumedMilliliters: string | null;
  calorieSnapshot: string;
  nutrientSnapshot: Record<string, DiaryNutrient>;
  consumedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type DiaryDay = {
  localDate: string;
  entries: DiaryEntry[];
  summary: {
    calorieTotal: string;
    nutrientTotals: Record<string, DiaryNutrient>;
    goalSnapshot: Record<string, unknown>;
  };
};

export type DiaryEntryValues = {
  foodId: string;
  servingId: string;
  quantity: number | string;
  mealType: MealType;
  consumedAt: string;
};

export type CreateDiaryEntry = DiaryEntryValues & {
  clientId?: string;
};

type DiaryResponse = { diary: DiaryDay };

export const diaryRepository = {
  async getDay(date: string, signal?: AbortSignal): Promise<DiaryDay> {
    const response = await apiRequest<DiaryResponse>(`/diary/${encodeURIComponent(date)}`, {
      signal
    });
    return response.diary;
  },

  async createEntry(date: string, input: CreateDiaryEntry): Promise<DiaryDay> {
    const response = await apiRequest<DiaryResponse>(
      `/diary/${encodeURIComponent(date)}/entries`,
      {
        method: "POST",
        body: JSON.stringify({
          clientId: input.clientId ?? createClientId(),
          foodId: input.foodId,
          servingId: input.servingId,
          quantity: input.quantity,
          mealType: input.mealType,
          consumedAt: input.consumedAt
        })
      }
    );
    return response.diary;
  },

  async updateEntry(entryId: string, input: DiaryEntryValues): Promise<DiaryDay | null> {
    try {
      const response = await apiRequest<DiaryResponse>(
        `/diary/entries/${encodeURIComponent(entryId)}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            foodId: input.foodId,
            servingId: input.servingId,
            quantity: input.quantity,
            mealType: input.mealType,
            consumedAt: input.consumedAt
          })
        }
      );
      return response.diary;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  },

  async deleteEntry(entryId: string): Promise<DiaryDay | null> {
    try {
      const response = await apiRequest<DiaryResponse>(
        `/diary/entries/${encodeURIComponent(entryId)}`,
        { method: "DELETE" }
      );
      return response.diary;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }
};

export function createClientId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
