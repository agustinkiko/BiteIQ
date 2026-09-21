import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

export const ErrorCode = {
  AUTH_REQUIRED: "AUTH_REQUIRED",
  INVALID_INPUT: "INVALID_INPUT",
  FOOD_NOT_FOUND: "FOOD_NOT_FOUND",
  DIARY_ENTRY_NOT_FOUND: "DIARY_ENTRY_NOT_FOUND",
  NUTRITION_PROVIDER_UNAVAILABLE: "NUTRITION_PROVIDER_UNAVAILABLE",
  DATABASE_UNAVAILABLE: "DATABASE_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  OFFLINE: "OFFLINE",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class ApiError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function registerErrorHandler(app: {
  setErrorHandler: (
    handler: (error: FastifyError | ApiError, request: FastifyRequest, reply: FastifyReply) => void,
  ) => void;
}): void {
  app.setErrorHandler((error, request, reply) => {
    if (
      error.code === "FST_ERR_CTP_EMPTY_JSON_BODY"
      || error.code === "FST_ERR_CTP_INVALID_JSON_BODY"
    ) {
      request.log.warn(
        { code: ErrorCode.INVALID_INPUT, parserCode: error.code },
        "request body is not valid JSON",
      );
      void reply.status(400).send({
        error: {
          code: ErrorCode.INVALID_INPUT,
          message: "Request body must contain valid JSON.",
        },
      });
      return;
    }

    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      request.log.warn(
        { err: error, code: ErrorCode.INVALID_INPUT },
        "request body is too large",
      );
      void reply.status(413).send({
        error: {
          code: ErrorCode.INVALID_INPUT,
          message: "Request body is too large.",
        },
      });
      return;
    }

    if (error instanceof ApiError) {
      request.log.warn({ err: error, code: error.code }, "request failed");
      void reply.status(error.statusCode).send({ error: { code: error.code, message: error.message } });
      return;
    }

    request.log.error({ err: error, code: ErrorCode.INTERNAL_ERROR }, "unexpected request failure");
    void reply.status(500).send({
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "An unexpected error occurred.",
      },
    });
  });
}
