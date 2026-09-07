import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import type { BiteIqAuth } from "../src/auth/auth.js";

const allowedOrigin = "https://biteiq.example.test";
const authenticatedCookie = "biteiq-test-session=valid";

describe("browser origin protection", () => {
  it("allows credentialed requests only from a configured client origin", async () => {
    const app = await buildApp({
      logger: false,
      auth: testAuth(),
      clientOrigins: [allowedOrigin],
    });

    try {
      const allowed = await app.inject({
        method: "OPTIONS",
        url: "/api/private-test",
        headers: {
          origin: allowedOrigin,
          "access-control-request-method": "GET",
        },
      });
      const rejected = await app.inject({
        method: "OPTIONS",
        url: "/api/private-test",
        headers: {
          origin: "https://attacker.example.test",
          "access-control-request-method": "GET",
        },
      });

      expect(allowed.statusCode).toBe(204);
      expect(allowed.headers["access-control-allow-origin"]).toBe(allowedOrigin);
      expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
      expect(rejected.headers["access-control-allow-origin"]).toBeUndefined();
      expect(rejected.headers["access-control-allow-credentials"]).toBe("true");
    } finally {
      await app.close();
    }
  });
});

describe("targeted request rate limits", () => {
  it("limits repeated password sign-in attempts before they reach auth", async () => {
    let authHandlerCalls = 0;
    const app = await buildApp({
      logger: false,
      auth: testAuth(() => {
        authHandlerCalls += 1;
      }),
      clientOrigins: [allowedOrigin],
    });

    try {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const response = await app.inject({
          method: "POST",
          url: "/api/auth/sign-in/email",
          payload: {
            email: "person@example.test",
            password: "wrong password",
          },
        });
        expect(response.statusCode).toBe(401);
      }

      const limited = await app.inject({
        method: "POST",
        url: "/api/auth/sign-in/email",
        payload: {
          email: "person@example.test",
          password: "wrong password",
        },
      });

      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toEqual({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again shortly.",
        },
      });
      expect(limited.headers["retry-after"]).toBeDefined();
      expect(authHandlerCalls).toBe(10);
    } finally {
      await app.close();
    }
  });

  it("limits food search without limiting health or other private routes", async () => {
    const app = await buildApp({
      logger: false,
      auth: testAuth(),
      clientOrigins: [allowedOrigin],
    });
    app.get("/api/foods/search", async () => ({ foods: [], warnings: [] }));
    app.get("/api/private-test", async () => ({ ok: true }));
    const headers = { cookie: authenticatedCookie };

    try {
      for (let requestNumber = 0; requestNumber < 60; requestNumber += 1) {
        const search = await app.inject({
          method: "GET",
          url: "/api/foods/search?q=banana",
          headers,
        });
        const health = await app.inject({
          method: "GET",
          url: "/api/health/live",
        });
        const privateRequest = await app.inject({
          method: "GET",
          url: "/api/private-test",
          headers,
        });

        expect(search.statusCode).toBe(200);
        expect(health.statusCode).toBe(200);
        expect(privateRequest.statusCode).toBe(200);
      }

      const limited = await app.inject({
        method: "GET",
        url: "/api/foods/search?q=banana",
        headers,
      });

      expect(limited.statusCode).toBe(429);
      expect(limited.json()).toEqual({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Try again shortly.",
        },
      });
    } finally {
      await app.close();
    }
  });
});

function testAuth(onAuthRequest?: () => void): BiteIqAuth {
  const userId = randomUUID();
  return {
    handler: async () => {
      onAuthRequest?.();
      return Response.json(
        { code: "BAD_PASSWORD", message: "Wrong password" },
        { status: 401 },
      );
    },
    api: {
      getSession: async ({ headers }: { headers: Headers }) =>
        headers.get("cookie") === authenticatedCookie
          ? {
              session: { id: "test-session" },
              user: {
                id: userId,
                email: "person@example.test",
                name: "Test Person",
              },
            }
          : null,
    },
  } as BiteIqAuth;
}
