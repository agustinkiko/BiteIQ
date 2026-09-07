import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const utcTimestamp = (name: string) => timestamp(name, { withTimezone: true });

export const nutrientDefinitions = pgTable(
  "nutrient_definitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    canonicalName: text("canonical_name").notNull().unique(),
    displayName: text("display_name").notNull(),
    unit: text("unit").notNull(),
    nutrientType: text("nutrient_type").notNull(),
    usdaNutrientId: integer("usda_nutrient_id").unique(),
    displayOrder: integer("display_order").notNull(),
  },
  (table) => [
    check(
      "nutrient_definitions_unit_check",
      sql`${table.unit} in ('kcal', 'kJ', 'g', 'mg', 'mcg', 'IU')`,
    ),
    check(
      "nutrient_definitions_type_check",
      sql`${table.nutrientType} in ('energy', 'macro', 'vitamin', 'mineral', 'other')`,
    ),
    check(
      "nutrient_definitions_display_order_non_negative",
      sql`${table.displayOrder} >= 0`,
    ),
  ],
);

export const foods = pgTable(
  "foods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    brand: text("brand"),
    description: text("description"),
    category: text("category"),
    countryCode: text("country_code"),
    languageCode: text("language_code"),
    foodType: text("food_type").notNull(),
    preparationState: text("preparation_state"),
    ingredientsText: text("ingredients_text"),
    dataQuality: text("data_quality").notNull(),
    verified: boolean("verified").default(false).notNull(),
    disabledAt: utcTimestamp("disabled_at"),
    createdAt: utcTimestamp("created_at").defaultNow().notNull(),
    updatedAt: utcTimestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    check(
      "foods_food_type_check",
      sql`${table.foodType} in ('generic', 'whole_food', 'branded', 'prepared', 'restaurant', 'user_created', 'development')`,
    ),
    index("foods_normalized_name_trgm_idx").using(
      "gin",
      table.normalizedName.op("gin_trgm_ops"),
    ),
  ],
);

export const foodAliases = pgTable(
  "food_aliases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    languageCode: text("language_code"),
  },
  (table) => [
    unique("food_aliases_food_id_normalized_alias_unique").on(
      table.foodId,
      table.normalizedAlias,
    ),
    index("food_aliases_normalized_alias_trgm_idx").using(
      "gin",
      table.normalizedAlias.op("gin_trgm_ops"),
    ),
  ],
);

export const foodServings = pgTable(
  "food_servings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    servingName: text("serving_name").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 4 }).notNull(),
    unit: text("unit").notNull(),
    gramWeight: numeric("gram_weight", { precision: 12, scale: 4 }),
    milliliterVolume: numeric("milliliter_volume", {
      precision: 12,
      scale: 4,
    }),
    isDefault: boolean("is_default").default(false).notNull(),
    source: text("source").notNull(),
    sourceServingId: text("source_serving_id"),
  },
  (table) => [
    index("food_servings_food_id_idx").on(table.foodId),
    check("food_servings_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "food_servings_unit_check",
      sql`${table.unit} in ('serving', 'g', 'ml')`,
    ),
    check(
      "food_servings_gram_weight_positive",
      sql`${table.gramWeight} is null or ${table.gramWeight} > 0`,
    ),
    check(
      "food_servings_milliliter_volume_positive",
      sql`${table.milliliterVolume} is null or ${table.milliliterVolume} > 0`,
    ),
    check(
      "food_servings_measurement_present",
      sql`${table.gramWeight} is not null or ${table.milliliterVolume} is not null`,
    ),
  ],
);

export const foodNutrients = pgTable(
  "food_nutrients",
  {
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    nutrientId: uuid("nutrient_id")
      .notNull()
      .references(() => nutrientDefinitions.id, { onDelete: "restrict" }),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    basisQuantity: numeric("basis_quantity", { precision: 12, scale: 4 })
      .default("100")
      .notNull(),
    basisUnit: text("basis_unit").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.foodId, table.nutrientId] }),
    check("food_nutrients_amount_non_negative", sql`${table.amount} >= 0`),
    check(
      "food_nutrients_basis_quantity_positive",
      sql`${table.basisQuantity} > 0`,
    ),
    check(
      "food_nutrients_basis_unit_check",
      sql`${table.basisUnit} in ('g', 'ml')`,
    ),
  ],
);

export const foodExternalSources = pgTable(
  "food_external_sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    foodId: uuid("food_id")
      .notNull()
      .references(() => foods.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    externalId: text("external_id").notNull(),
    datasetType: text("dataset_type"),
    providerUpdatedAt: utcTimestamp("provider_updated_at"),
    importedAt: utcTimestamp("imported_at").defaultNow().notNull(),
    verificationState: text("verification_state").notNull(),
    originalServingReference: jsonb("original_serving_reference"),
    licenseCategory: text("license_category"),
  },
  (table) => [
    unique("food_external_sources_provider_external_id_unique").on(
      table.provider,
      table.externalId,
    ),
    index("food_external_sources_provider_external_id_idx").on(
      table.provider,
      table.externalId,
    ),
    check(
      "food_external_sources_verification_state_check",
      sql`${table.verificationState} in ('verified_authoritative', 'verified_manufacturer', 'community', 'user_created', 'unverified')`,
    ),
  ],
);
