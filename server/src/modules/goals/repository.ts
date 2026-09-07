import { eq } from "drizzle-orm";
import { z } from "zod";

import type { BiteIqDatabase } from "../../db/client.js";
import { userGoals, userProfiles } from "../../db/schema/index.js";
import type {
  CalculatedGoal,
  GoalInput,
  GoalWarning,
  ProfileInput,
} from "./contracts.js";

const authenticatedUserIdSchema = z.string().uuid();

export function createGoalsRepository(db: BiteIqDatabase) {
  return {
    async getProfile(userId: string) {
      const ownerId = authenticatedUserIdSchema.parse(userId);
      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, ownerId))
        .limit(1);

      return profile ?? null;
    },

    async upsertProfile(userId: string, profile: ProfileInput) {
      const ownerId = authenticatedUserIdSchema.parse(userId);
      const now = new Date();
      const row = {
        userId: ownerId,
        ...profile,
        heightCm: profile.heightCm.toString(),
        updatedAt: now,
      };
      const [saved] = await db
        .insert(userProfiles)
        .values(row)
        .onConflictDoUpdate({
          target: userProfiles.userId,
          set: {
            displayName: row.displayName,
            dateOfBirth: row.dateOfBirth,
            biologicalSex: row.biologicalSex,
            heightCm: row.heightCm,
            countryCode: row.countryCode,
            timezone: row.timezone,
            languageCode: row.languageCode,
            measurementSystem: row.measurementSystem,
            updatedAt: now,
          },
        })
        .returning();

      return saved!;
    },

    async getGoal(userId: string) {
      const ownerId = authenticatedUserIdSchema.parse(userId);
      const [goal] = await db
        .select()
        .from(userGoals)
        .where(eq(userGoals.userId, ownerId))
        .limit(1);

      return goal ? withWarnings(goal) : null;
    },

    async upsertGoal(
      userId: string,
      input: GoalInput,
      calculated: CalculatedGoal,
      dateOfBirth: string,
    ) {
      const ownerId = authenticatedUserIdSchema.parse(userId);
      return db.transaction(async (transaction) => {
        const now = new Date();
        const row = {
          userId: ownerId,
          goalType: input.goalType,
          startingWeightKg: input.startingWeightKg.toString(),
          currentWeightKg: input.currentWeightKg.toString(),
          targetWeightKg: input.targetWeightKg.toString(),
          weeklyRateKg: input.weeklyRateKg.toString(),
          activityLevel: input.activityLevel,
          plannedExerciseInActivity: input.plannedExerciseInActivity,
          equation: calculated.equation,
          equationInputs: {
            ...calculated.equationInputs,
            dateOfBirth,
            goalType: input.goalType,
            startingWeightKg: input.startingWeightKg,
            targetWeightKg: input.targetWeightKg,
            weeklyRateKg: input.weeklyRateKg,
            plannedExerciseInActivity: input.plannedExerciseInActivity,
            targetMode: input.targetMode,
            macros: input.macros,
            manualCalorieTargetKcal: input.manualCalorieTargetKcal ?? null,
          },
          bmrKcal: calculated.bmrKcal,
          activityMultiplier: calculated.activityMultiplier,
          tdeeKcal: calculated.tdeeKcal,
          calorieAdjustmentKcal: calculated.calorieAdjustmentKcal,
          calorieTargetKcal: calculated.calorieTargetKcal,
          proteinTargetG: calculated.proteinTargetG,
          carbohydrateTargetG: calculated.carbohydrateTargetG,
          fatTargetG: calculated.fatTargetG,
          targetMode: input.targetMode,
          isManualCalorieTarget: calculated.isManualCalorieTarget,
          updatedAt: now,
        };
        const [saved] = await transaction
          .insert(userGoals)
          .values(row)
          .onConflictDoUpdate({
            target: userGoals.userId,
            set: {
              goalType: row.goalType,
              startingWeightKg: row.startingWeightKg,
              currentWeightKg: row.currentWeightKg,
              targetWeightKg: row.targetWeightKg,
              weeklyRateKg: row.weeklyRateKg,
              activityLevel: row.activityLevel,
              plannedExerciseInActivity: row.plannedExerciseInActivity,
              equation: row.equation,
              equationInputs: row.equationInputs,
              bmrKcal: row.bmrKcal,
              activityMultiplier: row.activityMultiplier,
              tdeeKcal: row.tdeeKcal,
              calorieAdjustmentKcal: row.calorieAdjustmentKcal,
              calorieTargetKcal: row.calorieTargetKcal,
              proteinTargetG: row.proteinTargetG,
              carbohydrateTargetG: row.carbohydrateTargetG,
              fatTargetG: row.fatTargetG,
              targetMode: row.targetMode,
              isManualCalorieTarget: row.isManualCalorieTarget,
              updatedAt: now,
            },
          })
          .returning();

        return withWarnings(saved!);
      });
    },
  };
}

type StoredGoal = typeof userGoals.$inferSelect;

function withWarnings(goal: StoredGoal): StoredGoal & { warnings: GoalWarning[] } {
  const warnings: GoalWarning[] = [];
  if (Math.abs(Number(goal.weeklyRateKg ?? 0)) > 1) {
    warnings.push("EXTREME_RATE");
  }
  if (Number(goal.calorieTargetKcal) < 1200) {
    warnings.push("LOW_CALORIE_TARGET");
  }

  return { ...goal, warnings };
}

export type GoalsRepository = ReturnType<typeof createGoalsRepository>;
