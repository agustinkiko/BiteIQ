import { pathToFileURL } from "node:url";

import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

import { buildApp } from "./app.js";
import { createAuth } from "./auth/auth.js";
import { loadConfig, type ServerConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { createNutritionRegistry } from "./providers/nutrition/registry.js";

type DatabaseClient = {
  end: () => Promise<void>;
};

type CloseableApp = Pick<FastifyInstance, "close">;

type ServerDependencies = {
  createDb: typeof createDb;
  createAuth: typeof createAuth;
  buildApp: typeof buildApp;
  createNutritionRegistry?: typeof createNutritionRegistry;
};

const defaultDependencies: ServerDependencies = {
  createDb,
  createAuth,
  buildApp,
  createNutritionRegistry,
};

export async function closeServerResources(
  app: CloseableApp | undefined,
  databaseClient: DatabaseClient,
): Promise<void> {
  try {
    await app?.close();
  } finally {
    await databaseClient.end();
  }
}

export async function startServer(
  config: ServerConfig,
  dependencies: ServerDependencies = defaultDependencies,
) {
  const db = dependencies.createDb(config.databaseUrl);
  let app: FastifyInstance | undefined;

  try {
    const auth = dependencies.createAuth(db, config);
    const nutritionProviders = (
      dependencies.createNutritionRegistry ?? createNutritionRegistry
    )(config);
    app = await dependencies.buildApp({
      auth,
      db,
      nutritionProviders,
      checkDatabaseHealth: async () => {
        await db.execute(sql`select 1`);
      },
    });
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    await closeServerResources(app, db.$client);
    throw error;
  }

  let shuttingDown = false;
  return {
    app,
    shutdown: async (signal: NodeJS.Signals): Promise<void> => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      app.log.info({ signal }, "shutting down API");
      await closeServerResources(app, db.$client);
    },
  };
}

async function main(): Promise<void> {
  const runtime = await startServer(loadConfig(process.env));

  const shutdown = (signal: NodeJS.Signals) => {
    void runtime.shutdown(signal).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Shutdown failed";
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unable to start API";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
