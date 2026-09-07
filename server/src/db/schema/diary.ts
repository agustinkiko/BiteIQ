import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import { user } from "./auth.js";
import { foods } from "./foods.js";

const utcTimestamp = (name: string) => timestamp(name, { withTimezone: true });

export const diaryDays = pgTable(
  "diary_days",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    localDate: date("local_date").notNull(),
    goalSnapshot: jsonb("goal_snapshot").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    unique("diary_days_user_id_local_date_unique").on(
      table.userId,
      table.localDate,
    ),
    unique("diary_days_id_user_id_unique").on(table.id, table.userId),
    index("diary_days_user_id_local_date_idx").on(
      table.userId,
      table.localDate,
    ),
  ],
);

export const foodEntries = pgTable(
  "food_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id").notNull(),
    diaryDayId: uuid("diary_day_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mealType: text("meal_type").notNull(),
    foodId: uuid("food_id").references(() => foods.id, { onDelete: "set null" }),
    foodNameSnapshot: text("food_name_snapshot").notNull(),
    brandSnapshot: text("brand_snapshot"),
    sourceSnapshot: jsonb("source_snapshot").notNull(),
    servingSnapshot: jsonb("serving_snapshot").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    consumedGrams: numeric("consumed_grams", { precision: 12, scale: 4 }),
    consumedMilliliters: numeric("consumed_milliliters", {
      precision: 12,
      scale: 4,
    }),
    calorieSnapshot: numeric("calorie_snapshot", {
      precision: 18,
      scale: 6,
    }).notNull(),
    nutrientSnapshot: jsonb("nutrient_snapshot").notNull(),
    consumedAt: utcTimestamp("consumed_at").notNull(),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.diaryDayId, table.userId],
      foreignColumns: [diaryDays.id, diaryDays.userId],
      name: "food_entries_diary_day_id_user_id_diary_days_fk",
    }).onDelete("cascade"),
    unique("food_entries_user_id_client_id_unique").on(
      table.userId,
      table.clientId,
    ),
    index("food_entries_user_id_consumed_at_idx").on(
      table.userId,
      table.consumedAt,
    ),
    check(
      "food_entries_meal_type_check",
      sql`${table.mealType} in ('breakfast', 'lunch', 'dinner', 'snack')`,
    ),
    check("food_entries_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "food_entries_consumed_grams_positive",
      sql`${table.consumedGrams} is null or ${table.consumedGrams} > 0`,
    ),
    check(
      "food_entries_consumed_milliliters_positive",
      sql`${table.consumedMilliliters} is null or ${table.consumedMilliliters} > 0`,
    ),
    check(
      "food_entries_consumed_basis_check",
      sql`(${table.consumedGrams} is not null and ${table.consumedMilliliters} is null) or (${table.consumedGrams} is null and ${table.consumedMilliliters} is not null)`,
    ),
    check(
      "food_entries_calorie_snapshot_non_negative",
      sql`${table.calorieSnapshot} >= 0`,
    ),
  ],
);

export const dailyNutritionSummaries = pgTable(
  "daily_nutrition_summaries",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    localDate: date("local_date").notNull(),
    calorieTotal: numeric("calorie_total", {
      precision: 18,
      scale: 6,
    }).notNull(),
    nutrientTotals: jsonb("nutrient_totals").notNull(),
    goalSnapshot: jsonb("goal_snapshot").notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.localDate] }),
    check(
      "daily_nutrition_summaries_calorie_total_non_negative",
      sql`${table.calorieTotal} >= 0`,
    ),
  ],
);
