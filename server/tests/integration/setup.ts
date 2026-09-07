import { Pool } from "pg";

export const integrationDatabaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://biteiq:biteiq@127.0.0.1:55432/biteiq";

export function createIntegrationPool(): Pool {
  return new Pool({ connectionString: integrationDatabaseUrl });
}

export async function truncateIntegrationDatabase(pool: Pool): Promise<void> {
  await pool.query(`
    TRUNCATE TABLE
      daily_nutrition_summaries,
      food_entries,
      diary_days,
      food_external_sources,
      food_nutrients,
      food_servings,
      food_aliases,
      foods,
      nutrient_definitions,
      user_goals,
      user_profiles,
      verification,
      account,
      session,
      "user"
    RESTART IDENTITY CASCADE
  `);
}
