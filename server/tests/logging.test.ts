import { Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import type { BiteIqAuth } from "../src/auth/auth.js";

const userId = "2f84f20d-90bf-4a61-b1f5-28c1210375cd";

describe("request logging", () => {
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  afterEach(async () => app?.close());

  it("writes one safe structured completion record for an authenticated request", async () => {
    const chunks: string[] = [];
    const stream = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk.toString());
        callback();
      },
    });
    const auth = {
      api: {
        getSession: vi.fn(async () => ({
          session: { id: "session-id" },
          user: {
            id: userId,
            email: "user@example.test",
            name: "Test User",
          },
        })),
      },
      handler: vi.fn(),
    } as unknown as BiteIqAuth;

    app = await buildApp({
      auth,
      logger: { level: "info", stream },
    });
    app.post("/api/test-logging", async (request) => {
      const body = request.body as {
        password: string;
        diaryContent: string;
      };
      request.log.info(
        {
          body,
          password: body.password,
          cookie: request.headers.cookie,
          providerKey: request.headers["x-usda-api-key"],
          diaryContent: body.diaryContent,
        },
        "diagnostic record",
      );
      return { ok: true };
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/test-logging",
      headers: {
        cookie: "session=private-cookie-value",
        "x-usda-api-key": "private-provider-key",
      },
      payload: {
        password: "private-password-value",
        diaryContent: "private diary breakfast notes",
      },
    });

    expect(response.statusCode).toBe(200);
    const records = chunks
      .join("")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const completionRecords = records.filter(
      (record) => record.msg === "request completed",
    );

    expect(completionRecords).toHaveLength(1);
    expect(completionRecords[0]).toMatchObject({
      route: "/api/test-logging",
      status: 200,
      userId,
    });
    expect(completionRecords[0]?.requestId).toEqual(expect.any(String));
    expect(completionRecords[0]?.duration).toEqual(expect.any(Number));

    const serializedLogs = chunks.join("");
    expect(serializedLogs).not.toContain("private-password-value");
    expect(serializedLogs).not.toContain("private-cookie-value");
    expect(serializedLogs).not.toContain("private-provider-key");
    expect(serializedLogs).not.toContain("private diary breakfast notes");
  });

  it("rejects request bodies larger than 64 KiB", async () => {
    app = await buildApp({ logger: false });
    app.post("/api/health/body-limit", async () => ({ ok: true }));

    const response = await app.inject({
      method: "POST",
      url: "/api/health/body-limit",
      payload: { content: "x".repeat(65 * 1024) },
    });

    expect(response.statusCode).toBe(413);
  });
});
