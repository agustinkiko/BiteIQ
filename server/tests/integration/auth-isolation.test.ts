import { and, eq } from "drizzle-orm";
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

  beforeAll(async () => {
    pool = createIntegrationPool();
    app = await buildApp({ logger: false, auth });
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

  it("matches the Expo 1.2.12 cookie transport contract against server 1.7.3", async () => {
    const signIn = await signInUserA();
    const cookie = cookieHeader(signIn.headers["set-cookie"]);

    expect(signIn.statusCode).toBe(200);
    expect(cookie).toMatch(/^better-auth\.session_token=/);

    const session = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie, "expo-origin": "biteiq://" },
    });

    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({
      user: { id: userAId, email: userA.email },
      session: { userId: userAId },
    });

    const signOut = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { cookie, "expo-origin": "biteiq://" },
    });
    expect(signOut.statusCode).toBe(200);

    const revokedSession = await app.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: { cookie, "expo-origin": "biteiq://" },
    });
    expect(revokedSession.statusCode).toBe(200);
    expect(revokedSession.json()).toBeNull();
  });

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
