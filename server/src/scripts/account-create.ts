import { pathToFileURL } from "node:url";

import { createAuth } from "../auth/auth.js";
import { readConfirmedPassword } from "../auth/password-prompt.js";
import type { AuthConfig } from "../auth/types.js";
import { loadConfig, type ServerConfig } from "../config.js";
import { createDb, type BiteIqDatabase } from "../db/client.js";

type CreateAccountArguments = {
  email: string;
  name: string;
};

export function parseCreateAccountArguments(
  arguments_: string[],
): CreateAccountArguments {
  rejectPasswordArgument(arguments_);
  const values = parseNamedArguments(arguments_, ["email", "name"]);
  const email = values.get("email")?.trim();
  const name = values.get("name")?.trim();

  if (!email || !name) {
    throw new Error("Usage: account:create -- --email <email> --name <name>");
  }

  return { email, name };
}

export async function createPrivateAccount(
  db: BiteIqDatabase,
  config: AuthConfig,
  input: CreateAccountArguments,
  password: string,
): Promise<{ id: string }> {
  const auth = createAuth(db, config);
  const result = await auth.api.createUser({
    body: {
      email: input.email,
      name: input.name,
      password,
    },
  });

  return { id: result.user.id };
}

async function main(): Promise<void> {
  const input = parseCreateAccountArguments(process.argv.slice(2));
  const password = await readConfirmedPassword();
  const config = loadConfig(process.env);
  const db = createDb(config.databaseUrl);

  try {
    const account = await createPrivateAccount(
      db,
      toAuthConfig(config),
      input,
      password,
    );
    process.stdout.write(`${account.id}\n`);
  } finally {
    await db.$client.end();
  }
}

function rejectPasswordArgument(arguments_: string[]): void {
  if (
    arguments_.some(
      (argument) => argument === "--password" || argument.startsWith("--password="),
    )
  ) {
    throw new Error("Passwords must not be passed as arguments");
  }
}

function parseNamedArguments(
  arguments_: string[],
  allowedNames: string[],
): Map<string, string> {
  const allowed = new Set(allowedNames);
  const result = new Map<string, string>();

  for (let index = 0; index < arguments_.length; index += 2) {
    const option = arguments_[index];
    const value = arguments_[index + 1];
    const name = option?.startsWith("--") ? option.slice(2) : "";

    if (!allowed.has(name) || !value || value.startsWith("--")) {
      throw new Error(`Unknown or incomplete argument: ${option ?? ""}`);
    }
    if (result.has(name)) {
      throw new Error(`Argument supplied more than once: --${name}`);
    }

    result.set(name, value);
  }

  return result;
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
    const message = error instanceof Error ? error.message : "Account creation failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
