import { EventEmitter } from "node:events";
import type { ReadStream, WriteStream } from "node:tty";

import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { buildApp } from "../src/app.js";
import { buildTrustedOrigins } from "../src/auth/auth.js";
import { requireUser } from "../src/auth/guard.js";
import type { BetterAuthInstance } from "../src/auth/types.js";
import {
  promptHiddenPassword,
  readConfirmedPassword,
} from "../src/auth/password-prompt.js";
import { loadConfig, type ServerConfig } from "../src/config.js";
import {
  closeServerResources,
  startServer,
} from "../src/index.js";
import { parseCreateAccountArguments } from "../src/scripts/account-create.js";
import { parseResetPasswordArguments } from "../src/scripts/account-reset-password.js";
import {
  truncateIntegrationDatabase,
  validateTestDatabaseUrl,
} from "./integration/setup.js";

const userId = "719d75c4-7db9-44c1-9df0-17db760f202c";
const validCredentials = {
  email: "user-a@example.test",
  password: "correct horse battery staple",
};

describe("private email and password API", () => {
  it("signs in a private UUID account through the auth handler", async () => {
    const app = await createTestApp();

    try {
      const response = await signIn(app, validCredentials);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        user: { id: userId, email: validCredentials.email, name: "User A" },
      });
    } finally {
      await app.close();
    }
  });

  it("normalizes unknown-email and wrong-password responses", async () => {
    const app = await createTestApp();

    try {
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
      expect(unknownEmail.json()).toEqual({
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
      });
    } finally {
      await app.close();
    }
  });

  it("forbids public email signup", async () => {
    const app = await createTestApp();

    try {
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
    } finally {
      await app.close();
    }
  });

  it("rejects a private route without a session", async () => {
    const app = await createTestApp();
    app.get("/api/test-private", async (request) => ({
      user: await requireUser(request),
    }));

    try {
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
    } finally {
      await app.close();
    }
  });
});

describe("auth origin configuration", () => {
  it("allows Expo wildcard origins only in development", () => {
    expect(
      buildTrustedOrigins({
        nodeEnv: "development",
        authSecret: "development secret",
        appUrl: "http://127.0.0.1:4000",
        clientOrigins: ["http://localhost:8081", "exp://**"],
      }),
    ).toContain("exp://**");

    expect(() =>
      buildTrustedOrigins({
        nodeEnv: "production",
        authSecret: "production-secret-that-is-at-least-thirty-two-characters",
        appUrl: "https://biteiq.example.test",
        clientOrigins: ["https://biteiq.example.test", "exp://**"],
      }),
    ).toThrow("Expo wildcard origins are not allowed in production");
  });

  it("rejects a production CLIENT_ORIGINS Expo wildcard", () => {
    expect(() =>
      loadConfig({
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://biteiq:secret@postgres/biteiq",
        AUTH_SECRET: "production-secret-that-is-at-least-thirty-two-characters",
        APP_URL: "https://biteiq.example.test",
        CLIENT_ORIGINS: "https://biteiq.example.test,exp://**",
      }),
    ).toThrow("Expo wildcard origins are not allowed in production");
  });
});

describe("integration database safety", () => {
  it("accepts only an unmistakably local test database", () => {
    expect(
      validateTestDatabaseUrl(
        "postgresql://biteiq:biteiq@127.0.0.1:55432/biteiq_test",
      ),
    ).toBe("postgresql://biteiq:biteiq@127.0.0.1:55432/biteiq_test");

    for (const unsafeUrl of [
      "postgresql://biteiq:biteiq@127.0.0.1:55432/biteiq",
      "postgresql://biteiq:biteiq@db.internal:5432/biteiq_test",
      "postgresql://biteiq:biteiq@127.0.0.1:5432/biteiq_test",
    ]) {
      expect(() => validateTestDatabaseUrl(unsafeUrl)).toThrow(
        "Refusing unsafe integration database",
      );
    }
  });

  it("refuses an unsafe pool before issuing TRUNCATE", async () => {
    const query = vi.fn();
    const unsafePool = {
      options: {
        host: "db.internal",
        port: 5432,
        database: "biteiq",
      },
      query,
    } as unknown as Pool;

    await expect(truncateIntegrationDatabase(unsafePool)).rejects.toThrow(
      "Refusing unsafe integration database",
    );
    expect(query).not.toHaveBeenCalled();
  });

  it("accepts a pg Pool configured with the validated test URL", async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const safePool = {
      options: {
        connectionString:
          "postgresql://biteiq:biteiq@127.0.0.1:55432/biteiq_test",
      },
      query,
    } as unknown as Pool;

    await truncateIntegrationDatabase(safePool);

    expect(query).toHaveBeenCalledOnce();
  });
});

describe("server resource cleanup", () => {
  it("closes the database even when Fastify shutdown fails", async () => {
    const close = vi.fn().mockRejectedValue(new Error("close failed"));
    const end = vi.fn().mockResolvedValue(undefined);

    await expect(
      closeServerResources({ close }, { end }),
    ).rejects.toThrow("close failed");
    expect(end).toHaveBeenCalledOnce();
  });

  it("closes Fastify and the database when startup fails", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const end = vi.fn().mockResolvedValue(undefined);
    const listen = vi.fn().mockRejectedValue(new Error("listen failed"));

    await expect(
      startServer(testServerConfig(), {
        createDb: () => ({ $client: { end } }) as never,
        createAuth: () => ({}) as never,
        buildApp: async () => ({ close, listen, log: { info: vi.fn() } }) as never,
      }),
    ).rejects.toThrow("listen failed");

    expect(close).toHaveBeenCalledOnce();
    expect(end).toHaveBeenCalledOnce();
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

async function createTestApp() {
  const auth = {
    handler: async (request: Request) => {
      const body = await request.json() as { email: string; password: string };
      if (body.email !== validCredentials.email) {
        return Response.json(
          { code: "USER_NOT_FOUND", message: "User not found" },
          { status: 401 },
        );
      }
      if (body.password !== validCredentials.password) {
        return Response.json(
          { code: "BAD_PASSWORD", message: "Wrong password" },
          { status: 401 },
        );
      }

      return Response.json({
        user: { id: userId, email: validCredentials.email, name: "User A" },
      });
    },
    api: {
      getSession: async () => null,
    },
  } as unknown as BetterAuthInstance;

  return buildApp({ logger: false, auth: auth as never });
}

async function signIn(
  app: Awaited<ReturnType<typeof buildApp>>,
  credentials: { email: string; password: string },
) {
  return app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: credentials,
  });
}

function testServerConfig(): ServerConfig {
  return {
    nodeEnv: "test",
    host: "127.0.0.1",
    port: 0,
    databaseUrl: "postgresql://biteiq:biteiq@127.0.0.1:55432/biteiq_test",
    authSecret: "test-secret-that-is-at-least-thirty-two-characters",
    appUrl: "http://127.0.0.1:4000",
    clientOrigins: ["http://localhost:8081"],
  };
}
