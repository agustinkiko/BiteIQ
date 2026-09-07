import { afterEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("health routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  afterEach(async () => app?.close());

  it("reports that the API process is alive", async () => {
    app = await buildApp({ logger: false });
    const response = await app.inject({ method: "GET", url: "/api/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });
});
