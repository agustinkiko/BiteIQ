import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth.js";

const utcTimestamp = (name: string) => timestamp(name, { withTimezone: true });

export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    dateOfBirth: date("date_of_birth").notNull(),
    biologicalSex: text("biological_sex").notNull(),
    heightCm: numeric("height_cm", { precision: 7, scale: 2 }).notNull(),
    countryCode: text("country_code").notNull(),
    timezone: text("timezone").notNull(),
    languageCode: text("language_code").default("en").notNull(),
    measurementSystem: text("measurement_system").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "user_profiles_biological_sex_check",
      sql`${table.biologicalSex} in ('male', 'female', 'unspecified')`,
    ),
    check("user_profiles_height_cm_positive", sql`${table.heightCm} > 0`),
    check(
      "user_profiles_measurement_system_check",
      sql`${table.measurementSystem} in ('metric', 'imperial')`,
    ),
  ],
);

export const userGoals = pgTable(
  "user_goals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    goalType: text("goal_type").notNull(),
    startingWeightKg: numeric("starting_weight_kg", {
      precision: 7,
      scale: 3,
    }).notNull(),
    currentWeightKg: numeric("current_weight_kg", {
      precision: 7,
      scale: 3,
    }).notNull(),
    targetWeightKg: numeric("target_weight_kg", {
      precision: 7,
      scale: 3,
    }).notNull(),
    weeklyRateKg: numeric("weekly_rate_kg", { precision: 5, scale: 3 }),
    activityLevel: text("activity_level").notNull(),
    plannedExerciseInActivity: boolean("planned_exercise_in_activity")
      .default(false)
      .notNull(),
    equation: text("equation").notNull(),
    equationInputs: jsonb("equation_inputs").notNull(),
    bmrKcal: numeric("bmr_kcal", { precision: 9, scale: 3 }).notNull(),
    activityMultiplier: numeric("activity_multiplier", {
      precision: 5,
      scale: 3,
    }).notNull(),
    tdeeKcal: numeric("tdee_kcal", { precision: 9, scale: 3 }).notNull(),
    calorieAdjustmentKcal: numeric("calorie_adjustment_kcal", {
      precision: 9,
      scale: 3,
    }).notNull(),
    calorieTargetKcal: numeric("calorie_target_kcal", {
      precision: 9,
      scale: 3,
    }).notNull(),
    proteinTargetG: numeric("protein_target_g", {
      precision: 9,
      scale: 3,
    }).notNull(),
    carbohydrateTargetG: numeric("carbohydrate_target_g", {
      precision: 9,
      scale: 3,
    }).notNull(),
    fatTargetG: numeric("fat_target_g", { precision: 9, scale: 3 }).notNull(),
    targetMode: text("target_mode").notNull(),
    isManualCalorieTarget: boolean("is_manual_calorie_target")
      .default(false)
      .notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "user_goals_goal_type_check",
      sql`${table.goalType} in ('lose', 'maintain', 'gain')`,
    ),
    check(
      "user_goals_starting_weight_positive",
      sql`${table.startingWeightKg} > 0`,
    ),
    check(
      "user_goals_current_weight_positive",
      sql`${table.currentWeightKg} > 0`,
    ),
    check(
      "user_goals_target_weight_positive",
      sql`${table.targetWeightKg} > 0`,
    ),
    check(
      "user_goals_activity_level_check",
      sql`${table.activityLevel} in ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active')`,
    ),
    check(
      "user_goals_equation_check",
      sql`${table.equation} in ('mifflin_st_jeor')`,
    ),
    check("user_goals_bmr_non_negative", sql`${table.bmrKcal} >= 0`),
    check(
      "user_goals_activity_multiplier_positive",
      sql`${table.activityMultiplier} > 0`,
    ),
    check("user_goals_tdee_non_negative", sql`${table.tdeeKcal} >= 0`),
    check(
      "user_goals_calorie_target_non_negative",
      sql`${table.calorieTargetKcal} >= 0`,
    ),
    check(
      "user_goals_protein_target_non_negative",
      sql`${table.proteinTargetG} >= 0`,
    ),
    check(
      "user_goals_carbohydrate_target_non_negative",
      sql`${table.carbohydrateTargetG} >= 0`,
    ),
    check(
      "user_goals_fat_target_non_negative",
      sql`${table.fatTargetG} >= 0`,
    ),
    check(
      "user_goals_target_mode_check",
      sql`${table.targetMode} in ('percentage', 'grams')`,
    ),
  ],
);
