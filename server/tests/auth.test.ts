import { EventEmitter } from "node:events";
import type { ReadStream, WriteStream } from "node:tty";

import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { createAuth } from "../src/auth/auth.js";
import { requireUser } from "../src/auth/guard.js";
import {
  promptHiddenPassword,
  readConfirmedPassword,
} from "../src/auth/password-prompt.js";
import {
  parseCreateAccountArguments,
} from "../src/scripts/account-create.js";
import {
  parseResetPasswordArguments,
} from "../src/scripts/account-reset-password.js";
import { createDb } from "../src/db/client.js";
import {
  createIntegrationPool,
  integrationDatabaseUrl,
  truncateIntegrationDatabase,
} from "./integration/setup.js";

const authConfig = {
  nodeEnv: "test" as const,
  authSecret: "test-secret-that-is-at-least-thirty-two-characters",
  appUrl: "http://127.0.0.1:4000",
  clientOrigins: ["http://localhost:8081"],
};

const validCredentials = {
  email: "user-a@example.test",
  password: "correct horse battery staple",
};

describe("private email and password authentication", () => {
  const db = createDb(integrationDatabaseUrl);
  const auth = createAuth(db, authConfig);
  let pool: Pool;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pool = createIntegrationPool();
    app = await buildApp({ logger: false, auth });
    app.get("/api/test-private", async (request) => ({
      user: await requireUser(request),
    }));
  });

  beforeEach(async () => {
    await truncateIntegrationDatabase(pool);
    await auth.api.createUser({
      body: {
        email: validCredentials.email,
        name: "User A",
        password: validCredentials.password,
      },
    });
  });

  afterAll(async () => {
    await app?.close();
    await pool?.end();
    await db.$client.end();
  });

  it("signs in a private account and returns a UUID user", async () => {
    const response = await signIn(app, validCredentials);

    expect(response.statusCode).toBe(200);
    expect(response.json().user).toMatchObject({
      email: validCredentials.email,
      name: "User A",
    });
    expect(response.json().user.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it("does not reveal whether an email exists", async () => {
    const wrongPassword = await signIn(app, {
      ...validCredentials,
      password: "wrong password value",
    });
    const unknownEmail = await signIn(app, {
      ...validCredentials,
      email: "unknown@example.test",
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownEmail.statusCode).toBe(401);
    expect(unknownEmail.json()).toEqual(wrongPassword.json());
  });

  it("forbids public email signup", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: {
        email: "public-signup@example.test",
        name: "Public Signup",
        password: "public password value",
      },
    });

    expect(response.statusCode).toBe(403);
  });

  it("rejects a private route without a session", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/test-private",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: {
        code: "AUTH_REQUIRED",
        message: "Sign in to continue.",
      },
    });
  });

  it("uses secure cookies in production", async () => {
    const productionAuth = createAuth(db, {
      ...authConfig,
      nodeEnv: "production",
      appUrl: "https://biteiq.example.test",
    });
    const productionApp = await buildApp({
      logger: false,
      auth: productionAuth,
    });

    try {
      const response = await signIn(productionApp, validCredentials);
      const setCookie = Array.isArray(response.headers["set-cookie"])
        ? response.headers["set-cookie"].join("; ")
        : response.headers["set-cookie"] ?? "";

      expect(response.statusCode).toBe(200);
      expect(setCookie).toContain("__Secure-better-auth.session_token=");
      expect(setCookie).toContain("Secure");
    } finally {
      await productionApp.close();
    }
  });

  it("permits Expo wildcard origins only in development", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const developmentAuth = createAuth(db, {
      ...authConfig,
      nodeEnv: "development",
    });
    const productionAuth = createAuth(db, {
      ...authConfig,
      nodeEnv: "production",
      appUrl: "https://biteiq.example.test",
    });
    const developmentApp = await buildApp({ logger: false, auth: developmentAuth });
    const productionApp = await buildApp({ logger: false, auth: productionAuth });

    try {
      const developmentResponse = await signIn(
        developmentApp,
        {
          ...validCredentials,
          callbackURL: "exp://192.168.1.20:8081/signed-in",
        },
        { "expo-origin": "exp://192.168.1.20:8081" },
      );
      const productionResponse = await signIn(
        productionApp,
        {
          ...validCredentials,
          callbackURL: "exp://192.168.1.20:8081/signed-in",
        },
        { "expo-origin": "exp://192.168.1.20:8081" },
      );

      expect(developmentResponse.statusCode).toBe(200);
      expect(productionResponse.statusCode).toBe(403);
    } finally {
      await developmentApp.close();
      await productionApp.close();
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });
});

describe("private account command inputs", () => {
  it("accepts only email and name for account creation", () => {
    expect(
      parseCreateAccountArguments([
        "--email",
        "person@example.test",
        "--name",
        "Test Person",
      ]),
    ).toEqual({ email: "person@example.test", name: "Test Person" });

    expect(() =>
      parseCreateAccountArguments([
        "--email",
        "person@example.test",
        "--name",
        "Test Person",
        "--password",
        "must-not-be-accepted",
      ]),
    ).toThrow("Passwords must not be passed as arguments");
  });

  it("accepts only email for password reset", () => {
    expect(
      parseResetPasswordArguments(["--email", "person@example.test"]),
    ).toEqual({ email: "person@example.test" });

    expect(() =>
      parseResetPasswordArguments([
        "--email",
        "person@example.test",
        "--password",
        "must-not-be-accepted",
      ]),
    ).toThrow("Passwords must not be passed as arguments");
  });

  it("prompts twice and rejects mismatched passwords", async () => {
    const prompts: string[] = [];
    const answers = ["first password value", "second password value"];

    await expect(
      readConfirmedPassword(async (prompt) => {
        prompts.push(prompt);
        return answers.shift() ?? "";
      }),
    ).rejects.toThrow("Passwords do not match");

    expect(prompts).toEqual(["Password: ", "Confirm password: "]);
  });

  it("reads a password without writing its characters", async () => {
    const input = new FakePasswordInput();
    const output = new FakePasswordOutput();
    const password = promptHiddenPassword(
      "Password: ",
      input as unknown as ReadStream,
      output as unknown as WriteStream,
    );

    input.emit("data", "private password value\n");

    await expect(password).resolves.toBe("private password value");
    expect(output.text).toBe("Password: \n");
    expect(output.text).not.toContain("private password value");
    expect(input.rawModes).toEqual([true, false]);
  });
});

class FakePasswordInput extends EventEmitter {
  public readonly isTTY = true;
  public readonly rawModes: boolean[] = [];

  public setEncoding(): this {
    return this;
  }

  public setRawMode(mode: boolean): this {
    this.rawModes.push(mode);
    return this;
  }

  public resume(): this {
    return this;
  }

  public pause(): this {
    return this;
  }
}

class FakePasswordOutput {
  public readonly isTTY = true;
  public text = "";

  public write(value: string): boolean {
    this.text += value;
    return true;
  }
}

async function signIn(
  app: Awaited<ReturnType<typeof buildApp>>,
  credentials: { email: string; password: string; callbackURL?: string },
  headers?: Record<string, string>,
) {
  return app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    headers,
    payload: credentials,
  });
}
