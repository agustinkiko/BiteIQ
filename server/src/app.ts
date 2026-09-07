import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { fromNodeHeaders } from "better-auth/node";

import type { BiteIqAuth } from "./auth/auth.js";
import { requireUser, setAuthenticatedUser } from "./auth/guard.js";
import { registerErrorHandler } from "./errors.js";

type BuildAppOptions = {
  logger?: boolean;
  auth?: BiteIqAuth;
};

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  registerErrorHandler(app);

  app.get("/api/health/live", async () => ({ status: "ok" }));

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

  return app;
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
  return path === "/api/health/live" || path?.startsWith("/api/auth/") === true;
}
