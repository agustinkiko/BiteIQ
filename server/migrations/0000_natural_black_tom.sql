CREATE EXTENSION IF NOT EXISTS "pg_trgm";
--> statement-breakpoint
CREATE TABLE "account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_provider_id_account_id_unique" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "daily_nutrition_summaries" (
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"calorie_total" numeric(18, 6) NOT NULL,
	"nutrient_totals" jsonb NOT NULL,
	"goal_snapshot" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_nutrition_summaries_user_id_local_date_pk" PRIMARY KEY("user_id","local_date"),
	CONSTRAINT "daily_nutrition_summaries_calorie_total_non_negative" CHECK ("daily_nutrition_summaries"."calorie_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "diary_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"local_date" date NOT NULL,
	"goal_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diary_days_user_id_local_date_unique" UNIQUE("user_id","local_date"),
	CONSTRAINT "diary_days_id_user_id_unique" UNIQUE("id","user_id")
);
--> statement-breakpoint
CREATE TABLE "food_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"diary_day_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"meal_type" text NOT NULL,
	"food_id" uuid,
	"food_name_snapshot" text NOT NULL,
	"brand_snapshot" text,
	"source_snapshot" jsonb NOT NULL,
	"serving_snapshot" jsonb NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"consumed_grams" numeric(12, 4),
	"consumed_milliliters" numeric(12, 4),
	"calorie_snapshot" numeric(18, 6) NOT NULL,
	"nutrient_snapshot" jsonb NOT NULL,
	"consumed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "food_entries_user_id_client_id_unique" UNIQUE("user_id","client_id"),
	CONSTRAINT "food_entries_meal_type_check" CHECK ("food_entries"."meal_type" in ('breakfast', 'lunch', 'dinner', 'snack')),
	CONSTRAINT "food_entries_quantity_positive" CHECK ("food_entries"."quantity" > 0),
	CONSTRAINT "food_entries_consumed_grams_positive" CHECK ("food_entries"."consumed_grams" is null or "food_entries"."consumed_grams" > 0),
	CONSTRAINT "food_entries_consumed_milliliters_positive" CHECK ("food_entries"."consumed_milliliters" is null or "food_entries"."consumed_milliliters" > 0),
	CONSTRAINT "food_entries_consumed_basis_check" CHECK (("food_entries"."consumed_grams" is not null and "food_entries"."consumed_milliliters" is null) or ("food_entries"."consumed_grams" is null and "food_entries"."consumed_milliliters" is not null)),
	CONSTRAINT "food_entries_calorie_snapshot_non_negative" CHECK ("food_entries"."calorie_snapshot" >= 0)
);
--> statement-breakpoint
CREATE TABLE "food_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"language_code" text,
	CONSTRAINT "food_aliases_food_id_normalized_alias_unique" UNIQUE("food_id","normalized_alias")
);
--> statement-breakpoint
CREATE TABLE "food_external_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"external_id" text NOT NULL,
	"dataset_type" text,
	"provider_updated_at" timestamp with time zone,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verification_state" text NOT NULL,
	"original_serving_reference" jsonb,
	"license_category" text,
	CONSTRAINT "food_external_sources_provider_external_id_unique" UNIQUE("provider","external_id"),
	CONSTRAINT "food_external_sources_verification_state_check" CHECK ("food_external_sources"."verification_state" in ('verified_authoritative', 'verified_manufacturer', 'community', 'user_created', 'unverified'))
);
--> statement-breakpoint
CREATE TABLE "food_nutrients" (
	"food_id" uuid NOT NULL,
	"nutrient_id" uuid NOT NULL,
	"amount" numeric(18, 6) NOT NULL,
	"basis_quantity" numeric(12, 4) DEFAULT '100' NOT NULL,
	"basis_unit" text NOT NULL,
	CONSTRAINT "food_nutrients_food_id_nutrient_id_pk" PRIMARY KEY("food_id","nutrient_id"),
	CONSTRAINT "food_nutrients_amount_non_negative" CHECK ("food_nutrients"."amount" >= 0),
	CONSTRAINT "food_nutrients_basis_quantity_positive" CHECK ("food_nutrients"."basis_quantity" > 0),
	CONSTRAINT "food_nutrients_basis_unit_check" CHECK ("food_nutrients"."basis_unit" in ('g', 'ml'))
);
--> statement-breakpoint
CREATE TABLE "food_servings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"food_id" uuid NOT NULL,
	"serving_name" text NOT NULL,
	"quantity" numeric(12, 4) NOT NULL,
	"unit" text NOT NULL,
	"gram_weight" numeric(12, 4),
	"milliliter_volume" numeric(12, 4),
	"is_default" boolean DEFAULT false NOT NULL,
	"source" text NOT NULL,
	"source_serving_id" text,
	CONSTRAINT "food_servings_quantity_positive" CHECK ("food_servings"."quantity" > 0),
	CONSTRAINT "food_servings_unit_check" CHECK ("food_servings"."unit" in ('serving', 'g', 'ml')),
	CONSTRAINT "food_servings_gram_weight_positive" CHECK ("food_servings"."gram_weight" is null or "food_servings"."gram_weight" > 0),
	CONSTRAINT "food_servings_milliliter_volume_positive" CHECK ("food_servings"."milliliter_volume" is null or "food_servings"."milliliter_volume" > 0),
	CONSTRAINT "food_servings_measurement_present" CHECK ("food_servings"."gram_weight" is not null or "food_servings"."milliliter_volume" is not null)
);
--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"brand" text,
	"description" text,
	"category" text,
	"country_code" text,
	"language_code" text,
	"food_type" text NOT NULL,
	"preparation_state" text,
	"ingredients_text" text,
	"data_quality" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "foods_food_type_check" CHECK ("foods"."food_type" in ('generic', 'whole_food', 'branded', 'prepared', 'restaurant', 'user_created', 'development'))
);
--> statement-breakpoint
CREATE TABLE "nutrient_definitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canonical_name" text NOT NULL,
	"display_name" text NOT NULL,
	"unit" text NOT NULL,
	"nutrient_type" text NOT NULL,
	"usda_nutrient_id" integer,
	"display_order" integer NOT NULL,
	CONSTRAINT "nutrient_definitions_canonical_name_unique" UNIQUE("canonical_name"),
	CONSTRAINT "nutrient_definitions_usda_nutrient_id_unique" UNIQUE("usda_nutrient_id"),
	CONSTRAINT "nutrient_definitions_unit_check" CHECK ("nutrient_definitions"."unit" in ('kcal', 'kJ', 'g', 'mg', 'mcg', 'IU')),
	CONSTRAINT "nutrient_definitions_type_check" CHECK ("nutrient_definitions"."nutrient_type" in ('energy', 'macro', 'vitamin', 'mineral', 'other')),
	CONSTRAINT "nutrient_definitions_display_order_non_negative" CHECK ("nutrient_definitions"."display_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "user_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_type" text NOT NULL,
	"starting_weight_kg" numeric(7, 3) NOT NULL,
	"current_weight_kg" numeric(7, 3) NOT NULL,
	"target_weight_kg" numeric(7, 3) NOT NULL,
	"weekly_rate_kg" numeric(5, 3),
	"activity_level" text NOT NULL,
	"planned_exercise_in_activity" boolean DEFAULT false NOT NULL,
	"equation" text NOT NULL,
	"equation_inputs" jsonb NOT NULL,
	"bmr_kcal" numeric(9, 3) NOT NULL,
	"activity_multiplier" numeric(5, 3) NOT NULL,
	"tdee_kcal" numeric(9, 3) NOT NULL,
	"calorie_adjustment_kcal" numeric(9, 3) NOT NULL,
	"calorie_target_kcal" numeric(9, 3) NOT NULL,
	"protein_target_g" numeric(9, 3) NOT NULL,
	"carbohydrate_target_g" numeric(9, 3) NOT NULL,
	"fat_target_g" numeric(9, 3) NOT NULL,
	"target_mode" text NOT NULL,
	"is_manual_calorie_target" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_goals_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "user_goals_goal_type_check" CHECK ("user_goals"."goal_type" in ('lose', 'maintain', 'gain')),
	CONSTRAINT "user_goals_starting_weight_positive" CHECK ("user_goals"."starting_weight_kg" > 0),
	CONSTRAINT "user_goals_current_weight_positive" CHECK ("user_goals"."current_weight_kg" > 0),
	CONSTRAINT "user_goals_target_weight_positive" CHECK ("user_goals"."target_weight_kg" > 0),
	CONSTRAINT "user_goals_activity_level_check" CHECK ("user_goals"."activity_level" in ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'extremely_active')),
	CONSTRAINT "user_goals_equation_check" CHECK ("user_goals"."equation" in ('mifflin_st_jeor')),
	CONSTRAINT "user_goals_bmr_non_negative" CHECK ("user_goals"."bmr_kcal" >= 0),
	CONSTRAINT "user_goals_activity_multiplier_positive" CHECK ("user_goals"."activity_multiplier" > 0),
	CONSTRAINT "user_goals_tdee_non_negative" CHECK ("user_goals"."tdee_kcal" >= 0),
	CONSTRAINT "user_goals_calorie_target_non_negative" CHECK ("user_goals"."calorie_target_kcal" >= 0),
	CONSTRAINT "user_goals_protein_target_non_negative" CHECK ("user_goals"."protein_target_g" >= 0),
	CONSTRAINT "user_goals_carbohydrate_target_non_negative" CHECK ("user_goals"."carbohydrate_target_g" >= 0),
	CONSTRAINT "user_goals_fat_target_non_negative" CHECK ("user_goals"."fat_target_g" >= 0),
	CONSTRAINT "user_goals_target_mode_check" CHECK ("user_goals"."target_mode" in ('percentage', 'grams'))
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"date_of_birth" date NOT NULL,
	"biological_sex" text NOT NULL,
	"height_cm" numeric(7, 2) NOT NULL,
	"country_code" text NOT NULL,
	"timezone" text NOT NULL,
	"language_code" text DEFAULT 'en' NOT NULL,
	"measurement_system" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_biological_sex_check" CHECK ("user_profiles"."biological_sex" in ('male', 'female', 'unspecified')),
	CONSTRAINT "user_profiles_height_cm_positive" CHECK ("user_profiles"."height_cm" > 0),
	CONSTRAINT "user_profiles_measurement_system_check" CHECK ("user_profiles"."measurement_system" in ('metric', 'imperial'))
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_nutrition_summaries" ADD CONSTRAINT "daily_nutrition_summaries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diary_days" ADD CONSTRAINT "diary_days_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_entries" ADD CONSTRAINT "food_entries_diary_day_id_user_id_diary_days_fk" FOREIGN KEY ("diary_day_id","user_id") REFERENCES "public"."diary_days"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_aliases" ADD CONSTRAINT "food_aliases_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_external_sources" ADD CONSTRAINT "food_external_sources_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_nutrients" ADD CONSTRAINT "food_nutrients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_nutrients" ADD CONSTRAINT "food_nutrients_nutrient_id_nutrient_definitions_id_fk" FOREIGN KEY ("nutrient_id") REFERENCES "public"."nutrient_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_servings" ADD CONSTRAINT "food_servings_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_goals" ADD CONSTRAINT "user_goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "diary_days_user_id_local_date_idx" ON "diary_days" USING btree ("user_id","local_date");--> statement-breakpoint
CREATE INDEX "food_entries_user_id_consumed_at_idx" ON "food_entries" USING btree ("user_id","consumed_at");--> statement-breakpoint
CREATE INDEX "food_aliases_normalized_alias_trgm_idx" ON "food_aliases" USING gin ("normalized_alias" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "food_external_sources_provider_external_id_idx" ON "food_external_sources" USING btree ("provider","external_id");--> statement-breakpoint
CREATE INDEX "food_servings_food_id_idx" ON "food_servings" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "foods_normalized_name_trgm_idx" ON "foods" USING gin ("normalized_name" gin_trgm_ops);
