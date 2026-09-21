import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

describe("JSON parser error responses", () => {
  it.each([
    { name: "empty JSON DELETE", method: "DELETE" as const, payload: undefined },
    { name: "malformed JSON POST", method: "POST" as const, payload: '{"password":"private-test-value"' },
  ])("returns safe INVALID_INPUT 400 for $name", async ({ method, payload }) => {
    const app = await buildApp({ logger: false });
    app.route({ method, url: "/api/auth/parser-test", handler: async () => ({ ok: true }) });

    try {
      const response = await app.inject({
        method,
        url: "/api/auth/parser-test",
        headers: { "content-type": "application/json" },
        ...(payload === undefined ? {} : { payload }),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({
        error: { code: "INVALID_INPUT", message: "Request body must contain valid JSON." },
      });
      expect(response.body).not.toContain("private-test-value");
      expect(response.body).not.toContain("FST_ERR");
    } finally {
      await app.close();
    }
  });
});
