import { z } from "zod";

import type { NutrientValues } from "../foods/contracts.js";

export const mealTypeSchema = z.enum([
  "breakfast",
  "lunch",
  "dinner",
  "snack",
]);

export type MealType = z.infer<typeof mealTypeSchema>;

export const localDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "Date must use YYYY-MM-DD.")
  .refine(isCalendarDate, "Date must be a valid calendar date.")
  .refine(
    (value) => value >= "1900-01-01" && value <= "2100-12-31",
    "Date is outside the supported range.",
  );

const quantitySchema = z
  .union([z.string(), z.number().finite()])
  .transform((value) => String(value))
  .refine(
    (value) => {
      const number = Number(value);
      return Number.isFinite(number) && number > 0 && number <= 1_000_000;
    },
    "Quantity must be a positive number within the supported range.",
  );

const entryValuesSchema = {
  foodId: z.string().uuid(),
  servingId: z.string().uuid(),
  quantity: quantitySchema,
  mealType: mealTypeSchema,
  consumedAt: z.string().datetime({ offset: true }),
} as const;

export const createDiaryEntrySchema = z
  .object({
    clientId: z.string().uuid(),
    ...entryValuesSchema,
  })
  .strict();

export const updateDiaryEntrySchema = z.object(entryValuesSchema).strict();

export const diaryDateParamsSchema = z
  .object({ date: localDateSchema })
  .strict();

export const diaryEntryParamsSchema = z
  .object({ id: z.string().uuid() })
  .strict();

export type CreateDiaryEntryInput = z.infer<typeof createDiaryEntrySchema>;
export type UpdateDiaryEntryInput = z.infer<typeof updateDiaryEntrySchema>;

export interface DiarySourceSnapshot {
  provider: string | null;
  externalId: string | null;
  datasetType: string | null;
  providerUpdatedAt: string | null;
  importedAt: string | null;
  verificationState: string | null;
  attribution: string | null;
  licenseCategory: string | null;
}

export interface DiaryServingSnapshot {
  id: string;
  name: string;
  quantity: string;
  unit: "serving" | "g" | "ml";
  gramWeight: string | null;
  milliliterVolume: string | null;
  isDefault: boolean;
  source: string;
  sourceServingId: string | null;
}

export type DiaryGoalSnapshot = Record<string, unknown>;

export interface DiaryEntryDto {
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
  nutrientSnapshot: NutrientValues;
  consumedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DiarySummaryDto {
  calorieTotal: string;
  nutrientTotals: NutrientValues;
  goalSnapshot: DiaryGoalSnapshot;
}

export interface DiaryDayDto {
  localDate: string;
  entries: DiaryEntryDto[];
  summary: DiarySummaryDto;
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
