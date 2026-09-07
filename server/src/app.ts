import Fastify, {
  LogController,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from "fastify";
import { fromNodeHeaders } from "better-auth/node";

import type { BiteIqAuth } from "./auth/auth.js";
import { requireUser, setAuthenticatedUser } from "./auth/guard.js";
import type { BiteIqDatabase } from "./db/client.js";
import { ApiError, ErrorCode, registerErrorHandler } from "./errors.js";
import { diaryRoutes } from "./modules/diary/routes.js";
import { foodRoutes } from "./modules/foods/routes.js";
import { goalsRoutes } from "./modules/goals/routes.js";
import type { NutritionProviderRegistry } from "./providers/nutrition/types.js";

export type BuildAppOptions = {
  logger?: FastifyServerOptions["logger"];
  auth?: BiteIqAuth;
  db?: BiteIqDatabase;
  nutritionProviders?: NutritionProviderRegistry;
  checkDatabaseHealth?: () => Promise<void>;
};

const bodyLimit = 64 * 1024;
const redactedLogPaths = [
  "req.body",
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-usda-api-key']",
  "body",
  "requestBody",
  "password",
  "cookie",
  "providerKey",
  "diaryContent",
  "headers.authorization",
  "headers.cookie",
  "headers['x-usda-api-key']",
];

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const requestedLogger = options.logger ?? true;
  const logger = requestedLogger === false
    ? false
    : {
        ...(requestedLogger === true ? {} : requestedLogger),
        redact: { paths: redactedLogPaths, remove: true },
      };
  const app = Fastify({
    logger,
    bodyLimit,
    logController: new LogController({ disableRequestLogging: true }),
  });

  registerErrorHandler(app);

  app.get("/api/health/live", async () => ({ status: "ok" }));
  app.get("/api/health/ready", async () => {
    if (!options.checkDatabaseHealth) {
      throw databaseUnavailableError();
    }

    try {
      await options.checkDatabaseHealth();
    } catch {
      throw databaseUnavailableError();
    }

    return { status: "ready" };
  });

  if (options.auth) {
    registerAuthRoutes(app, options.auth);
  }

  app.addHook("preHandler", async (request) => {
    if (isPublicRequest(request)) {
      return;
    }

    if (options.auth) {
      const session = await options.auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (session) {
        setAuthenticatedUser(request, {
          id: session.user.id,
          email: session.user.email,
          name: session.user.name,
        });
      }
    }

    await requireUser(request);
  });

  app.addHook("onResponse", async (request, reply) => {
    let userId: string | undefined;
    try {
      userId = (await requireUser(request)).id;
    } catch {
      userId = undefined;
    }

    request.log.info(
      {
        requestId: request.id,
        route: request.routeOptions.url ?? request.url.split("?", 1)[0],
        status: reply.statusCode,
        duration: reply.elapsedTime,
        ...(userId ? { userId } : {}),
      },
      "request completed",
    );
  });

  if (options.db) {
    if (!options.nutritionProviders) {
      throw new Error(
        "A nutrition provider registry is required when application routes are enabled.",
      );
    }

    await app.register(goalsRoutes, { db: options.db });
    await app.register(foodRoutes, {
      db: options.db,
      providers: options.nutritionProviders,
    });
    await app.register(diaryRoutes, { db: options.db });
  }

  return app;
}

function databaseUnavailableError(): ApiError {
  return new ApiError(
    503,
    ErrorCode.DATABASE_UNAVAILABLE,
    "The database is unavailable.",
  );
}

function registerAuthRoutes(app: FastifyInstance, auth: BiteIqAuth): void {
  app.post("/api/auth/sign-up/email", async (_request, reply) => {
    return reply.status(403).send({
      code: "SIGN_UP_DISABLED",
      message: "Account creation is private.",
    });
  });

  app.all("/api/auth/*", async (request, reply) => {
    return forwardAuthRequest(auth, request, reply);
  });
}

async function forwardAuthRequest(
  auth: BiteIqAuth,
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const url = new URL(request.url, "http://biteiq.local");
  if (url.pathname === "/api/auth/session") {
    url.pathname = "/api/auth/get-session";
  }

  const headers = fromNodeHeaders(request.headers);
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const authRequest = new Request(url, {
    method: request.method,
    headers,
    ...(hasBody && request.body !== undefined
      ? { body: JSON.stringify(request.body) }
      : {}),
  });
  const response = await auth.handler(authRequest);

  if (
    url.pathname === "/api/auth/sign-in/email"
    && response.status === 401
  ) {
    return reply.status(401).send({
      code: "INVALID_EMAIL_OR_PASSWORD",
      message: "Invalid email or password",
    });
  }

  reply.status(response.status);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") {
      reply.header(key, value);
    }
  });

  const responseHeaders = response.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const setCookies = responseHeaders.getSetCookie?.() ?? [];
  if (setCookies.length > 0) {
    reply.header("set-cookie", setCookies);
  } else {
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      reply.header("set-cookie", setCookie);
    }
  }

  const body = await response.text();
  return body.length > 0 ? reply.send(body) : reply.send();
}

function isPublicRequest(request: FastifyRequest): boolean {
  const path = request.url.split("?", 1)[0];
  return path === "/api/health/live"
    || path === "/api/health/ready"
    || path?.startsWith("/api/auth/") === true;
}
