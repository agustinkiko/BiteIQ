import { randomUUID } from "node:crypto";

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../../src/app.js";
import type { BiteIqAuth } from "../../src/auth/auth.js";
import { createDb } from "../../src/db/client.js";
import type {
  NutritionProviderRegistry,
  ProviderFood,
} from "../../src/providers/nutrition/types.js";
import {
  createIntegrationPool,
  integrationDatabaseUrl,
  truncateIntegrationDatabase,
} from "./setup.js";

const userId = randomUUID();
const searchProviderFoods = vi.fn(async (): Promise<ProviderFood[]> => []);

describe("shared Fastify application", () => {
  const db = createDb(integrationDatabaseUrl);
  const checkDatabaseHealth = vi.fn(async () => undefined);
  let pool: Pool;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pool = createIntegrationPool();
    app = await buildApp({
      logger: false,
      db,
      auth: testAuth(),
      nutritionProviders: sentinelNutritionRegistry(),
      checkDatabaseHealth,
    });
    await app.ready();
  });

  beforeEach(async () => {
    checkDatabaseHealth.mockClear();
    searchProviderFoods.mockClear();
    await truncateIntegrationDatabase(pool);
    await pool.query(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
       VALUES ($1, 'Shared App User', 'shared-app@example.test', false, NOW(), NOW())`,
      [userId],
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await db.$client.end();
  });

  it("mounts authenticated goals, foods, and diary routes with health routes", async () => {
    const headers = { cookie: "biteiq-test-session=valid" };
    const [live, ready, goals, foods, diary] = await Promise.all([
      app.inject({ method: "GET", url: "/api/health/live" }),
      app.inject({ method: "GET", url: "/api/health/ready" }),
      app.inject({ method: "GET", url: "/api/goals", headers }),
      app.inject({
        method: "GET",
        url: "/api/foods/search?q=sentinel-food&limit=1",
        headers,
      }),
      app.inject({ method: "GET", url: "/api/diary/2026-09-08", headers }),
    ]);

    expect(live.statusCode).toBe(200);
    expect(live.json()).toEqual({ status: "ok" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: "ready" });
    expect(checkDatabaseHealth).toHaveBeenCalledOnce();
    expect(goals.statusCode).toBe(200);
    expect(goals.json()).toEqual({ goal: null });
    expect(foods.statusCode).toBe(200);
    expect(foods.json()).toEqual({ foods: [], warnings: [] });
    expect(searchProviderFoods).toHaveBeenCalledWith({
      query: "sentinel-food",
      limit: 1,
    });
    expect(diary.statusCode).toBe(200);
    expect(diary.json()).toEqual({
      diary: {
        localDate: "2026-09-08",
        entries: [],
        summary: {
          calorieTotal: "0.000000",
          nutrientTotals: {},
          goalSnapshot: {},
        },
      },
    });
  });

  it("keeps application routes private while health routes stay public", async () => {
    const [goals, foods, diary, live] = await Promise.all([
      app.inject({ method: "GET", url: "/api/goals" }),
      app.inject({ method: "GET", url: "/api/foods/search?q=x" }),
      app.inject({ method: "GET", url: "/api/diary/2026-09-08" }),
      app.inject({ method: "GET", url: "/api/health/live" }),
    ]);

    for (const response of [goals, foods, diary]) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: "AUTH_REQUIRED", message: "Sign in to continue." },
      });
    }
    expect(live.statusCode).toBe(200);
  });
});

function testAuth(): BiteIqAuth {
  return {
    api: {
      getSession: vi.fn(async ({ headers }: { headers: Headers }) =>
        headers.get("cookie") === "biteiq-test-session=valid"
          ? {
              session: { id: "test-session" },
              user: {
                id: userId,
                email: "shared-app@example.test",
                name: "Shared App User",
              },
            }
          : null,
      ),
    },
    handler: vi.fn(),
  } as unknown as BiteIqAuth;
}

function sentinelNutritionRegistry(): NutritionProviderRegistry {
  const provider = {
    id: "usda",
    searchFoods: searchProviderFoods,
    getFood: async () => null,
    lookupBarcode: async () => null,
    providerMetadata: () => ({
      id: "usda",
      displayName: "Sentinel nutrition provider",
      attribution: "Test fixture",
    }),
  };

  return {
    get: (id) => (id === provider.id ? provider : undefined),
    list: () => [provider],
  };
}
