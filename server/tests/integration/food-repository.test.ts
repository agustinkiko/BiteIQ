import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createDb } from "../../src/db/client.js";
import { createFoodRepository } from "../../src/modules/foods/repository.js";
import type { ProviderFood } from "../../src/providers/nutrition/types.js";
import {
  createIntegrationPool,
  integrationDatabaseUrl,
  truncateIntegrationDatabase,
} from "./setup.js";

const userAId = randomUUID();
const userBId = randomUUID();

describe("canonical food repository", () => {
  const db = createDb(integrationDatabaseUrl);
  const repository = createFoodRepository(db);
  let pool: Pool;

  beforeAll(async () => {
    pool = createIntegrationPool();
  });

  beforeEach(async () => {
    await truncateIntegrationDatabase(pool);
    await insertUser(pool, userAId, "food-a@example.test", "PH");
    await insertUser(pool, userBId, "food-b@example.test", "US");
  });

  afterAll(async () => {
    await pool?.end();
    await db.$client.end();
  });

  it("upserts a provider record idempotently and replaces provider-owned nutrition", async () => {
    const first = await repository.upsertProviderFood(providerFood());
    const repeated = await repository.upsertProviderFood(providerFood());
    const changed = await repository.upsertProviderFood(
      providerFood({
        nutrients: {
          protein: { amount: "32.500000", unit: "g" },
        },
        servings: [
          {
            id: "provider-171077-100g",
            name: "100 g",
            quantity: "100.0000",
            unit: "g",
            gramWeight: "100.0000",
            milliliterVolume: null,
            isDefault: true,
            source: "usda",
            sourceServingId: "100g",
          },
        ],
      }),
    );

    expect(repeated.id).toBe(first.id);
    expect(changed.id).toBe(first.id);
    expect(changed.name).toBe("Chicken breast, cooked");
    expect(changed.normalizedName).toBe("chicken breast, cooked");
    expect(changed.calories).toBe("165.000000");
    expect(changed.nutrients).toEqual({
      protein: { amount: "32.500000", unit: "g" },
    });
    expect(changed.servings).toEqual([
      expect.objectContaining({
        name: "100 g",
        source: "usda",
        sourceServingId: "100g",
      }),
    ]);
    expect(changed.source).toMatchObject({
      provider: "usda",
      externalId: "171077",
      datasetType: "Foundation",
      verificationState: "verified_authoritative",
      attribution: "USDA FoodData Central",
    });

    const counts = await pool.query<{
      foods: string;
      sources: string;
      nutrients: string;
      servings: string;
    }>(`
      SELECT
        (SELECT count(*) FROM foods)::text AS foods,
        (SELECT count(*) FROM food_external_sources)::text AS sources,
        (SELECT count(*) FROM food_nutrients)::text AS nutrients,
        (SELECT count(*) FROM food_servings)::text AS servings
    `);
    expect(counts.rows[0]).toEqual({
      foods: "1",
      sources: "1",
      nutrients: "2",
      servings: "1",
    });
  });

  it("normalizes Unicode and whitespace when matching names and aliases", async () => {
    const food = await repository.upsertProviderFood(providerFood());
    await pool.query(
      `INSERT INTO food_aliases (food_id, alias, normalized_alias, language_code)
       VALUES ($1, 'chiken breast', 'chiken breast', 'en')`,
      [food.id],
    );

    const results = await repository.searchLocalFoods(
      userAId,
      "  CHIKEN\u3000BREAST  ",
      10,
    );

    expect(results.map((result) => result.id)).toEqual([food.id]);
    expect(results[0]).toMatchObject({
      name: "Chicken breast, cooked",
      brand: "Test Foods",
      preparationState: "cooked",
      dataQuality: "verified_authoritative",
      verified: true,
      nutrients: {
        protein: { amount: "31.000000", unit: "g" },
        fat: { amount: "3.600000", unit: "g" },
      },
    });
    expect(results[0]?.servings).toHaveLength(2);
  });

  it("rolls back a food upsert instead of changing a canonical nutrient unit", async () => {
    await repository.upsertProviderFood(providerFood());

    await expect(
      repository.upsertProviderFood(
        providerFood({
          externalId: "bad-unit",
          nutrients: { protein: { amount: "31.000000", unit: "mg" } },
        }),
      ),
    ).rejects.toThrow("NUTRIENT_DEFINITION_MISMATCH");

    const stored = await pool.query<{
      foodCount: string;
      proteinUnit: string;
    }>(`
      SELECT
        (SELECT count(*) FROM foods)::text AS "foodCount",
        (SELECT unit FROM nutrient_definitions
         WHERE canonical_name = 'protein') AS "proteinUnit"
    `);
    expect(stored.rows[0]).toEqual({ foodCount: "1", proteinUnit: "g" });
  });

  it("ranks exact name, prefix, country, quality, recency, then frequency", async () => {
    const exact = await insertCanonicalFood(pool, {
      name: "apple",
      countryCode: "US",
      dataQuality: "unverified",
    });
    const prefix = await insertCanonicalFood(pool, {
      name: "apple pie",
      countryCode: "US",
      dataQuality: "unverified",
    });
    await recordUse(pool, userAId, prefix, "2026-09-08T00:00:00.000Z", 3);

    expect(
      (await repository.searchLocalFoods(userAId, "apple", 10)).map(
        (food) => food.id,
      ),
    ).toEqual([exact, prefix]);

    await truncateFoodsOnly(pool);
    const namePrefix = await insertCanonicalFood(pool, {
      name: "chiken breast plate",
      countryCode: "PH",
      dataQuality: "unverified",
    });
    const exactAlias = await insertCanonicalFood(pool, {
      name: "poultry serving",
      countryCode: "PH",
      dataQuality: "verified_authoritative",
    });
    await insertAlias(pool, exactAlias, "chiken breast");

    expect(
      (await repository.searchLocalFoods(userAId, "chiken breast", 10)).map(
        (food) => food.id,
      ),
    ).toEqual([namePrefix, exactAlias]);

    await truncateFoodsOnly(pool);
    const aliasSimilarity = await insertCanonicalFood(pool, {
      name: "poultry serving",
      countryCode: "US",
      dataQuality: "unverified",
    });
    await insertAlias(pool, aliasSimilarity, "chiken breast");
    const countryMatch = await insertCanonicalFood(pool, {
      name: "breast chicken plate",
      countryCode: "PH",
      dataQuality: "verified_authoritative",
    });

    expect(
      (await repository.searchLocalFoods(userAId, "chiken breast", 10)).map(
        (food) => food.id,
      ),
    ).toEqual([aliasSimilarity, countryMatch]);

    await truncateFoodsOnly(pool);
    const country = await insertCanonicalFood(pool, {
      name: "fresh apple",
      countryCode: "PH",
      dataQuality: "unverified",
    });
    const quality = await insertCanonicalFood(pool, {
      name: "fresh apple",
      countryCode: "US",
      dataQuality: "verified_authoritative",
    });
    await recordUse(pool, userAId, quality, "2026-09-08T00:00:00.000Z", 3);

    expect(
      (await repository.searchLocalFoods(userAId, "fresh", 10)).map(
        (food) => food.id,
      ),
    ).toEqual([country, quality]);

    await truncateFoodsOnly(pool);
    const authoritative = await insertCanonicalFood(pool, {
      name: "green apple",
      countryCode: "PH",
      dataQuality: "verified_authoritative",
    });
    const recent = await insertCanonicalFood(pool, {
      name: "green apple",
      countryCode: "PH",
      dataQuality: "unverified",
    });
    await recordUse(pool, userAId, recent, "2026-09-08T00:00:00.000Z", 3);

    expect(
      (await repository.searchLocalFoods(userAId, "green", 10)).map(
        (food) => food.id,
      ),
    ).toEqual([authoritative, recent]);

    await truncateFoodsOnly(pool);
    const newest = await insertCanonicalFood(pool, {
      name: "red apple",
      countryCode: "PH",
      dataQuality: "community",
    });
    const frequent = await insertCanonicalFood(pool, {
      name: "red apple",
      countryCode: "PH",
      dataQuality: "community",
    });
    await recordUse(pool, userAId, newest, "2026-09-08T00:00:00.000Z", 1);
    await recordUse(pool, userAId, frequent, "2026-09-07T00:00:00.000Z", 4);

    expect(
      (await repository.searchLocalFoods(userAId, "red", 10)).map(
        (food) => food.id,
      ),
    ).toEqual([newest, frequent]);

    await truncateFoodsOnly(pool);
    const many = await insertCanonicalFood(pool, {
      name: "yellow apple",
      countryCode: "PH",
      dataQuality: "community",
    });
    const few = await insertCanonicalFood(pool, {
      name: "yellow apple",
      countryCode: "PH",
      dataQuality: "community",
    });
    await recordUse(pool, userAId, many, "2026-09-08T00:00:00.000Z", 4);
    await recordUse(pool, userAId, few, "2026-09-08T00:00:00.000Z", 1);

    expect(
      (await repository.searchLocalFoods(userAId, "yellow", 10)).map(
        (food) => food.id,
      ),
    ).toEqual([many, few]);
  });

  it("keeps recent and frequent ranking private to each user", async () => {
    const first = await insertCanonicalFood(pool, {
      name: "plain rice",
      countryCode: null,
      dataQuality: "community",
    });
    const second = await insertCanonicalFood(pool, {
      name: "plain rice",
      countryCode: null,
      dataQuality: "community",
    });
    await recordUse(pool, userAId, first, "2026-09-08T00:00:00.000Z", 2);
    await recordUse(pool, userBId, second, "2026-09-08T00:00:00.000Z", 3);

    expect(
      (await repository.searchLocalFoods(userAId, "plain", 10)).map(
        (food) => food.id,
      ),
    ).toEqual([first, second]);
    expect(
      (await repository.searchLocalFoods(userBId, "plain", 10)).map(
        (food) => food.id,
      ),
    ).toEqual([second, first]);
  });

  it("returns the authenticated user's recent suggestions for a short query", async () => {
    const used = await insertCanonicalFood(pool, {
      name: "Recent soup",
      countryCode: "PH",
      dataQuality: "community",
    });
    await insertCanonicalFood(pool, {
      name: "Unused soup",
      countryCode: "PH",
      dataQuality: "verified_authoritative",
    });
    await recordUse(pool, userAId, used, "2026-09-08T00:00:00.000Z", 1);

    const results = await repository.searchLocalFoods(userAId, "s", 10);

    expect(results.map((food) => food.id)).toEqual([used]);
  });
});

function providerFood(
  overrides: Partial<ProviderFood> = {},
): ProviderFood {
  return {
    provider: "usda",
    externalId: "171077",
    dataType: "Foundation",
    name: "  Chicken\u3000breast,   cooked  ",
    brand: "  Test   Foods  ",
    description: "  Cooked   chicken  ",
    category: " Poultry ",
    foodType: "generic",
    preparationState: " cooked ",
    ingredientsText: null,
    verificationState: "verified_authoritative",
    sourceUpdatedAt: "2019-04-01",
    attribution: "USDA FoodData Central",
    calories: "165.000000",
    basisQuantity: "100.0000",
    basisUnit: "g",
    nutrients: {
      protein: { amount: "31.000000", unit: "g" },
      fat: { amount: "3.600000", unit: "g" },
    },
    servings: [
      {
        id: "provider-171077-breast",
        name: "1 breast",
        quantity: "1.0000",
        unit: "serving",
        gramWeight: "172.0000",
        milliliterVolume: null,
        isDefault: true,
        source: "usda",
        sourceServingId: "breast",
      },
      {
        id: "provider-171077-100g",
        name: "100 g",
        quantity: "100.0000",
        unit: "g",
        gramWeight: "100.0000",
        milliliterVolume: null,
        isDefault: false,
        source: "usda",
        sourceServingId: "100g",
      },
    ],
    ...overrides,
  };
}

async function insertUser(
  pool: Pool,
  id: string,
  email: string,
  countryCode: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, false, NOW(), NOW())`,
    [id, email, email],
  );
  await pool.query(
    `INSERT INTO user_profiles
       (user_id, display_name, date_of_birth, biological_sex, height_cm,
        country_code, timezone, language_code, measurement_system)
     VALUES ($1, $2, DATE '1990-01-01', 'unspecified', 170,
             $3, 'Asia/Manila', 'en', 'metric')`,
    [id, email, countryCode],
  );
}

async function insertCanonicalFood(
  pool: Pool,
  input: {
    name: string;
    countryCode: string | null;
    dataQuality: string;
  },
): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO foods
       (id, name, normalized_name, country_code, food_type, data_quality,
        verified, created_at, updated_at)
     VALUES ($1, $2, lower($2), $3, 'generic', $4,
             $4 LIKE 'verified_%', NOW(), NOW())`,
    [id, input.name, input.countryCode, input.dataQuality],
  );
  return id;
}

async function recordUse(
  pool: Pool,
  userId: string,
  foodId: string,
  consumedAt: string,
  count: number,
): Promise<void> {
  const day = await pool.query<{ id: string }>(
    `INSERT INTO diary_days (id, user_id, local_date, goal_snapshot)
     VALUES ($1, $2, DATE '2026-09-08', '{}'::jsonb)
     ON CONFLICT (user_id, local_date)
     DO UPDATE SET updated_at = diary_days.updated_at
     RETURNING id`,
    [randomUUID(), userId],
  );
  const dayId = day.rows[0]!.id;
  for (let index = 0; index < count; index += 1) {
    await pool.query(
      `INSERT INTO food_entries
         (id, client_id, diary_day_id, user_id, meal_type, food_id,
          food_name_snapshot, source_snapshot, serving_snapshot, quantity,
          consumed_grams, calorie_snapshot, nutrient_snapshot, consumed_at)
       VALUES ($1, $2, $3, $4, 'snack', $5, 'snapshot', '{}'::jsonb,
               '{}'::jsonb, 1, 100, 1, '{}'::jsonb, $6::timestamptz)`,
      [randomUUID(), randomUUID(), dayId, userId, foodId, consumedAt],
    );
  }
}

async function insertAlias(
  pool: Pool,
  foodId: string,
  alias: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO food_aliases (food_id, alias, normalized_alias, language_code)
     VALUES ($1, $2, lower($2), 'en')`,
    [foodId, alias],
  );
}

async function truncateFoodsOnly(pool: Pool): Promise<void> {
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
      nutrient_definitions
    CASCADE
  `);
}
