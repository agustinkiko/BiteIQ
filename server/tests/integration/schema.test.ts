import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createIntegrationPool,
  truncateIntegrationDatabase,
} from "./setup.js";

describe("normalized nutrition database constraints", () => {
  let pool: Pool;

  beforeAll(() => {
    pool = createIntegrationPool();
  });

  beforeEach(async () => {
    await truncateIntegrationDatabase(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("keeps the same local diary date independent for each user", async () => {
    const firstUserId = await insertUser(pool, "first@example.test");
    const secondUserId = await insertUser(pool, "second@example.test");

    await pool.query(
      `INSERT INTO diary_days (id, user_id, local_date, goal_snapshot)
       VALUES ($1, $2, DATE '2026-09-08', '{}'::jsonb),
              ($3, $4, DATE '2026-09-08', '{}'::jsonb)`,
      [randomUUID(), firstUserId, randomUUID(), secondUserId],
    );

    const result = await pool.query<{ user_id: string }>(
      `SELECT user_id
       FROM diary_days
       WHERE local_date = DATE '2026-09-08'
       ORDER BY user_id`,
    );

    expect(result.rows.map((row) => row.user_id).sort()).toEqual(
      [firstUserId, secondUserId].sort(),
    );
  });

  it("rejects a duplicate provider external identifier", async () => {
    const foodId = await insertFood(pool);

    await pool.query(
      `INSERT INTO food_external_sources
         (id, food_id, provider, external_id, imported_at, verification_state)
       VALUES ($1, $2, 'usda', '12345', NOW(), 'verified_authoritative')`,
      [randomUUID(), foodId],
    );

    await expect(
      pool.query(
        `INSERT INTO food_external_sources
           (id, food_id, provider, external_id, imported_at, verification_state)
         VALUES ($1, $2, 'usda', '12345', NOW(), 'verified_authoritative')`,
        [randomUUID(), foodId],
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("rejects a negative nutrient amount", async () => {
    const foodId = await insertFood(pool);
    const nutrientId = randomUUID();

    await pool.query(
      `INSERT INTO nutrient_definitions
         (id, canonical_name, display_name, unit, nutrient_type, display_order)
       VALUES ($1, 'protein', 'Protein', 'g', 'macro', 1)`,
      [nutrientId],
    );

    await expect(
      pool.query(
        `INSERT INTO food_nutrients
           (food_id, nutrient_id, amount, basis_quantity, basis_unit)
         VALUES ($1, $2, -0.000001, 100, 'g')`,
        [foodId, nutrientId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("rejects an entry whose owner differs from the diary day owner", async () => {
    const diaryOwnerId = await insertUser(pool, "diary-owner@example.test");
    const otherUserId = await insertUser(pool, "other-user@example.test");
    const diaryDayId = randomUUID();

    await pool.query(
      `INSERT INTO diary_days (id, user_id, local_date, goal_snapshot)
       VALUES ($1, $2, DATE '2026-09-08', '{}'::jsonb)`,
      [diaryDayId, diaryOwnerId],
    );

    await expect(
      pool.query(
        `INSERT INTO food_entries
           (id, client_id, diary_day_id, user_id, meal_type,
            food_name_snapshot, source_snapshot, serving_snapshot, quantity,
            consumed_grams, calorie_snapshot, nutrient_snapshot, consumed_at)
         VALUES
           ($1, $2, $3, $4, 'lunch',
            'Chicken Test Food', '{}'::jsonb, '{}'::jsonb, 1,
            150, 247.5, '{}'::jsonb, NOW())`,
        [randomUUID(), randomUUID(), diaryDayId, otherUserId],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("provides the normalized food-name trigram search index", async () => {
    const result = await pool.query<{ indexdef: string }>(
      `SELECT indexdef
       FROM pg_indexes
       WHERE schemaname = 'public'
         AND tablename = 'foods'
         AND indexname = 'foods_normalized_name_trgm_idx'`,
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.indexdef).toMatch(/USING gin/i);
    expect(result.rows[0]?.indexdef).toMatch(/normalized_name gin_trgm_ops/i);
  });
});

async function insertUser(pool: Pool, email: string): Promise<string> {
  const id = randomUUID();

  await pool.query(
    `INSERT INTO "user"
       (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, 'Schema Test User', $2, false, NOW(), NOW())`,
    [id, email],
  );

  return id;
}

async function insertFood(pool: Pool): Promise<string> {
  const id = randomUUID();

  await pool.query(
    `INSERT INTO foods
       (id, name, normalized_name, food_type, data_quality, created_at, updated_at)
     VALUES
       ($1, 'Chicken Test Food', 'chicken test food', 'whole_food',
        'authoritative', NOW(), NOW())`,
    [id],
  );

  return id;
}
