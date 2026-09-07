import type { FastifyPluginAsync, FastifyReply } from "fastify";
import { ZodError, type ZodType } from "zod";

import { requireUser } from "../../auth/guard.js";
import type { AuthenticatedUser } from "../../auth/types.js";
import type { BiteIqDatabase } from "../../db/client.js";
import { ApiError, ErrorCode } from "../../errors.js";
import { calculateGoal } from "./calculator.js";
import {
  goalInputSchema,
  goalPutSchema,
  profileInputSchema,
  profilePatchSchema,
  type GoalCalculationInput,
  type GoalWarning,
  type ProfileInput,
} from "./contracts.js";
import { createGoalsRepository } from "./repository.js";
import type { GoalsRepository } from "./repository.js";

export type GoalsRoutesOptions = {
  db: BiteIqDatabase;
  getUser?: (request: Parameters<typeof requireUser>[0]) => Promise<AuthenticatedUser>;
  now?: () => Date;
};

export const goalsRoutes: FastifyPluginAsync<GoalsRoutesOptions> = async (
  app,
  options,
) => {
  const repository = createGoalsRepository(options.db);
  const getUser = options.getUser ?? requireUser;
  const now = options.now ?? (() => new Date());

  app.get("/api/me", async (request) => {
    const user = await getUser(request);
    return { profile: await repository.getProfile(user.id) };
  });

  app.patch("/api/me", async (request, reply) => {
    const user = await getUser(request);
    const parsedPatch = parse(profilePatchSchema, request.body);
    const { confirmedWarnings, ...patch } = parsedPatch;
    const existing = await repository.getProfile(user.id);
    const profile = parse(
      profileInputSchema,
      existing ? { ...profileAsInput(existing), ...patch } : patch,
    );
    const calculationDate = now();
    assertDateOfBirthIsNotFuture(profile, calculationDate);

    let savedProfile;
    try {
      savedProfile = await repository.upsertProfileAndRecalculateGoal(
        user.id,
        profile,
        (transactionProfile, existingGoal) => {
          const input = storedGoalAsInput(existingGoal);
          const calculated = calculateForRoute(
            calculationInput(transactionProfile, input, calculationDate),
          );
          assertWarningsConfirmed(calculated.warnings, confirmedWarnings);
          return { input, calculated };
        },
      );
    } catch (error) {
      if (error instanceof UnconfirmedGoalWarningsError) {
        return sendUnconfirmedWarnings(reply, error);
      }
      throw error;
    }

    return { profile: savedProfile };
  });

  app.get("/api/goals", async (request) => {
    const user = await getUser(request);
    return { goal: await repository.getGoal(user.id) };
  });

  app.post("/api/goals/calculate", async (request) => {
    const user = await getUser(request);
    const input = parse(goalInputSchema, request.body);
    const profile = await requireProfile(repository, user.id);
    const calculation = calculateForRoute(
      calculationInput(profile, input, now()),
    );

    return { calculation };
  });

  app.put("/api/goals", async (request, reply) => {
    const user = await getUser(request);
    const parsed = parse(goalPutSchema, request.body);
    const { confirmedWarnings, ...unvalidatedInput } = parsed;
    const input = parse(goalInputSchema, unvalidatedInput);
    const profile = await requireProfile(repository, user.id);
    const calculated = calculateForRoute(
      calculationInput(profile, input, now()),
    );
    try {
      assertWarningsConfirmed(calculated.warnings, confirmedWarnings);
    } catch (error) {
      if (error instanceof UnconfirmedGoalWarningsError) {
        return sendUnconfirmedWarnings(reply, error);
      }
      throw error;
    }

    const goal = await repository.upsertGoal(
      user.id,
      input,
      calculated,
      profile.dateOfBirth,
    );
    return { goal };
  });
};

function parse<T>(schema: ZodType<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      const message = error.issues
        .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
        .join("; ");
      throw new ApiError(400, ErrorCode.INVALID_INPUT, message);
    }
    throw error;
  }
}

function calculateForRoute(input: GoalCalculationInput) {
  try {
    return calculateGoal(input);
  } catch (error) {
    if (error instanceof Error) {
      throw new ApiError(400, ErrorCode.INVALID_INPUT, error.message);
    }
    throw error;
  }
}

function assertWarningsConfirmed(
  warnings: GoalWarning[],
  confirmedWarnings: GoalWarning[],
): void {
  const missingWarnings = warnings.filter(
    (warning) => !confirmedWarnings.includes(warning),
  );
  if (missingWarnings.length > 0) {
    throw new UnconfirmedGoalWarningsError(missingWarnings);
  }
}

class UnconfirmedGoalWarningsError extends Error {
  public constructor(public readonly warnings: GoalWarning[]) {
    super(`Confirm these warnings before saving: ${warnings.join(", ")}.`);
    this.name = "UnconfirmedGoalWarningsError";
  }
}

function sendUnconfirmedWarnings(
  reply: FastifyReply,
  error: UnconfirmedGoalWarningsError,
) {
  return reply.status(400).send({
    error: {
      code: ErrorCode.INVALID_INPUT,
      message: error.message,
      warnings: error.warnings,
    },
  });
}

function assertDateOfBirthIsNotFuture(
  profile: ProfileInput,
  calculationDate: Date,
): void {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: profile.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(calculationDate);
  const local = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localDate = `${local.year}-${local.month}-${local.day}`;
  if (profile.dateOfBirth > localDate) {
    throw new ApiError(
      400,
      ErrorCode.INVALID_INPUT,
      "dateOfBirth: Date of birth cannot be in the future.",
    );
  }
}

async function requireProfile(
  repository: ReturnType<typeof createGoalsRepository>,
  userId: string,
) {
  const profile = await repository.getProfile(userId);
  if (!profile) {
    throw new ApiError(
      400,
      ErrorCode.INVALID_INPUT,
      "Complete your profile before calculating a goal.",
    );
  }
  return profile;
}

function calculationInput(
  profile: Awaited<ReturnType<ReturnType<typeof createGoalsRepository>["getProfile"]>> & {},
  input: ReturnType<typeof goalInputSchema.parse>,
  calculationDate: Date,
): GoalCalculationInput {
  return {
    ...input,
    dateOfBirth: profile.dateOfBirth,
    biologicalSex: parseBiologicalSex(profile.biologicalSex),
    heightCm: Number(profile.heightCm),
    timezone: profile.timezone,
    calculationDate: calculationDate.toISOString(),
  };
}

function profileAsInput(profile: NonNullable<Awaited<ReturnType<ReturnType<typeof createGoalsRepository>["getProfile"]>>>): ProfileInput {
  return {
    displayName: profile.displayName,
    dateOfBirth: profile.dateOfBirth,
    biologicalSex: parseBiologicalSex(profile.biologicalSex),
    heightCm: Number(profile.heightCm),
    countryCode: profile.countryCode,
    timezone: profile.timezone,
    languageCode: profile.languageCode,
    measurementSystem:
      profile.measurementSystem === "imperial" ? "imperial" : "metric",
  };
}

function parseBiologicalSex(value: string): "male" | "female" | "unspecified" {
  if (value === "male" || value === "female") {
    return value;
  }
  return "unspecified";
}

function storedGoalAsInput(
  goal: NonNullable<Awaited<ReturnType<GoalsRepository["getGoal"]>>>,
) {
  const audit = goal.equationInputs as {
    macros?: unknown;
  };

  return parse(goalInputSchema, {
    goalType: goal.goalType,
    startingWeightKg: Number(goal.startingWeightKg),
    currentWeightKg: Number(goal.currentWeightKg),
    targetWeightKg: Number(goal.targetWeightKg),
    weeklyRateKg: Number(goal.weeklyRateKg ?? 0),
    activityLevel: goal.activityLevel,
    plannedExerciseInActivity: goal.plannedExerciseInActivity,
    targetMode: goal.targetMode,
    macros: audit.macros,
    ...(goal.isManualCalorieTarget
      ? { manualCalorieTargetKcal: Number(goal.calorieTargetKcal) }
      : {}),
  });
}
