import { and, eq } from "drizzle-orm";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../../src/app.js";
import { createAuth } from "../../src/auth/auth.js";
import { requireUser } from "../../src/auth/guard.js";
import { createDb } from "../../src/db/client.js";
import { userProfiles } from "../../src/db/schema/index.js";
import { resetPrivateAccountPassword } from "../../src/scripts/account-reset-password.js";
import {
  createIntegrationPool,
  integrationDatabaseUrl,
  prepareIntegrationDatabase,
  truncateIntegrationDatabase,
} from "./setup.js";

const authConfig = {
  nodeEnv: "test" as const,
  authSecret: "test-secret-that-is-at-least-thirty-two-characters",
  appUrl: "http://127.0.0.1:4000",
  clientOrigins: ["http://localhost:8081"],
};

const userA = {
  email: "isolation-a@example.test",
  name: "Isolation A",
  password: "user a password value",
};

const userB = {
  email: "isolation-b@example.test",
  name: "Isolation B",
  password: "user b password value",
};

describe("authenticated session transport and two-user isolation", () => {
  const db = createDb(integrationDatabaseUrl);
  const auth = createAuth(db, authConfig);
  let pool: Pool;
  let app: Awaited<ReturnType<typeof buildApp>>;
  let userAId: string;
  let userBId: string;
  let observedExpoOrigins: Array<string | undefined>;

  beforeAll(async () => {
    await prepareIntegrationDatabase();
    pool = createIntegrationPool();
    app = await buildApp({ logger: false, auth });
    app.addHook("onRequest", async (request) => {
      if (request.url.startsWith("/api/auth/")) {
        const origin = request.headers["expo-origin"];
        observedExpoOrigins.push(
          Array.isArray(origin) ? origin[0] : origin,
        );
      }
    });
    app.get<{ Params: { id: string } }>(
      "/api/test-private/profiles/:id",
      async (request, reply) => {
        const currentUser = await requireUser(request);
        const [profile] = await db
          .select({ userId: userProfiles.userId })
          .from(userProfiles)
          .where(
            and(
              eq(userProfiles.userId, request.params.id),
              eq(userProfiles.userId, currentUser.id),
            ),
          )
          .limit(1);

        if (!profile) {
          return reply.status(404).send({
            error: { code: "NOT_FOUND", message: "Profile not found." },
          });
        }

        return { profile };
      },
    );
  });

  beforeEach(async () => {
    observedExpoOrigins = [];
    await truncateIntegrationDatabase(pool);
    userAId = (await auth.api.createUser({ body: userA })).user.id;
    userBId = (await auth.api.createUser({ body: userB })).user.id;

    await pool.query(
      `INSERT INTO user_profiles
         (user_id, display_name, date_of_birth, biological_sex, height_cm,
          country_code, timezone, language_code, measurement_system)
       VALUES ($1, 'Isolation B', DATE '1990-01-01', 'unspecified', 170,
               'PH', 'Asia/Manila', 'en', 'metric')`,
      [userBId],
    );
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await db.$client.end();
  });

  it(
    "runs the root Expo 1.2.12 client against the server 1.7.3 session protocol",
    async () => {
      await app.listen({ host: "127.0.0.1", port: 0 });
      const address = app.server.address();
      if (!address || typeof address === "string") {
        throw new Error("Fastify did not bind an ephemeral TCP port");
      }

      await runRootExpoClientProof(
        `http://127.0.0.1:${address.port}`,
        userA.email,
        userA.password,
        userAId,
      );
      expect(observedExpoOrigins).toContain("biteiq://");
    },
    20_000,
  );

  it("rejects an expired session", async () => {
    const signIn = await signInUserA();
    const cookie = cookieHeader(signIn.headers["set-cookie"]);
    await pool.query(
      `UPDATE session SET expires_at = NOW() - INTERVAL '1 second' WHERE user_id = $1`,
      [userAId],
    );

    const response = await app.inject({
      method: "GET",
      url: "/api/test-private/profiles/any-id",
      headers: { cookie },
    });

    expect(response.statusCode).toBe(401);
  });

  it("revokes every session when an administrator resets a password", async () => {
    const firstSignIn = await signInUserA();
    const secondSignIn = await signInUserA();
    const firstCookie = cookieHeader(firstSignIn.headers["set-cookie"]);
    const secondCookie = cookieHeader(secondSignIn.headers["set-cookie"]);

    await resetPrivateAccountPassword(
      db,
      authConfig,
      userA.email,
      "replacement password value",
    );

    for (const cookie of [firstCookie, secondCookie]) {
      const response = await app.inject({
        method: "GET",
        url: "/api/test-private/profiles/any-id",
        headers: { cookie },
      });
      expect(response.statusCode).toBe(401);
    }

    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/sign-in/email",
          payload: { email: userA.email, password: userA.password },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/auth/sign-in/email",
          payload: {
            email: userA.email,
            password: "replacement password value",
          },
        })
      ).statusCode,
    ).toBe(200);
  });

  it("returns 404 without owner information for another user's UUID", async () => {
    const signIn = await signInUserA();
    const cookie = cookieHeader(signIn.headers["set-cookie"]);

    const response = await app.inject({
      method: "GET",
      url: `/api/test-private/profiles/${userBId}`,
      headers: { cookie },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: { code: "NOT_FOUND", message: "Profile not found." },
    });
    expect(response.body).not.toContain(userBId);
    expect(response.body).not.toContain(userB.email);
  });

  async function signInUserA() {
    return app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email: userA.email, password: userA.password },
    });
  }
});

function cookieHeader(setCookie: string | string[] | undefined): string {
  const rawCookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (!rawCookie) {
    throw new Error("Sign-in response did not return Set-Cookie");
  }

  return rawCookie.split(";", 1)[0] ?? "";
}

async function runRootExpoClientProof(
  baseUrl: string,
  email: string,
  password: string,
  userId: string,
): Promise<void> {
  const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const jestBin = fileURLToPath(
    new URL("../../../node_modules/jest/bin/jest.js", import.meta.url),
  );
  const configPath = fileURLToPath(
    new URL("./auth-client-compat.jest.config.cjs", import.meta.url),
  );
  const testPath = fileURLToPath(
    new URL("./auth-client-compat.jest.ts", import.meta.url),
  );

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [jestBin, "--config", configPath, "--runInBand", "--runTestsByPath", testPath],
      {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          BITEIQ_COMPAT_BASE_URL: baseUrl,
          BITEIQ_COMPAT_EMAIL: email,
          BITEIQ_COMPAT_PASSWORD: password,
          BITEIQ_COMPAT_USER_ID: userId,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`Root Expo compatibility proof failed:\n${output}`));
    });
  });
}
