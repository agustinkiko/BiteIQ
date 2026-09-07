import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "../../src/db/client.js";
import { createDiaryRepository } from "../../src/modules/diary/repository.js";
import {
  createIntegrationPool,
  integrationDatabaseUrl,
  truncateIntegrationDatabase,
} from "./setup.js";

const userId = randomUUID();
const clientId = randomUUID();
const consumedAt = "2026-09-08T16:30:00.000Z";

describe("diary repository", () => {
  const db = createDb(integrationDatabaseUrl);
  const repository = createDiaryRepository(db);
  let pool: Pool;
  let foodId: string;
  let servingId: string;

  beforeAll(() => {
    pool = createIntegrationPool();
  });

  beforeEach(async () => {
    await pool.query("DROP TRIGGER IF EXISTS fail_diary_summary_write ON daily_nutrition_summaries");
    await pool.query("DROP FUNCTION IF EXISTS fail_diary_summary_write()");
    await truncateIntegrationDatabase(pool);
    await insertUserProfile(pool, userId, "Asia/Manila");
    ({ foodId, servingId } = await insertChickenFixture(pool));
  });

  afterAll(async () => {
    await pool?.query("DROP TRIGGER IF EXISTS fail_diary_summary_write ON daily_nutrition_summaries");
    await pool?.query("DROP FUNCTION IF EXISTS fail_diary_summary_write()");
    await pool?.end();
    await db.$client.end();
  });

  it("stores literal food, serving, USDA source, nutrition snapshots, and their daily totals", async () => {
    const day = await repository.createEntry(userId, {
      clientId,
      foodId,
      servingId,
      quantity: "1.5",
      mealType: "lunch",
      consumedAt,
    });

    expect(day.localDate).toBe("2026-09-09");
    expect(day.entries).toHaveLength(1);
    expect(day.entries[0]).toMatchObject({
      clientId,
      userId,
      mealType: "lunch",
      foodId,
      foodNameSnapshot: "Chicken Test Food",
      brandSnapshot: "Fixture Farm",
      sourceSnapshot: {
        provider: "usda",
        externalId: "171077",
        datasetType: "Foundation",
        providerUpdatedAt: "2019-04-01T00:00:00.000Z",
        verificationState: "verified_authoritative",
        attribution: "USDA FoodData Central",
        licenseCategory: "public-domain",
      },
      servingSnapshot: {
        id: servingId,
        name: "100 g",
        quantity: "100.0000",
        unit: "g",
        gramWeight: "100.0000",
        milliliterVolume: null,
        source: "usda",
        sourceServingId: "100g",
      },
      quantity: "1.5000",
      consumedGrams: "150.0000",
      consumedMilliliters: null,
      calorieSnapshot: "247.500000",
      nutrientSnapshot: {
        protein: { amount: "46.500000", unit: "g" },
        carbohydrate: { amount: "0.000000", unit: "g" },
        fat: { amount: "5.400000", unit: "g" },
      },
      consumedAt,
    });
    expect(day.summary).toEqual({
      calorieTotal: "247.500000",
      nutrientTotals: {
        protein: { amount: "46.500000", unit: "g" },
        carbohydrate: { amount: "0.000000", unit: "g" },
        fat: { amount: "5.400000", unit: "g" },
      },
      goalSnapshot: {},
    });
  });

  it("does not rewrite diary history when the canonical food changes", async () => {
    await repository.createEntry(userId, {
      clientId,
      foodId,
      servingId,
      quantity: "1.5",
      mealType: "lunch",
      consumedAt,
    });

    await pool.query("UPDATE foods SET name = 'Changed chicken', brand = 'Changed brand' WHERE id = $1", [foodId]);
    await pool.query(
      `UPDATE food_nutrients
       SET amount = 999
       WHERE food_id = $1`,
      [foodId],
    );

    const day = await repository.getDiary(userId, "2026-09-09");

    expect(day.entries[0]).toMatchObject({
      foodNameSnapshot: "Chicken Test Food",
      brandSnapshot: "Fixture Farm",
      calorieSnapshot: "247.500000",
      nutrientSnapshot: {
        protein: { amount: "46.500000", unit: "g" },
      },
    });
    expect(day.summary.calorieTotal).toBe("247.500000");
    expect(day.summary.nutrientTotals.protein).toEqual({
      amount: "46.500000",
      unit: "g",
    });
  });

  it("returns the original entry for a repeated user and client ID", async () => {
    const first = await repository.createEntry(userId, {
      clientId,
      foodId,
      servingId,
      quantity: "1.5",
      mealType: "lunch",
      consumedAt,
    });
    const retried = await repository.createEntry(userId, {
      clientId,
      foodId,
      servingId,
      quantity: "2",
      mealType: "dinner",
      consumedAt: "2026-09-09T16:30:00.000Z",
    });

    expect(retried).toEqual(first);
    const stored = await pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM food_entries WHERE user_id = $1 AND client_id = $2",
      [userId, clientId],
    );
    expect(stored.rows[0]?.count).toBe("1");
  });

  it("recalculates the entry and summary when quantity doubles", async () => {
    const created = await repository.createEntry(userId, {
      clientId,
      foodId,
      servingId,
      quantity: "1.5",
      mealType: "lunch",
      consumedAt,
    });

    const updated = await repository.updateEntry(userId, created.entries[0]!.id, {
      foodId,
      servingId,
      quantity: "3",
      mealType: "lunch",
      consumedAt,
    });

    expect(updated?.entries[0]).toMatchObject({
      quantity: "3.0000",
      consumedGrams: "300.0000",
      calorieSnapshot: "495.000000",
      nutrientSnapshot: {
        protein: { amount: "93.000000", unit: "g" },
        fat: { amount: "10.800000", unit: "g" },
      },
    });
    expect(updated?.summary).toMatchObject({
      calorieTotal: "495.000000",
      nutrientTotals: {
        protein: { amount: "93.000000", unit: "g" },
        fat: { amount: "10.800000", unit: "g" },
      },
    });
  });

  it("normalizes quantity to the database scale before calculating snapshots", async () => {
    const day = await repository.createEntry(userId, {
      clientId,
      foodId,
      servingId,
      quantity: "1.23456",
      mealType: "lunch",
      consumedAt,
    });

    expect(day.entries[0]).toMatchObject({
      quantity: "1.2346",
      consumedGrams: "123.4600",
      calorieSnapshot: "203.709000",
      nutrientSnapshot: {
        protein: { amount: "38.272600", unit: "g" },
      },
    });
    expect(day.summary).toMatchObject({
      calorieTotal: "203.709000",
      nutrientTotals: {
        protein: { amount: "38.272600", unit: "g" },
      },
    });
  });

  it("deletes the entry and persists zero daily totals", async () => {
    const created = await repository.createEntry(userId, {
      clientId,
      foodId,
      servingId,
      quantity: "1.5",
      mealType: "lunch",
      consumedAt,
    });

    const deleted = await repository.deleteEntry(userId, created.entries[0]!.id);

    expect(deleted).toEqual({
      localDate: "2026-09-09",
      entries: [],
      summary: {
        calorieTotal: "0.000000",
        nutrientTotals: {},
        goalSnapshot: {},
      },
    });
    const stored = await pool.query<{ entries: string; calories: string }>(
      `SELECT
         (SELECT count(*) FROM food_entries WHERE user_id = $1)::text AS entries,
         (SELECT calorie_total FROM daily_nutrition_summaries
          WHERE user_id = $1 AND local_date = DATE '2026-09-09')::text AS calories`,
      [userId],
    );
    expect(stored.rows[0]).toEqual({ entries: "0", calories: "0.000000" });
  });

  it("rolls back the entry mutation when summary persistence fails", async () => {
    await pool.query(`
      CREATE FUNCTION fail_diary_summary_write() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'forced summary failure';
      END;
      $$ LANGUAGE plpgsql
    `);
    await pool.query(`
      CREATE TRIGGER fail_diary_summary_write
      BEFORE INSERT OR UPDATE ON daily_nutrition_summaries
      FOR EACH ROW EXECUTE FUNCTION fail_diary_summary_write()
    `);

    await expect(
      repository.createEntry(userId, {
        clientId,
        foodId,
        servingId,
        quantity: "1.5",
        mealType: "lunch",
        consumedAt,
      }),
    ).rejects.toBeDefined();

    const stored = await pool.query<{ days: string; entries: string }>(
      `SELECT
         (SELECT count(*) FROM diary_days WHERE user_id = $1)::text AS days,
         (SELECT count(*) FROM food_entries WHERE user_id = $1)::text AS entries`,
      [userId],
    );
    expect(stored.rows[0]).toEqual({ days: "0", entries: "0" });
  });

  it("reads entries and their summary from one repeatable snapshot", async () => {
    await repository.createEntry(userId, {
      clientId,
      foodId,
      servingId,
      quantity: "1.5",
      mealType: "lunch",
      consumedAt,
    });
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query(
        "LOCK TABLE daily_nutrition_summaries IN ACCESS EXCLUSIVE MODE",
      );

      const reading = repository.getDiary(userId, "2026-09-09");
      await waitForBlockedSummaryRead(pool);
      await writer.query(
        `UPDATE food_entries
         SET quantity = 3, consumed_grams = 300, calorie_snapshot = 495,
             nutrient_snapshot = $2::jsonb
         WHERE user_id = $1`,
        [
          userId,
          JSON.stringify({
            protein: { amount: "93.000000", unit: "g" },
            carbohydrate: { amount: "0.000000", unit: "g" },
            fat: { amount: "10.800000", unit: "g" },
          }),
        ],
      );
      await writer.query(
        `UPDATE daily_nutrition_summaries
         SET calorie_total = 495, nutrient_totals = $2::jsonb
         WHERE user_id = $1 AND local_date = DATE '2026-09-09'`,
        [
          userId,
          JSON.stringify({
            protein: { amount: "93.000000", unit: "g" },
            carbohydrate: { amount: "0.000000", unit: "g" },
            fat: { amount: "10.800000", unit: "g" },
          }),
        ],
      );
      await writer.query("COMMIT");

      const day = await reading;
      expect(day.entries[0]?.calorieSnapshot).toBe("247.500000");
      expect(day.summary.calorieTotal).toBe("247.500000");
    } finally {
      try {
        await writer.query("ROLLBACK");
      } finally {
        writer.release();
      }
    }
  });
});

async function waitForBlockedSummaryRead(pool: Pool): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    const blocked = await pool.query<{ blocked: boolean }>(`
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND query ILIKE '%daily_nutrition_summaries%'
      ) AS blocked
    `);
    if (blocked.rows[0]?.blocked) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for the summary read to block");
}

async function insertUserProfile(
  pool: Pool,
  id: string,
  timezone: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, 'Diary User', $2, false, NOW(), NOW())`,
    [id, `${id}@example.test`],
  );
  await pool.query(
    `INSERT INTO user_profiles
       (user_id, display_name, date_of_birth, biological_sex, height_cm,
        country_code, timezone, language_code, measurement_system)
     VALUES ($1, 'Diary User', DATE '1990-01-01', 'unspecified', 170,
             'PH', $2, 'en', 'metric')`,
    [id, timezone],
  );
}

async function insertChickenFixture(
  pool: Pool,
): Promise<{ foodId: string; servingId: string }> {
  const foodId = randomUUID();
  const servingId = randomUUID();
  await pool.query(
    `INSERT INTO foods
       (id, name, normalized_name, brand, food_type, data_quality, verified)
     VALUES ($1, 'Chicken Test Food', 'chicken test food', 'Fixture Farm',
             'generic', 'verified_authoritative', true)`,
    [foodId],
  );
  await pool.query(
    `INSERT INTO food_external_sources
       (food_id, provider, external_id, dataset_type, provider_updated_at,
        verification_state, original_serving_reference, license_category)
     VALUES ($1, 'usda', '171077', 'Foundation', '2019-04-01T00:00:00.000Z',
             'verified_authoritative', $2::jsonb, 'public-domain')`,
    [
      foodId,
      JSON.stringify({
        attribution: "USDA FoodData Central",
        basisQuantity: "100.0000",
        basisUnit: "g",
      }),
    ],
  );
  await pool.query(
    `INSERT INTO food_servings
       (id, food_id, serving_name, quantity, unit, gram_weight,
        is_default, source, source_serving_id)
     VALUES ($1, $2, '100 g', 100, 'g', 100, true, 'usda', '100g')`,
    [servingId, foodId],
  );
  for (const nutrient of [
    ["calories", "Calories", "kcal", "energy", 0, "165"],
    ["protein", "Protein", "g", "macro", 1, "31"],
    ["carbohydrate", "Carbohydrate", "g", "macro", 2, "0"],
    ["fat", "Fat", "g", "macro", 3, "3.6"],
  ] as const) {
    const nutrientId = randomUUID();
    await pool.query(
      `INSERT INTO nutrient_definitions
         (id, canonical_name, display_name, unit, nutrient_type, display_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [nutrientId, ...nutrient.slice(0, 5)],
    );
    await pool.query(
      `INSERT INTO food_nutrients
         (food_id, nutrient_id, amount, basis_quantity, basis_unit)
       VALUES ($1, $2, $3, 100, 'g')`,
      [foodId, nutrientId, nutrient[5]],
    );
  }
  return { foodId, servingId };
}
