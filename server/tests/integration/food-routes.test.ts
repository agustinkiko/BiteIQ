import { randomUUID } from "node:crypto";

import Fastify from "fastify";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { setAuthenticatedUser } from "../../src/auth/guard.js";
import { createDb } from "../../src/db/client.js";
import { registerErrorHandler } from "../../src/errors.js";
import { createFoodRepository } from "../../src/modules/foods/repository.js";
import { foodRoutes } from "../../src/modules/foods/routes.js";
import { createDevelopmentNutritionProvider } from "../../src/providers/nutrition/development.js";
import type {
  NutritionProvider,
  NutritionProviderRegistry,
  ProviderFood,
} from "../../src/providers/nutrition/types.js";
import {
  createIntegrationPool,
  integrationDatabaseUrl,
  truncateIntegrationDatabase,
} from "./setup.js";

const userId = randomUUID();

describe("food route plugin", () => {
  const db = createDb(integrationDatabaseUrl);
  const repository = createFoodRepository(db);
  let pool: Pool;

  beforeAll(() => {
    pool = createIntegrationPool();
  });

  beforeEach(async () => {
    await truncateIntegrationDatabase(pool);
    await insertUser(pool, userId);
  });

  afterAll(async () => {
    await pool?.end();
    await db.$client.end();
  });

  it("requires an authenticated session", async () => {
    const app = await buildFoodApp(registry());

    const response = await app.inject({
      method: "GET",
      url: "/api/foods/search?q=chicken&limit=10",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: "AUTH_REQUIRED", message: "Sign in to continue." },
    });
    await app.close();
  });

  it("returns recent suggestions for a short query without calling USDA", async () => {
    const recent = await repository.upsertProviderFood(
      providerFood({ externalId: "recent", name: "Recent chicken" }),
    );
    await recordUse(pool, userId, recent.id);
    const app = await buildFoodApp(
      registry(providerThatMustNotSearch("short queries must stay local")),
    );

    const response = await search(app, "c", 10);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      foods: [{ id: recent.id, name: "Recent chicken" }],
      warnings: [],
    });
    await app.close();
  });

  it("skips USDA when local results fill the requested limit", async () => {
    const local = await repository.upsertProviderFood(
      providerFood({ externalId: "local", name: "Chicken local" }),
    );
    const app = await buildFoodApp(
      registry(providerThatMustNotSearch("sufficient local results must win")),
    );

    const response = await search(app, "chicken", 1);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      foods: [{ id: local.id }],
      warnings: [],
    });
    await app.close();
  });

  it("prefers USDA when local results are insufficient and both providers are available", async () => {
    const provider = providerReturning([
      providerFood({
        externalId: "remote",
        name: "Chicken remote",
        brand: "Remote Brand",
      }),
    ]);
    const app = await buildFoodApp(
      registry(
        provider,
        createDevelopmentNutritionProvider({ nodeEnv: "development" }),
      ),
    );

    const response = await search(app, "chicken", 2);
    const body = response.json();

    expect(response.statusCode).toBe(200);
    expect(body.warnings).toEqual([]);
    expect(body.foods).toEqual([
      expect.objectContaining({
        name: "Chicken remote",
        brand: "Remote Brand",
        preparationState: "cooked",
        dataQuality: "verified_authoritative",
        verified: true,
        calories: "165.000000",
        nutrients: {
          protein: { amount: "31.000000", unit: "g" },
          fat: { amount: "3.600000", unit: "g" },
        },
        source: expect.objectContaining({
          provider: "usda",
          externalId: "remote",
          datasetType: "Foundation",
          providerUpdatedAt: "2019-04-01T00:00:00.000Z",
          importedAt: expect.any(String),
          verificationState: "verified_authoritative",
          attribution: "USDA FoodData Central",
          licenseCategory: null,
        }),
        servings: [
          expect.objectContaining({
            name: "1 breast",
            quantity: "1.0000",
            unit: "serving",
            gramWeight: "172.0000",
            milliliterVolume: null,
            isDefault: true,
            source: "usda",
            sourceServingId: "breast",
          }),
          expect.objectContaining({
            name: "100 g",
            quantity: "100.0000",
            unit: "g",
            gramWeight: "100.0000",
            milliliterVolume: null,
            isDefault: false,
            source: "usda",
            sourceServingId: "100g",
          }),
        ],
      }),
    ]);

    const persisted = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM food_external_sources
       WHERE provider = 'usda' AND external_id = 'remote'`,
    );
    expect(persisted.rows[0]?.count).toBe("1");
    await app.close();
  });

  it("fetches, persists, and returns development food when USDA is unavailable", async () => {
    const app = await buildFoodApp(
      registry(createDevelopmentNutritionProvider({ nodeEnv: "development" })),
    );

    const response = await search(app, "chicken", 2);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      foods: [
        {
          name: "Chicken Test Food",
          source: {
            provider: "development",
            externalId: "chicken-test-food",
            attribution: "BiteIQ deterministic development data",
          },
        },
      ],
      warnings: [],
    });
    const persisted = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM food_external_sources
       WHERE provider = 'development' AND external_id = 'chicken-test-food'`,
    );
    expect(persisted.rows[0]?.count).toBe("1");
    await app.close();
  });

  it("returns local results plus a safe warning when USDA times out", async () => {
    const local = await repository.upsertProviderFood(
      providerFood({ externalId: "local-oats", name: "Oatmeal local" }),
    );
    const app = await buildFoodApp(
      registry(
        providerReturning([], new Error("NUTRITION_PROVIDER_TIMEOUT")),
      ),
    );

    const response = await search(app, "oatmeal", 2);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      foods: [{ id: local.id }],
      warnings: [
        {
          code: "NUTRITION_PROVIDER_UNAVAILABLE",
          provider: "usda",
          message: "The nutrition database is unavailable. Try again.",
        },
      ],
    });
    expect(response.body).not.toContain("TIMEOUT");
    await app.close();
  });

  it.each([
    {
      label: "timeout",
      providerError: "NUTRITION_PROVIDER_TIMEOUT: private socket detail",
    },
    {
      label: "server failure",
      providerError: "NUTRITION_PROVIDER_UNAVAILABLE: private upstream detail",
    },
  ])(
    "returns an empty successful search plus a safe warning after a USDA $label",
    async ({ providerError }) => {
      const app = await buildFoodApp(
        registry(providerReturning([], new Error(providerError))),
      );

      const response = await search(app, "lentils", 2);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        foods: [],
        warnings: [
          {
            code: "NUTRITION_PROVIDER_UNAVAILABLE",
            provider: "usda",
            message: "The nutrition database is unavailable. Try again.",
          },
        ],
      });
      expect(response.body).not.toContain("private");
      await app.close();
    },
  );

  it("returns FOOD_NOT_FOUND for missing and disabled canonical foods", async () => {
    const food = await repository.upsertProviderFood(providerFood());
    const app = await buildFoodApp(registry());

    const missing = await requestAsUser(
      app,
      `/api/foods/${randomUUID()}`,
    );
    await pool.query("UPDATE foods SET disabled_at = NOW() WHERE id = $1", [
      food.id,
    ]);
    const disabled = await requestAsUser(app, `/api/foods/${food.id}`);

    for (const response of [missing, disabled]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: "FOOD_NOT_FOUND",
          message: "That food is no longer available. Search again.",
        },
      });
    }
    await app.close();
  });

  it("returns full canonical food detail", async () => {
    const food = await repository.upsertProviderFood(providerFood());
    const app = await buildFoodApp(registry());

    const response = await requestAsUser(app, `/api/foods/${food.id}`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      food: expect.objectContaining({
        id: food.id,
        name: "Chicken breast, cooked",
        normalizedName: "chicken breast, cooked",
        brand: "Test Brand",
        description: "Cooked chicken breast",
        category: "Poultry",
        countryCode: null,
        languageCode: null,
        foodType: "generic",
        preparationState: "cooked",
        ingredientsText: null,
        dataQuality: "verified_authoritative",
        verified: true,
        calories: "165.000000",
        basisQuantity: "100.0000",
        basisUnit: "g",
        nutrients: {
          protein: { amount: "31.000000", unit: "g" },
          fat: { amount: "3.600000", unit: "g" },
        },
        source: {
          provider: "usda",
          externalId: "171077",
          datasetType: "Foundation",
          providerUpdatedAt: "2019-04-01T00:00:00.000Z",
          importedAt: expect.any(String),
          verificationState: "verified_authoritative",
          attribution: "USDA FoodData Central",
          licenseCategory: null,
        },
        servings: [
          expect.objectContaining({
            name: "1 breast",
            quantity: "1.0000",
            unit: "serving",
            gramWeight: "172.0000",
            milliliterVolume: null,
            isDefault: true,
            source: "usda",
            sourceServingId: "breast",
          }),
          expect.objectContaining({
            name: "100 g",
            quantity: "100.0000",
            unit: "g",
            gramWeight: "100.0000",
            milliliterVolume: null,
            isDefault: false,
            source: "usda",
            sourceServingId: "100g",
          }),
        ],
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      }),
    });
    await app.close();
  });

  it.each([0, 51, 1.5, "many"])('rejects invalid limit "$limit"', async (limit) => {
    const app = await buildFoodApp(registry());

    const response = await requestAsUser(
      app,
      `/api/foods/search?q=chicken&limit=${limit}`,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
    await app.close();
  });

  it("rejects unknown search query fields", async () => {
    const app = await buildFoodApp(registry());

    const response = await requestAsUser(
      app,
      "/api/foods/search?q=chicken&limit=10&provider=usda",
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
    await app.close();
  });

  async function buildFoodApp(providers: NutritionProviderRegistry) {
    const app = Fastify({ logger: false });
    registerErrorHandler(app);
    app.addHook("preHandler", async (request) => {
      if (request.headers["x-test-user"] === userId) {
        setAuthenticatedUser(request, {
          id: userId,
          email: "food-route@example.test",
          name: "Food Route User",
        });
      }
    });
    await app.register(foodRoutes, { db, providers });
    await app.ready();
    return app;
  }
});

function search(app: Awaited<ReturnType<typeof Fastify>>, query: string, limit: number) {
  return requestAsUser(
    app,
    `/api/foods/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );
}

function requestAsUser(
  app: Awaited<ReturnType<typeof Fastify>>,
  url: string,
) {
  return app.inject({
    method: "GET",
    url,
    headers: { "x-test-user": userId },
  });
}

function registry(...providers: NutritionProvider[]): NutritionProviderRegistry {
  return {
    get(id) {
      return providers.find((provider) => provider.id === id);
    },
    list() {
      return [...providers];
    },
  };
}

function providerReturning(
  results: ProviderFood[],
  error?: Error,
): NutritionProvider {
  return {
    id: "usda",
    async searchFoods() {
      if (error) throw error;
      return structuredClone(results);
    },
    async getFood() {
      return null;
    },
    async lookupBarcode() {
      return null;
    },
    providerMetadata() {
      return {
        id: "usda",
        displayName: "USDA FoodData Central",
        attribution: "U.S. Department of Agriculture",
      };
    },
  };
}

function providerThatMustNotSearch(reason: string): NutritionProvider {
  return providerReturning([], new Error(`UNEXPECTED_PROVIDER_CALL: ${reason}`));
}

function providerFood(overrides: Partial<ProviderFood> = {}): ProviderFood {
  return {
    provider: "usda",
    externalId: "171077",
    dataType: "Foundation",
    name: "Chicken breast, cooked",
    brand: "Test Brand",
    description: "Cooked chicken breast",
    category: "Poultry",
    foodType: "generic",
    preparationState: "cooked",
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
        id: "provider-breast",
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
        id: "provider-100g",
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

async function insertUser(pool: Pool, id: string): Promise<void> {
  await pool.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, 'Food Route User', 'food-route@example.test', false, NOW(), NOW())`,
    [id],
  );
  await pool.query(
    `INSERT INTO user_profiles
       (user_id, display_name, date_of_birth, biological_sex, height_cm,
        country_code, timezone, language_code, measurement_system)
     VALUES ($1, 'Food Route User', DATE '1990-01-01', 'unspecified', 170,
             'PH', 'Asia/Manila', 'en', 'metric')`,
    [id],
  );
}

async function recordUse(pool: Pool, ownerId: string, foodId: string): Promise<void> {
  const dayId = randomUUID();
  await pool.query(
    `INSERT INTO diary_days (id, user_id, local_date, goal_snapshot)
     VALUES ($1, $2, DATE '2026-09-08', '{}'::jsonb)`,
    [dayId, ownerId],
  );
  await pool.query(
    `INSERT INTO food_entries
       (id, client_id, diary_day_id, user_id, meal_type, food_id,
        food_name_snapshot, source_snapshot, serving_snapshot, quantity,
        consumed_grams, calorie_snapshot, nutrient_snapshot, consumed_at)
     VALUES ($1, $2, $3, $4, 'snack', $5, 'snapshot', '{}'::jsonb,
             '{}'::jsonb, 1, 100, 1, '{}'::jsonb, NOW())`,
    [randomUUID(), randomUUID(), dayId, ownerId, foodId],
  );
}
