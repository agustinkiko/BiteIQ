import { z } from "zod";

export const biologicalSexSchema = z.enum(["male", "female", "unspecified"]);
export const goalTypeSchema = z.enum(["lose", "maintain", "gain"]);
export const activityLevelSchema = z.enum([
  "sedentary",
  "lightly_active",
  "moderately_active",
  "very_active",
  "extremely_active",
]);
export const targetModeSchema = z.enum(["percentage", "grams"]);
export const goalWarningSchema = z.enum([
  "EXTREME_RATE",
  "LOW_CALORIE_TARGET",
]);

const calendarDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(
  (value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month! - 1 &&
      date.getUTCDate() === day
    );
  },
  { message: "Must be a valid calendar date." },
);

const timezoneSchema = z.string().min(1).refine(
  (value) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  },
  { message: "Must be a valid IANA timezone." },
);

const positiveFinite = z.number().finite().positive();
const nonNegativeFinite = z.number().finite().nonnegative();

export const profileInputSchema = z
  .object({
    displayName: z.string().trim().min(1).max(200),
    dateOfBirth: calendarDateSchema,
    biologicalSex: biologicalSexSchema,
    heightCm: positiveFinite,
    countryCode: z.string().regex(/^[A-Z]{2}$/),
    timezone: timezoneSchema,
    languageCode: z.string().trim().min(2).max(35).default("en"),
    measurementSystem: z.enum(["metric", "imperial"]),
  })
  .strict();

export const profilePatchSchema = profileInputSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  { message: "At least one profile field is required." },
);

const macroTargetsSchema = z
  .object({
    protein: nonNegativeFinite,
    carbohydrate: nonNegativeFinite,
    fat: nonNegativeFinite,
  })
  .strict();

const goalFields = {
  goalType: goalTypeSchema,
  startingWeightKg: positiveFinite,
  currentWeightKg: positiveFinite,
  targetWeightKg: positiveFinite,
  weeklyRateKg: z.number().finite().min(-5).max(5),
  activityLevel: activityLevelSchema,
  plannedExerciseInActivity: z.boolean().default(false),
  targetMode: targetModeSchema,
  macros: macroTargetsSchema,
  manualCalorieTargetKcal: positiveFinite.optional(),
};

function validateGoal(
  value: z.infer<typeof goalInputBaseSchema>,
  context: z.RefinementCtx,
): void {
  if (value.goalType === "lose" && value.weeklyRateKg > 0) {
    context.addIssue({
      code: "custom",
      path: ["weeklyRateKg"],
      message: "A loss rate must be zero or negative.",
    });
  }
  if (value.goalType === "gain" && value.weeklyRateKg < 0) {
    context.addIssue({
      code: "custom",
      path: ["weeklyRateKg"],
      message: "A gain rate must be zero or positive.",
    });
  }
  if (value.goalType === "maintain" && value.weeklyRateKg !== 0) {
    context.addIssue({
      code: "custom",
      path: ["weeklyRateKg"],
      message: "A maintenance rate must be zero.",
    });
  }
  if (
    value.targetMode === "percentage" &&
    Math.abs(
      value.macros.protein + value.macros.carbohydrate + value.macros.fat - 100,
    ) > 1e-9
  ) {
    context.addIssue({
      code: "custom",
      path: ["macros"],
      message: "Macro percentages must total 100.",
    });
  }
}

const goalInputBaseSchema = z.object(goalFields).strict();

export const goalInputSchema = goalInputBaseSchema.superRefine(validateGoal);

export const goalPutSchema = z
  .object({
    ...goalFields,
    confirmedWarnings: z.array(goalWarningSchema).default([]),
  })
  .strict()
  .superRefine(validateGoal);

export const goalCalculationInputSchema = z
  .object({
    ...goalFields,
    dateOfBirth: calendarDateSchema,
    biologicalSex: biologicalSexSchema,
    heightCm: positiveFinite,
    timezone: timezoneSchema,
    calculationDate: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine(validateGoal);

export type ProfileInput = z.infer<typeof profileInputSchema>;
export type ProfilePatch = z.infer<typeof profilePatchSchema>;
export type GoalInput = z.infer<typeof goalInputSchema>;
export type GoalPutInput = z.infer<typeof goalPutSchema>;
export type GoalCalculationInput = z.infer<typeof goalCalculationInputSchema>;
export type GoalWarning = z.infer<typeof goalWarningSchema>;

export type CalculatedGoal = {
  equation: "mifflin_st_jeor";
  equationInputs: {
    biologicalSex: "male" | "female" | "unspecified";
    weightKg: number;
    heightCm: number;
    age: number;
    activityLevel: z.infer<typeof activityLevelSchema>;
    timezone: string;
    calculationDate: string;
  };
  bmrKcal: string;
  activityMultiplier: string;
  tdeeKcal: string;
  calorieAdjustmentKcal: string;
  calorieTargetKcal: string;
  proteinTargetG: string;
  carbohydrateTargetG: string;
  fatTargetG: string;
  isManualCalorieTarget: boolean;
  warnings: GoalWarning[];
};
