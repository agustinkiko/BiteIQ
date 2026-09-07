import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";

import { requireUser } from "../../auth/guard.js";
import type { AuthenticatedUser } from "../../auth/types.js";
import type { BiteIqDatabase } from "../../db/client.js";
import { ApiError, ErrorCode } from "../../errors.js";
import type { NutritionProviderRegistry } from "../../providers/nutrition/types.js";
import {
  createFoodRepository,
  normalizeFoodText,
} from "./repository.js";

const searchQuerySchema = z
  .object({
    q: z.string().max(200).default(""),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

const foodParamsSchema = z.object({ id: z.string().uuid() }).strict();

export interface FoodRoutesOptions {
  db: BiteIqDatabase;
  providers: NutritionProviderRegistry;
  resolveUser?: (request: FastifyRequest) => Promise<AuthenticatedUser>;
}

export interface FoodSearchWarning {
  code: typeof ErrorCode.NUTRITION_PROVIDER_UNAVAILABLE;
  provider: string;
  message: string;
}

export const foodRoutes: FastifyPluginAsync<FoodRoutesOptions> = async (
  app,
  options,
) => {
  const repository = createFoodRepository(options.db);
  const resolveUser = options.resolveUser ?? requireUser;

  app.get("/api/foods/search", async (request) => {
    const user = await resolveUser(request);
    const query = parseInput(searchQuerySchema, request.query);
    const normalizedQuery = normalizeFoodText(query.q);
    let localFoods = await repository.searchLocalFoods(
      user.id,
      normalizedQuery,
      query.limit,
    );
    const warnings: FoodSearchWarning[] = [];

    if (normalizedQuery.length >= 3 && localFoods.length < query.limit) {
      const provider = options.providers.get("usda");
      if (provider) {
        let providerFoods;
        try {
          providerFoods = await provider.searchFoods({
            query: normalizedQuery,
            limit: query.limit,
          });
        } catch (error) {
          request.log.warn(
            { err: error, provider: provider.id },
            "nutrition provider search failed",
          );
          if (localFoods.length === 0) {
            throw new ApiError(
              503,
              ErrorCode.NUTRITION_PROVIDER_UNAVAILABLE,
              "The nutrition database is unavailable. Try again.",
            );
          }
          warnings.push(providerWarning(provider.id));
          return { foods: localFoods, warnings };
        }

        for (const providerFood of providerFoods) {
          await repository.upsertProviderFood(providerFood);
        }
        localFoods = await repository.searchLocalFoods(
          user.id,
          normalizedQuery,
          query.limit,
        );
      }
    }

    return { foods: localFoods, warnings };
  });

  app.get("/api/foods/:id", async (request) => {
    await resolveUser(request);
    const params = parseInput(foodParamsSchema, request.params);
    const food = await repository.getFoodById(params.id);
    if (!food) {
      throw new ApiError(
        404,
        ErrorCode.FOOD_NOT_FOUND,
        "That food is no longer available. Search again.",
      );
    }

    return { food };
  });
};

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(
      400,
      ErrorCode.INVALID_INPUT,
      parsed.error.issues[0]?.message ?? "Invalid input.",
    );
  }
  return parsed.data;
}

function providerWarning(provider: string): FoodSearchWarning {
  return {
    code: ErrorCode.NUTRITION_PROVIDER_UNAVAILABLE,
    provider,
    message: "The nutrition database is unavailable. Try again.",
  };
}
