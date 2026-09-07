import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import type { z } from "zod";

import { requireUser } from "../../auth/guard.js";
import type { AuthenticatedUser } from "../../auth/types.js";
import type { BiteIqDatabase } from "../../db/client.js";
import { ApiError, ErrorCode } from "../../errors.js";
import {
  createDiaryEntrySchema,
  diaryDateParamsSchema,
  diaryEntryParamsSchema,
  updateDiaryEntrySchema,
} from "./contracts.js";
import {
  createDiaryRepository,
  DiaryRepositoryError,
} from "./repository.js";

export interface DiaryRoutesOptions {
  db: BiteIqDatabase;
  resolveUser?: (request: FastifyRequest) => Promise<AuthenticatedUser>;
}

export const diaryRoutes: FastifyPluginAsync<DiaryRoutesOptions> = async (
  app,
  options,
) => {
  const repository = createDiaryRepository(options.db);
  const resolveUser = options.resolveUser ?? requireUser;

  app.get("/api/diary/:date", async (request) => {
    const user = await resolveUser(request);
    const params = parseInput(diaryDateParamsSchema, request.params);
    return { diary: await repository.getDiary(user.id, params.date) };
  });

  app.post("/api/diary/:date/entries", async (request) => {
    const user = await resolveUser(request);
    parseInput(diaryDateParamsSchema, request.params);
    const input = parseInput(createDiaryEntrySchema, request.body);
    return {
      diary: await withRepositoryErrors(() =>
        repository.createEntry(user.id, input),
      ),
    };
  });

  app.patch("/api/diary/entries/:id", async (request) => {
    const user = await resolveUser(request);
    const params = parseInput(diaryEntryParamsSchema, request.params);
    const input = parseInput(updateDiaryEntrySchema, request.body);
    const diary = await withRepositoryErrors(() =>
      repository.updateEntry(user.id, params.id, input),
    );
    if (!diary) throw entryNotFound();
    return { diary };
  });

  app.delete("/api/diary/entries/:id", async (request) => {
    const user = await resolveUser(request);
    const params = parseInput(diaryEntryParamsSchema, request.params);
    const diary = await withRepositoryErrors(() =>
      repository.deleteEntry(user.id, params.id),
    );
    if (!diary) throw entryNotFound();
    return { diary };
  });
};

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`)
      .join("; ");
    throw new ApiError(400, ErrorCode.INVALID_INPUT, message);
  }
  return parsed.data;
}

async function withRepositoryErrors<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof DiaryRepositoryError)) throw error;
    if (error.code === "FOOD_NOT_FOUND" || error.code === "SERVING_NOT_FOUND") {
      throw new ApiError(
        404,
        ErrorCode.FOOD_NOT_FOUND,
        "That food is no longer available. Search again.",
      );
    }
    throw new ApiError(400, ErrorCode.INVALID_INPUT, error.message);
  }
}

function entryNotFound(): ApiError {
  return new ApiError(
    404,
    "DIARY_ENTRY_NOT_FOUND" as (typeof ErrorCode)[keyof typeof ErrorCode],
    "Diary entry not found.",
  );
}
