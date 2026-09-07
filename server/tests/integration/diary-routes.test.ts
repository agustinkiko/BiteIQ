import { randomUUID } from "node:crypto";

import Fastify, { type FastifyRequest } from "fastify";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AuthenticatedUser } from "../../src/auth/types.js";
import { createDb } from "../../src/db/client.js";
import { ApiError, ErrorCode, registerErrorHandler } from "../../src/errors.js";
import { diaryRoutes } from "../../src/modules/diary/routes.js";
import {
  createIntegrationPool,
  integrationDatabaseUrl,
  truncateIntegrationDatabase,
} from "./setup.js";

const userAId = randomUUID();
const userBId = randomUUID();

describe("diary route plugin", () => {
  const db = createDb(integrationDatabaseUrl);
  let app: ReturnType<typeof Fastify>;
  let pool: Pool;
  let foodId: string;
  let servingId: string;

  beforeAll(async () => {
    pool = createIntegrationPool();
    app = Fastify({ logger: false });
    registerErrorHandler(app);
    await app.register(diaryRoutes, { db, resolveUser });
    await app.ready();
  });

  beforeEach(async () => {
    await truncateIntegrationDatabase(pool);
    await insertUserProfile(pool, userAId, "Asia/Manila");
    await insertUserProfile(pool, userBId, "America/New_York");
    ({ foodId, servingId } = await insertChickenFixture(pool));
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await db.$client.end();
  });

  it("requires an authenticated user from the injected resolver", async () => {
    const response = await app.inject({ method: "GET", url: "/api/diary/2026-09-09" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: "AUTH_REQUIRED", message: "Sign in to continue." },
    });
  });

  it("derives ownership, Manila local date, and nutrition on the server", async () => {
    const response = await requestAs(
      userAId,
      "POST",
      "/api/diary/2026-09-09/entries",
      entryInput({ consumedAt: "2026-09-08T16:30:00.000Z" }),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      diary: {
        localDate: "2026-09-09",
        entries: [
          {
            userId: userAId,
            foodNameSnapshot: "Chicken Test Food",
            calorieSnapshot: "247.500000",
            nutrientSnapshot: {
              protein: { amount: "46.500000", unit: "g" },
            },
          },
        ],
        summary: { calorieTotal: "247.500000" },
      },
    });

    const stored = await pool.query<{ user_id: string; local_date: string }>(
      `SELECT e.user_id, d.local_date::text
       FROM food_entries e
       JOIN diary_days d ON d.id = e.diary_day_id`,
    );
    expect(stored.rows).toEqual([{ user_id: userAId, local_date: "2026-09-09" }]);
  });

  it("supports reading, updating, and deleting the authenticated user's entry", async () => {
    const created = await requestAs(
      userAId,
      "POST",
      "/api/diary/2026-09-09/entries",
      entryInput(),
    );
    const entryId = created.json().diary.entries[0].id as string;

    const updated = await requestAs(
      userAId,
      "PATCH",
      `/api/diary/entries/${entryId}`,
      {
        foodId,
        servingId,
        quantity: 3,
        mealType: "dinner",
        consumedAt: "2026-09-08T16:30:00.000Z",
      },
    );
    const read = await requestAs(userAId, "GET", "/api/diary/2026-09-09");
    const deleted = await requestAs(
      userAId,
      "DELETE",
      `/api/diary/entries/${entryId}`,
    );

    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({
      diary: {
        entries: [{ id: entryId, mealType: "dinner", calorieSnapshot: "495.000000" }],
        summary: { calorieTotal: "495.000000" },
      },
    });
    expect(read.json()).toMatchObject({
      diary: { entries: [{ id: entryId }], summary: { calorieTotal: "495.000000" } },
    });
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toMatchObject({
      diary: { entries: [], summary: { calorieTotal: "0.000000" } },
    });
  });

  it("returns the same neutral 404 when User A updates or deletes User B's entry UUID", async () => {
    const created = await requestAs(
      userBId,
      "POST",
      "/api/diary/2026-09-08/entries",
      entryInput({ consumedAt: "2026-09-08T16:30:00.000Z" }),
    );
    const entryId = created.json().diary.entries[0].id as string;

    const updated = await requestAs(
      userAId,
      "PATCH",
      `/api/diary/entries/${entryId}`,
      {
        foodId,
        servingId,
        quantity: 3,
        mealType: "dinner",
        consumedAt: "2026-09-08T16:30:00.000Z",
      },
    );
    const deleted = await requestAs(
      userAId,
      "DELETE",
      `/api/diary/entries/${entryId}`,
    );

    for (const response of [updated, deleted]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({
        error: {
          code: "DIARY_ENTRY_NOT_FOUND",
          message: "Diary entry not found.",
        },
      });
    }
    const stillOwned = await pool.query<{ user_id: string }>(
      "SELECT user_id FROM food_entries WHERE id = $1",
      [entryId],
    );
    expect(stillOwned.rows).toEqual([{ user_id: userBId }]);
  });

  it.each(["2026-02-30", "2026-9-8", "1899-12-31", "2101-01-01"])(
    'rejects invalid or unsupported diary date "%s"',
    async (date) => {
      const response = await requestAs(userAId, "GET", `/api/diary/${date}`);

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
    },
  );

  it.each([
    ["unknown field", { unexpected: true }],
    ["owner", { userId: userBId }],
    ["local date", { localDate: "2026-09-08" }],
    ["food snapshot", { foodNameSnapshot: "Injected food" }],
    ["calorie snapshot", { calorieSnapshot: "1" }],
    ["nutrient snapshot", { nutrientSnapshot: {} }],
  ])("rejects a client-supplied %s", async (_label, extra) => {
    const response = await requestAs(
      userAId,
      "POST",
      "/api/diary/2026-09-09/entries",
      { ...entryInput(), ...extra },
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
  });

  it.each([
    ["zero quantity", { quantity: 0 }],
    ["negative quantity", { quantity: -1 }],
    ["unsupported meal", { mealType: "brunch" }],
  ])("rejects %s", async (_label, patch) => {
    const response = await requestAs(
      userAId,
      "POST",
      "/api/diary/2026-09-09/entries",
      { ...entryInput(), ...patch },
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
  });

  it.each(["0.00001", "1e-4", " 1", "1 ", ".5"])(
    'returns strict INVALID_INPUT for unsafe quantity "%s"',
    async (quantity) => {
      const response = await requestAs(
        userAId,
        "POST",
        "/api/diary/2026-09-09/entries",
        { ...entryInput(), quantity },
      );

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: { code: "INVALID_INPUT" },
      });
    },
  );

  function entryInput(overrides: Record<string, unknown> = {}) {
    return {
      clientId: randomUUID(),
      foodId,
      servingId,
      quantity: 1.5,
      mealType: "lunch",
      consumedAt: "2026-09-08T16:30:00.000Z",
      ...overrides,
    };
  }

  function requestAs(
    userId: string,
    method: "GET" | "POST" | "PATCH" | "DELETE",
    url: string,
    payload?: unknown,
  ) {
    return app.inject({
      method,
      url,
      headers: { "x-test-user": userId },
      ...(payload === undefined ? {} : { payload }),
    });
  }
});

async function resolveUser(request: FastifyRequest): Promise<AuthenticatedUser> {
  const id = request.headers["x-test-user"];
  if (typeof id !== "string") {
    throw new ApiError(401, ErrorCode.AUTH_REQUIRED, "Sign in to continue.");
  }
  return { id, email: `${id}@example.test`, name: id };
}

async function insertUserProfile(
  pool: Pool,
  id: string,
  timezone: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, 'Diary Route User', $2, false, NOW(), NOW())`,
    [id, `${id}@example.test`],
  );
  await pool.query(
    `INSERT INTO user_profiles
       (user_id, display_name, date_of_birth, biological_sex, height_cm,
        country_code, timezone, language_code, measurement_system)
     VALUES ($1, 'Diary Route User', DATE '1990-01-01', 'unspecified', 170,
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
    `INSERT INTO food_servings
       (id, food_id, serving_name, quantity, unit, gram_weight,
        is_default, source, source_serving_id)
     VALUES ($1, $2, '100 g', 100, 'g', 100, true, 'usda', '100g')`,
    [servingId, foodId],
  );
  for (const nutrient of [
    ["calories", "Calories", "kcal", "energy", 0, "165"],
    ["protein", "Protein", "g", "macro", 1, "31"],
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
