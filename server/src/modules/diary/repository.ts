import { Decimal } from "decimal.js";
import {
  and,
  asc,
  eq,
  isNull,
  sql,
  type ExtractTablesWithRelations,
} from "drizzle-orm";
import type { NodePgTransaction } from "drizzle-orm/node-postgres";
import { z } from "zod";

import type { BiteIqDatabase } from "../../db/client.js";
import * as schema from "../../db/schema/index.js";
import {
  dailyNutritionSummaries,
  diaryDays,
  foodEntries,
  foodExternalSources,
  foodNutrients,
  foodServings,
  foods,
  nutrientDefinitions,
  userGoals,
  userProfiles,
} from "../../db/schema/index.js";
import type { NutrientValues } from "../foods/contracts.js";
import { calculateServingNutrition } from "../foods/nutrition.js";
import type {
  CreateDiaryEntryInput,
  DiaryDayDto,
  DiaryEntryDto,
  DiaryGoalSnapshot,
  DiaryServingSnapshot,
  DiarySourceSnapshot,
  MealType,
  UpdateDiaryEntryInput,
} from "./contracts.js";
import { localDateSchema } from "./contracts.js";

const authenticatedUserIdSchema = z.string().uuid();

type DiaryTransaction = NodePgTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
type StoredEntry = typeof foodEntries.$inferSelect;

export class DiaryRepositoryError extends Error {
  public constructor(
    public readonly code:
      | "PROFILE_REQUIRED"
      | "FOOD_NOT_FOUND"
      | "SERVING_NOT_FOUND"
      | "INVALID_NUTRITION",
    message: string,
  ) {
    super(message);
    this.name = "DiaryRepositoryError";
  }
}

export function createDiaryRepository(db: BiteIqDatabase) {
  return {
    async getDiary(userId: string, localDate: string): Promise<DiaryDayDto> {
      const ownerId = authenticatedUserIdSchema.parse(userId);
      const date = localDateSchema.parse(localDate);
      return db.transaction((transaction) => loadDiary(transaction, ownerId, date));
    },

    async createEntry(
      userId: string,
      input: CreateDiaryEntryInput,
    ): Promise<DiaryDayDto> {
      const ownerId = authenticatedUserIdSchema.parse(userId);
      return db.transaction(async (transaction) => {
        await advisoryLock(transaction, `diary-client:${ownerId}:${input.clientId}`);
        const existing = await findByClientId(transaction, ownerId, input.clientId);
        if (existing) {
          return loadDiary(transaction, ownerId, existing.localDate);
        }

        const timezone = await loadTimezone(transaction, ownerId);
        const localDate = localDateForInstant(input.consumedAt, timezone);
        await advisoryLock(transaction, diaryLockKey(ownerId, localDate));
        const day = await ensureDiaryDay(transaction, ownerId, localDate);
        const snapshot = await buildSnapshot(
          transaction,
          input.foodId,
          input.servingId,
          input.quantity,
        );
        const now = new Date();
        await transaction.insert(foodEntries).values({
          clientId: input.clientId,
          diaryDayId: day.id,
          userId: ownerId,
          mealType: input.mealType,
          foodId: input.foodId,
          ...snapshot,
          quantity: input.quantity,
          consumedAt: new Date(input.consumedAt),
          updatedAt: now,
        });
        await persistSummary(
          transaction,
          ownerId,
          localDate,
          day.goalSnapshot as DiaryGoalSnapshot,
        );
        return loadDiary(transaction, ownerId, localDate);
      });
    },

    async updateEntry(
      userId: string,
      entryId: string,
      input: UpdateDiaryEntryInput,
    ): Promise<DiaryDayDto | null> {
      const ownerId = authenticatedUserIdSchema.parse(userId);
      const id = z.string().uuid().parse(entryId);
      return db.transaction(async (transaction) => {
        await advisoryLock(transaction, `diary-entry:${id}`);
        const existing = await findOwnedEntry(transaction, ownerId, id);
        if (!existing) return null;

        const timezone = await loadTimezone(transaction, ownerId);
        const nextLocalDate = localDateForInstant(input.consumedAt, timezone);
        const dates = [...new Set([existing.localDate, nextLocalDate])].sort();
        for (const date of dates) {
          await advisoryLock(transaction, diaryLockKey(ownerId, date));
        }

        const sourceDay = await lockDiaryDay(transaction, ownerId, existing.localDate);
        const targetDay =
          nextLocalDate === existing.localDate
            ? sourceDay
            : await ensureDiaryDay(transaction, ownerId, nextLocalDate);
        const snapshot = await buildSnapshot(
          transaction,
          input.foodId,
          input.servingId,
          input.quantity,
        );
        await transaction
          .update(foodEntries)
          .set({
            diaryDayId: targetDay.id,
            mealType: input.mealType,
            foodId: input.foodId,
            ...snapshot,
            quantity: input.quantity,
            consumedAt: new Date(input.consumedAt),
            updatedAt: new Date(),
          })
          .where(and(eq(foodEntries.id, id), eq(foodEntries.userId, ownerId)));

        await persistSummary(
          transaction,
          ownerId,
          existing.localDate,
          sourceDay.goalSnapshot as DiaryGoalSnapshot,
        );
        if (nextLocalDate !== existing.localDate) {
          await persistSummary(
            transaction,
            ownerId,
            nextLocalDate,
            targetDay.goalSnapshot as DiaryGoalSnapshot,
          );
        }
        return loadDiary(transaction, ownerId, nextLocalDate);
      });
    },

    async deleteEntry(
      userId: string,
      entryId: string,
    ): Promise<DiaryDayDto | null> {
      const ownerId = authenticatedUserIdSchema.parse(userId);
      const id = z.string().uuid().parse(entryId);
      return db.transaction(async (transaction) => {
        await advisoryLock(transaction, `diary-entry:${id}`);
        const existing = await findOwnedEntry(transaction, ownerId, id);
        if (!existing) return null;

        await advisoryLock(transaction, diaryLockKey(ownerId, existing.localDate));
        const day = await lockDiaryDay(transaction, ownerId, existing.localDate);
        await transaction
          .delete(foodEntries)
          .where(and(eq(foodEntries.id, id), eq(foodEntries.userId, ownerId)));
        await persistSummary(
          transaction,
          ownerId,
          existing.localDate,
          day.goalSnapshot as DiaryGoalSnapshot,
        );
        return loadDiary(transaction, ownerId, existing.localDate);
      });
    },
  };
}

async function advisoryLock(
  transaction: DiaryTransaction,
  key: string,
): Promise<void> {
  await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}

function diaryLockKey(userId: string, localDate: string): string {
  return `diary-day:${userId}:${localDate}`;
}

async function loadTimezone(
  transaction: DiaryTransaction,
  userId: string,
): Promise<string> {
  const [profile] = await transaction
    .select({ timezone: userProfiles.timezone })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);
  if (!profile) {
    throw new DiaryRepositoryError(
      "PROFILE_REQUIRED",
      "Complete your profile before using the diary.",
    );
  }
  return profile.timezone;
}

function localDateForInstant(consumedAt: string, timezone: string): string {
  const instant = new Date(consumedAt);
  if (!Number.isFinite(instant.getTime())) {
    throw new DiaryRepositoryError("INVALID_NUTRITION", "Invalid consumed time.");
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

async function loadGoalSnapshot(
  transaction: DiaryTransaction,
  userId: string,
): Promise<DiaryGoalSnapshot> {
  const [goal] = await transaction
    .select({
      goalType: userGoals.goalType,
      calorieTargetKcal: userGoals.calorieTargetKcal,
      proteinTargetG: userGoals.proteinTargetG,
      carbohydrateTargetG: userGoals.carbohydrateTargetG,
      fatTargetG: userGoals.fatTargetG,
      targetMode: userGoals.targetMode,
      isManualCalorieTarget: userGoals.isManualCalorieTarget,
    })
    .from(userGoals)
    .where(eq(userGoals.userId, userId))
    .limit(1);
  return goal ?? {};
}

async function ensureDiaryDay(
  transaction: DiaryTransaction,
  userId: string,
  localDate: string,
) {
  const goalSnapshot = await loadGoalSnapshot(transaction, userId);
  await transaction
    .insert(diaryDays)
    .values({ userId, localDate, goalSnapshot })
    .onConflictDoNothing({ target: [diaryDays.userId, diaryDays.localDate] });
  return lockDiaryDay(transaction, userId, localDate);
}

async function lockDiaryDay(
  transaction: DiaryTransaction,
  userId: string,
  localDate: string,
) {
  const [day] = await transaction
    .select()
    .from(diaryDays)
    .where(and(eq(diaryDays.userId, userId), eq(diaryDays.localDate, localDate)))
    .limit(1)
    .for("update");
  if (!day) throw new Error("DIARY_DAY_NOT_FOUND");
  return day;
}

async function findByClientId(
  transaction: DiaryTransaction,
  userId: string,
  clientId: string,
) {
  const [entry] = await transaction
    .select({ localDate: diaryDays.localDate })
    .from(foodEntries)
    .innerJoin(diaryDays, eq(diaryDays.id, foodEntries.diaryDayId))
    .where(and(eq(foodEntries.userId, userId), eq(foodEntries.clientId, clientId)))
    .limit(1);
  return entry ?? null;
}

async function findOwnedEntry(
  transaction: DiaryTransaction,
  userId: string,
  entryId: string,
) {
  const [entry] = await transaction
    .select({ entry: foodEntries, localDate: diaryDays.localDate })
    .from(foodEntries)
    .innerJoin(diaryDays, eq(diaryDays.id, foodEntries.diaryDayId))
    .where(and(eq(foodEntries.id, entryId), eq(foodEntries.userId, userId)))
    .limit(1)
    .for("update");
  return entry ?? null;
}

async function buildSnapshot(
  transaction: DiaryTransaction,
  foodId: string,
  servingId: string,
  quantity: string,
) {
  const [food] = await transaction
    .select()
    .from(foods)
    .where(and(eq(foods.id, foodId), isNull(foods.disabledAt)))
    .limit(1);
  if (!food) {
    throw new DiaryRepositoryError(
      "FOOD_NOT_FOUND",
      "That food is no longer available. Search again.",
    );
  }

  const [serving] = await transaction
    .select()
    .from(foodServings)
    .where(and(eq(foodServings.id, servingId), eq(foodServings.foodId, foodId)))
    .limit(1);
  if (!serving) {
    throw new DiaryRepositoryError(
      "SERVING_NOT_FOUND",
      "That serving is no longer available. Search again.",
    );
  }

  const nutrientRows = await transaction
    .select({
      canonicalName: nutrientDefinitions.canonicalName,
      unit: nutrientDefinitions.unit,
      amount: foodNutrients.amount,
      basisQuantity: foodNutrients.basisQuantity,
      basisUnit: foodNutrients.basisUnit,
    })
    .from(foodNutrients)
    .innerJoin(
      nutrientDefinitions,
      eq(nutrientDefinitions.id, foodNutrients.nutrientId),
    )
    .where(eq(foodNutrients.foodId, foodId))
    .orderBy(asc(nutrientDefinitions.displayOrder));
  const calories = nutrientRows.find((row) => row.canonicalName === "calories");
  if (!calories || (calories.basisUnit !== "g" && calories.basisUnit !== "ml")) {
    throw new DiaryRepositoryError(
      "INVALID_NUTRITION",
      "This food does not have usable nutrition data.",
    );
  }
  const nutrients: NutrientValues = {};
  for (const row of nutrientRows) {
    if (row.canonicalName !== "calories") {
      nutrients[row.canonicalName] = { amount: row.amount, unit: row.unit };
    }
  }

  const servingSnapshot: DiaryServingSnapshot = {
    id: serving.id,
    name: serving.servingName,
    quantity: serving.quantity,
    unit: serving.unit as DiaryServingSnapshot["unit"],
    gramWeight: serving.gramWeight,
    milliliterVolume: serving.milliliterVolume,
    isDefault: serving.isDefault,
    source: serving.source,
    sourceServingId: serving.sourceServingId,
  };
  let calculated;
  try {
    calculated = calculateServingNutrition(
      {
        calories: calories.amount,
        nutrients,
        basisQuantity: calories.basisQuantity,
        basisUnit: calories.basisUnit,
      },
      servingSnapshot,
      quantity,
    );
  } catch (error) {
    throw new DiaryRepositoryError(
      "INVALID_NUTRITION",
      error instanceof Error ? error.message : "Invalid nutrition data.",
    );
  }

  const [source] = await transaction
    .select()
    .from(foodExternalSources)
    .where(eq(foodExternalSources.foodId, foodId))
    .orderBy(sql`${foodExternalSources.importedAt} desc`, asc(foodExternalSources.id))
    .limit(1);
  const reference = source?.originalServingReference as
    | { attribution?: unknown }
    | null
    | undefined;
  const sourceSnapshot: DiarySourceSnapshot = {
    provider: source?.provider ?? null,
    externalId: source?.externalId ?? null,
    datasetType: source?.datasetType ?? null,
    providerUpdatedAt: source?.providerUpdatedAt?.toISOString() ?? null,
    importedAt: source?.importedAt.toISOString() ?? null,
    verificationState: source?.verificationState ?? null,
    attribution:
      typeof reference?.attribution === "string" ? reference.attribution : null,
    licenseCategory: source?.licenseCategory ?? null,
  };

  return {
    foodNameSnapshot: food.name,
    brandSnapshot: food.brand,
    sourceSnapshot,
    servingSnapshot,
    consumedGrams: calculated.consumedGrams,
    consumedMilliliters: calculated.consumedMilliliters,
    calorieSnapshot: calculated.calories,
    nutrientSnapshot: calculated.nutrients,
  };
}

async function persistSummary(
  transaction: DiaryTransaction,
  userId: string,
  localDate: string,
  goalSnapshot: DiaryGoalSnapshot,
): Promise<void> {
  const rows = await transaction
    .select({
      calories: foodEntries.calorieSnapshot,
      nutrients: foodEntries.nutrientSnapshot,
    })
    .from(foodEntries)
    .innerJoin(diaryDays, eq(diaryDays.id, foodEntries.diaryDayId))
    .where(and(eq(foodEntries.userId, userId), eq(diaryDays.localDate, localDate)));

  let calorieTotal = new Decimal(0);
  const nutrientTotals: NutrientValues = {};
  for (const row of rows) {
    calorieTotal = calorieTotal.plus(row.calories);
    const nutrients = row.nutrients as NutrientValues;
    for (const [name, nutrient] of Object.entries(nutrients)) {
      const current = nutrientTotals[name];
      if (current && current.unit !== nutrient.unit) {
        throw new Error(`NUTRIENT_UNIT_MISMATCH:${name}`);
      }
      nutrientTotals[name] = {
        amount: new Decimal(current?.amount ?? 0)
          .plus(nutrient.amount)
          .toFixed(6),
        unit: nutrient.unit,
      };
    }
  }

  await transaction
    .insert(dailyNutritionSummaries)
    .values({
      userId,
      localDate,
      calorieTotal: calorieTotal.toFixed(6),
      nutrientTotals,
      goalSnapshot,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [dailyNutritionSummaries.userId, dailyNutritionSummaries.localDate],
      set: {
        calorieTotal: calorieTotal.toFixed(6),
        nutrientTotals,
        goalSnapshot,
        updatedAt: new Date(),
      },
    });
}

async function loadDiary(
  transaction: DiaryTransaction,
  userId: string,
  localDate: string,
): Promise<DiaryDayDto> {
  const rows = await transaction
    .select({ entry: foodEntries })
    .from(foodEntries)
    .innerJoin(diaryDays, eq(diaryDays.id, foodEntries.diaryDayId))
    .where(and(eq(foodEntries.userId, userId), eq(diaryDays.localDate, localDate)))
    .orderBy(asc(foodEntries.consumedAt), asc(foodEntries.createdAt), asc(foodEntries.id));
  const [day] = await transaction
    .select({ goalSnapshot: diaryDays.goalSnapshot })
    .from(diaryDays)
    .where(and(eq(diaryDays.userId, userId), eq(diaryDays.localDate, localDate)))
    .limit(1);
  const [summary] = await transaction
    .select()
    .from(dailyNutritionSummaries)
    .where(
      and(
        eq(dailyNutritionSummaries.userId, userId),
        eq(dailyNutritionSummaries.localDate, localDate),
      ),
    )
    .limit(1);
  const goalSnapshot = (summary?.goalSnapshot ??
    day?.goalSnapshot ??
    (await loadGoalSnapshot(transaction, userId))) as DiaryGoalSnapshot;

  return {
    localDate,
    entries: rows.map(({ entry }) => entryDto(entry)),
    summary: {
      calorieTotal: summary?.calorieTotal ?? "0.000000",
      nutrientTotals: (summary?.nutrientTotals as NutrientValues | undefined) ?? {},
      goalSnapshot,
    },
  };
}

function entryDto(entry: StoredEntry): DiaryEntryDto {
  return {
    id: entry.id,
    clientId: entry.clientId,
    userId: entry.userId,
    mealType: entry.mealType as MealType,
    foodId: entry.foodId,
    foodNameSnapshot: entry.foodNameSnapshot,
    brandSnapshot: entry.brandSnapshot,
    sourceSnapshot: entry.sourceSnapshot as DiarySourceSnapshot,
    servingSnapshot: entry.servingSnapshot as DiaryServingSnapshot,
    quantity: entry.quantity,
    consumedGrams: entry.consumedGrams,
    consumedMilliliters: entry.consumedMilliliters,
    calorieSnapshot: entry.calorieSnapshot,
    nutrientSnapshot: entry.nutrientSnapshot as NutrientValues,
    consumedAt: entry.consumedAt.toISOString(),
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export type DiaryRepository = ReturnType<typeof createDiaryRepository>;
