import { createHmac } from "node:crypto";
import { pathToFileURL } from "node:url";

import { eq } from "drizzle-orm";

import { createAuth } from "../auth/auth.js";
import { readConfirmedPassword } from "../auth/password-prompt.js";
import type { AuthConfig } from "../auth/types.js";
import { loadConfig, type ServerConfig } from "../config.js";
import { createDb, type BiteIqDatabase } from "../db/client.js";
import { user } from "../db/schema/index.js";

type ResetPasswordArguments = {
  email: string;
};

export function parseResetPasswordArguments(
  arguments_: string[],
): ResetPasswordArguments {
  if (
    arguments_.some(
      (argument) => argument === "--password" || argument.startsWith("--password="),
    )
  ) {
    throw new Error("Passwords must not be passed as arguments");
  }

  const email = arguments_[1]?.trim();
  if (
    arguments_.length !== 2 ||
    arguments_[0] !== "--email" ||
    !email ||
    email.startsWith("--")
  ) {
    throw new Error("Usage: account:reset-password -- --email <email>");
  }

  return { email };
}

export async function resetPrivateAccountPassword(
  db: BiteIqDatabase,
  config: AuthConfig,
  email: string,
  password: string,
): Promise<void> {
  const [existingUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email.toLowerCase()))
    .limit(1);

  if (!existingUser) {
    throw new Error("Account not found");
  }

  const auth = createAuth(db, {
    ...config,
    administrativeUserIds: [existingUser.id],
  });
  const context = await auth.$context;
  const administrativeSession = await context.internalAdapter.createSession(
    existingUser.id,
  );
  const cookie = signedSessionCookie(
    context.authCookies.sessionToken.name,
    administrativeSession.token,
    config.authSecret,
  );
  const headers = new Headers({ cookie });

  try {
    await auth.api.setUserPassword({
      body: { userId: existingUser.id, newPassword: password },
      headers,
    });
    await auth.api.revokeUserSessions({
      body: { userId: existingUser.id },
      headers,
    });
  } finally {
    await context.internalAdapter.deleteSession(administrativeSession.token);
  }
}

async function main(): Promise<void> {
  const input = parseResetPasswordArguments(process.argv.slice(2));
  const password = await readConfirmedPassword();
  const config = loadConfig(process.env);
  const db = createDb(config.databaseUrl);

  try {
    await resetPrivateAccountPassword(
      db,
      toAuthConfig(config),
      input.email,
      password,
    );
    process.stdout.write("Password reset and active sessions revoked.\n");
  } finally {
    await db.$client.end();
  }
}

function signedSessionCookie(name: string, token: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return `${name}=${encodeURIComponent(`${token}.${signature}`)}`;
}

function toAuthConfig(config: ServerConfig): AuthConfig {
  return {
    nodeEnv: config.nodeEnv,
    authSecret: config.authSecret,
    appUrl: config.appUrl,
    clientOrigins: config.clientOrigins,
  };
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Password reset failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
