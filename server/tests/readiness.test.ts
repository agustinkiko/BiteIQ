import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";

describe("readiness", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  afterEach(async () => app?.close());

  it("reports ready when the injected SELECT 1 health check succeeds", async () => {
    const checkDatabaseHealth = vi.fn(async () => undefined);
    app = await buildApp({ logger: false, checkDatabaseHealth });

    const response = await app.inject({
      method: "GET",
      url: "/api/health/ready",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
    expect(checkDatabaseHealth).toHaveBeenCalledOnce();
  });

  it("reports DATABASE_UNAVAILABLE when PostgreSQL cannot answer", async () => {
    const checkDatabaseHealth = vi.fn(async () => {
      throw new Error("connection refused");
    });
    app = await buildApp({ logger: false, checkDatabaseHealth });

    const response = await app.inject({
      method: "GET",
      url: "/api/health/ready",
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "The database is unavailable.",
      },
    });
  });

  it("does not depend on USDA availability", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("USDA unavailable");
    });
    app = await buildApp({
      logger: false,
      checkDatabaseHealth: async () => undefined,
    });

    try {
      const response = await app.inject({
        method: "GET",
        url: "/api/health/ready",
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ready" });
      expect(globalThis.fetch).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
