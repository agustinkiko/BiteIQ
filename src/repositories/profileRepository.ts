import { apiRequest } from "@/api/client";
import { ApiError } from "@/api/contracts";
import {
  CalculatedGoal,
  GoalInput,
  GoalWarning,
  ProfileInput,
  StoredGoal,
  UserProfile
} from "@/types/domain";

type ProfileResponse = { profile: UserProfile | null };
type GoalResponse = { goal: StoredGoal | null };
type CalculationResponse = { calculation: CalculatedGoal };
type SaveGoalResponse = { goal: StoredGoal };

export class GoalConfirmationRequiredError extends Error {
  constructor(public readonly warnings: GoalWarning[]) {
    super("Review and confirm the goal safety warnings before saving.");
    this.name = "GoalConfirmationRequiredError";
  }
}

export class ProfileConfirmationRequiredError extends Error {
  constructor(public readonly warnings: GoalWarning[]) {
    super("Review and confirm the profile safety warnings before saving.");
    this.name = "ProfileConfirmationRequiredError";
  }
}

export const profileRepository = {
  async get(): Promise<UserProfile | null> {
    const response = await apiRequest<ProfileResponse>("/me");
    return response.profile;
  },

  async update(
    profile: Partial<ProfileInput>,
    confirmedWarnings: GoalWarning[] = []
  ): Promise<UserProfile> {
    try {
      const response = await apiRequest<ProfileResponse>("/me", {
        method: "PATCH",
        body: JSON.stringify({ ...profilePayload(profile), confirmedWarnings })
      });
      if (!response.profile) throw new Error("The saved profile was not returned.");
      return response.profile;
    } catch (error) {
      if (error instanceof ApiError && error.warnings.length > 0) {
        throw new ProfileConfirmationRequiredError(goalWarnings(error.warnings));
      }
      throw error;
    }
  },

  async getGoal(): Promise<StoredGoal | null> {
    const response = await apiRequest<GoalResponse>("/goals");
    return response.goal;
  },

  async calculateGoal(goal: GoalInput): Promise<CalculatedGoal> {
    const response = await apiRequest<CalculationResponse>("/goals/calculate", {
      method: "POST",
      body: JSON.stringify(goalPayload(goal))
    });
    return response.calculation;
  },

  async saveGoal(
    goal: GoalInput,
    calculation: CalculatedGoal,
    confirmedWarnings: GoalWarning[] = []
  ): Promise<SaveGoalResponse> {
    const unconfirmedWarnings = calculation.warnings.filter(
      (warning) => !confirmedWarnings.includes(warning)
    );
    if (unconfirmedWarnings.length > 0) {
      throw new GoalConfirmationRequiredError(unconfirmedWarnings);
    }

    return apiRequest<SaveGoalResponse>("/goals", {
      method: "PUT",
      body: JSON.stringify({ ...goalPayload(goal), confirmedWarnings })
    });
  }
};

const profileKeys: (keyof ProfileInput)[] = [
  "displayName",
  "dateOfBirth",
  "biologicalSex",
  "heightCm",
  "countryCode",
  "timezone",
  "languageCode",
  "measurementSystem"
];

function profilePayload(profile: Partial<ProfileInput>): Partial<ProfileInput> {
  return Object.fromEntries(
    profileKeys
      .filter((key) => profile[key] !== undefined)
      .map((key) => [key, profile[key]])
  ) as Partial<ProfileInput>;
}

function goalPayload(goal: GoalInput): GoalInput {
  return {
    goalType: goal.goalType,
    startingWeightKg: goal.startingWeightKg,
    currentWeightKg: goal.currentWeightKg,
    targetWeightKg: goal.targetWeightKg,
    weeklyRateKg: goal.weeklyRateKg,
    activityLevel: goal.activityLevel,
    plannedExerciseInActivity: goal.plannedExerciseInActivity,
    targetMode: goal.targetMode,
    macros: {
      protein: goal.macros.protein,
      carbohydrate: goal.macros.carbohydrate,
      fat: goal.macros.fat
    },
    ...(goal.manualCalorieTargetKcal === undefined
      ? {}
      : { manualCalorieTargetKcal: goal.manualCalorieTargetKcal })
  };
}

function goalWarnings(warnings: string[]): GoalWarning[] {
  return warnings.filter(
    (warning): warning is GoalWarning =>
      warning === "EXTREME_RATE" || warning === "LOW_CALORIE_TARGET"
  );
}
