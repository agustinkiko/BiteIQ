import { randomUUID } from "node:crypto";

import Fastify from "fastify";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { setAuthenticatedUser } from "../../src/auth/guard.js";
import { createDb } from "../../src/db/client.js";
import { registerErrorHandler } from "../../src/errors.js";
import { goalsRoutes } from "../../src/modules/goals/routes.js";
import {
  createIntegrationPool,
  integrationDatabaseUrl,
  truncateIntegrationDatabase,
} from "./setup.js";

const userAId = randomUUID();
const userBId = randomUUID();

const profileA = {
  displayName: "Goal User A",
  dateOfBirth: "1996-06-15",
  biologicalSex: "male",
  heightCm: 180,
  countryCode: "PH",
  timezone: "Asia/Manila",
  languageCode: "en",
  measurementSystem: "metric",
};

const goalA = {
  goalType: "maintain",
  startingWeightKg: 80,
  currentWeightKg: 80,
  targetWeightKg: 80,
  weeklyRateKg: 0,
  activityLevel: "sedentary",
  plannedExerciseInActivity: false,
  targetMode: "percentage",
  macros: { protein: 30, carbohydrate: 40, fat: 30 },
};

describe("goal route plugin", () => {
  const db = createDb(integrationDatabaseUrl);
  let pool: Pool;
  let app: ReturnType<typeof Fastify>;

  beforeAll(async () => {
    pool = createIntegrationPool();
    app = Fastify({ logger: false });
    registerErrorHandler(app);
    app.addHook("preHandler", async (request) => {
      const id = request.headers["x-test-user"];
      if (typeof id === "string") {
        setAuthenticatedUser(request, {
          id,
          email: `${id}@example.test`,
          name: id,
        });
      }
    });
    await app.register(goalsRoutes, {
      db,
      now: () => new Date("2026-09-08T00:00:00.000Z"),
    });
    await app.ready();
  });

  beforeEach(async () => {
    await truncateIntegrationDatabase(pool);
    await insertUser(pool, userAId, "goal-a@example.test");
    await insertUser(pool, userBId, "goal-b@example.test");
    await insertProfile(pool, userBId, "Goal User B");
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await db.$client.end();
  });

  it("requires an injected authenticated user context", async () => {
    const response = await app.inject({ method: "GET", url: "/api/me" });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: "AUTH_REQUIRED", message: "Sign in to continue." },
    });
  });

  it("creates and reads only the authenticated user's profile", async () => {
    const patch = await requestAsUserA("PATCH", "/api/me", profileA);
    const get = await requestAsUserA("GET", "/api/me");

    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({
      profile: { userId: userAId, ...profileA, heightCm: "180.00" },
    });
    expect(get.json()).toMatchObject({
      profile: { userId: userAId, displayName: "Goal User A" },
    });
    expect(get.body).not.toContain("Goal User B");
    expect(get.body).not.toContain(userBId);
  });

  it("rejects profile owner injection and leaves the other user unchanged", async () => {
    const response = await requestAsUserA("PATCH", "/api/me", {
      ...profileA,
      userId: userBId,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
    const other = await pool.query<{ display_name: string }>(
      "SELECT display_name FROM user_profiles WHERE user_id = $1",
      [userBId],
    );
    expect(other.rows[0]?.display_name).toBe("Goal User B");
  });

  it("calculates from the authenticated user's stored profile", async () => {
    await requestAsUserA("PATCH", "/api/me", profileA);

    const response = await requestAsUserA(
      "POST",
      "/api/goals/calculate",
      goalA,
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      calculation: {
        bmrKcal: "1780.000",
        tdeeKcal: "2136.000",
        warnings: [],
      },
    });
  });

  it("persists a complete calculated goal for only the authenticated user", async () => {
    await requestAsUserA("PATCH", "/api/me", profileA);

    const put = await requestAsUserA("PUT", "/api/goals", {
      ...goalA,
      confirmedWarnings: [],
    });
    const get = await requestAsUserA("GET", "/api/goals");

    expect(put.statusCode).toBe(200);
    expect(put.json()).toMatchObject({
      goal: {
        userId: userAId,
        goalType: "maintain",
        bmrKcal: "1780.000",
        tdeeKcal: "2136.000",
        calorieTargetKcal: "2136.000",
        proteinTargetG: "160.200",
        carbohydrateTargetG: "213.600",
        fatTargetG: "71.200",
        warnings: [],
      },
    });
    expect(get.json()).toMatchObject({ goal: { userId: userAId } });
    expect(get.body).not.toContain(userBId);

    const rows = await pool.query<{ user_id: string; equation_inputs: object }>(
      "SELECT user_id, equation_inputs FROM user_goals",
    );
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0]).toMatchObject({
      user_id: userAId,
      equation_inputs: {
        age: 30,
        targetMode: "percentage",
        macros: { protein: 30, carbohydrate: 40, fat: 30 },
      },
    });
  });

  it("rejects goal owner injection and cannot alter another user's goal", async () => {
    await requestAsUserA("PATCH", "/api/me", profileA);
    await insertGoal(pool, userBId);

    const response = await requestAsUserA("PUT", "/api/goals", {
      ...goalA,
      userId: userBId,
      confirmedWarnings: [],
    });

    expect(response.statusCode).toBe(400);
    const other = await pool.query<{ calorie_target_kcal: string }>(
      "SELECT calorie_target_kcal FROM user_goals WHERE user_id = $1",
      [userBId],
    );
    expect(other.rows[0]?.calorie_target_kcal).toBe("1900.000");
  });

  it("requires explicit confirmation before persisting every warning", async () => {
    await requestAsUserA("PATCH", "/api/me", profileA);
    const riskyGoal = {
      ...goalA,
      goalType: "lose",
      weeklyRateKg: -1.1,
      confirmedWarnings: ["EXTREME_RATE"],
    };

    const rejected = await requestAsUserA("PUT", "/api/goals", riskyGoal);
    const accepted = await requestAsUserA("PUT", "/api/goals", {
      ...riskyGoal,
      confirmedWarnings: ["EXTREME_RATE", "LOW_CALORIE_TARGET"],
    });

    expect(rejected.statusCode).toBe(400);
    expect(rejected.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json()).toMatchObject({
      goal: {
        calorieTargetKcal: "926.000",
        warnings: ["EXTREME_RATE", "LOW_CALORIE_TARGET"],
      },
    });
  });

  it("recalculates reference values after a profile change without replacing manual calories", async () => {
    await requestAsUserA("PATCH", "/api/me", profileA);
    await requestAsUserA("PUT", "/api/goals", {
      ...goalA,
      manualCalorieTargetKcal: 2100,
      confirmedWarnings: [],
    });

    await requestAsUserA("PATCH", "/api/me", { heightCm: 170 });
    const response = await requestAsUserA("GET", "/api/goals");

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      goal: {
        bmrKcal: "1717.500",
        tdeeKcal: "2061.000",
        calorieTargetKcal: "2100.000",
        isManualCalorieTarget: true,
      },
    });
  });

  it("rejects invalid profile and goal fields instead of ignoring them", async () => {
    const profileResponse = await requestAsUserA("PATCH", "/api/me", {
      ...profileA,
      timezone: "Mars/Olympus",
    });
    await requestAsUserA("PATCH", "/api/me", profileA);
    const goalResponse = await requestAsUserA("POST", "/api/goals/calculate", {
      ...goalA,
      macros: { protein: 30, carbohydrate: 30, fat: 30 },
      surprise: true,
    });

    expect(profileResponse.statusCode).toBe(400);
    expect(goalResponse.statusCode).toBe(400);
  });

  it("returns invalid input when unspecified sex has no manual calorie target", async () => {
    await requestAsUserA("PATCH", "/api/me", {
      ...profileA,
      biologicalSex: "unspecified",
    });

    const response = await requestAsUserA(
      "POST",
      "/api/goals/calculate",
      goalA,
    );

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { code: "INVALID_INPUT" } });
  });

  function requestAsUserA(
    method: "GET" | "PATCH" | "PUT" | "POST",
    url: string,
    payload?: object,
  ) {
    return app.inject({
      method,
      url,
      headers: { "x-test-user": userAId },
      ...(payload ? { payload } : {}),
    });
  }
});

async function insertUser(pool: Pool, id: string, email: string): Promise<void> {
  await pool.query(
    `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
     VALUES ($1, $2, $3, false, NOW(), NOW())`,
    [id, email, email],
  );
}

async function insertProfile(
  pool: Pool,
  userId: string,
  displayName: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO user_profiles
       (user_id, display_name, date_of_birth, biological_sex, height_cm,
        country_code, timezone, language_code, measurement_system)
     VALUES ($1, $2, DATE '1990-01-01', 'female', 165,
             'PH', 'Asia/Manila', 'en', 'metric')`,
    [userId, displayName],
  );
}

async function insertGoal(pool: Pool, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_goals
       (user_id, goal_type, starting_weight_kg, current_weight_kg,
        target_weight_kg, weekly_rate_kg, activity_level,
        planned_exercise_in_activity, equation, equation_inputs, bmr_kcal,
        activity_multiplier, tdee_kcal, calorie_adjustment_kcal,
        calorie_target_kcal, protein_target_g, carbohydrate_target_g,
        fat_target_g, target_mode, is_manual_calorie_target)
     VALUES ($1, 'maintain', 70, 70, 70, 0, 'sedentary', false,
             'mifflin_st_jeor', '{}'::jsonb, 1500, 1.2, 1800, 0,
             1900, 100, 200, 50, 'grams', true)`,
    [userId],
  );
}
