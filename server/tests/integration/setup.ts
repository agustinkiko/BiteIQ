import { fileURLToPath, pathToFileURL } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import { createDb } from "../../src/db/client.js";

export const integrationDatabaseUrl =
  validateTestDatabaseUrl(
    process.env.TEST_DATABASE_URL ??
      "postgresql://biteiq:biteiq@127.0.0.1:55432/biteiq_test",
  );

export function validateTestDatabaseUrl(databaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("Refusing unsafe integration database: invalid URL");
  }

  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  const isSafe = parsed.protocol === "postgresql:"
    && parsed.hostname === "127.0.0.1"
    && parsed.port === "55432"
    && databaseName.endsWith("_test");

  if (!isSafe) {
    throw new Error(
      "Refusing unsafe integration database: use 127.0.0.1:55432 and a database ending in _test",
    );
  }

  return databaseUrl;
}

export function createIntegrationPool(): Pool {
  return new Pool({ connectionString: integrationDatabaseUrl });
}

export async function truncateIntegrationDatabase(pool: Pool): Promise<void> {
  assertSafePool(pool);
  await pool.query(`
    TRUNCATE TABLE
      daily_nutrition_summaries,
      food_entries,
      diary_days,
      food_external_sources,
      food_nutrients,
      food_servings,
      food_aliases,
      foods,
      nutrient_definitions,
      user_goals,
      user_profiles,
      verification,
      account,
      session,
      "user"
    RESTART IDENTITY CASCADE
  `);
}

export async function prepareIntegrationDatabase(
  databaseUrl: string = integrationDatabaseUrl,
): Promise<void> {
  const safeUrl = validateTestDatabaseUrl(databaseUrl);
  const target = new URL(safeUrl);
  const databaseName = decodeURIComponent(target.pathname.slice(1));
  const maintenanceUrl = new URL(safeUrl);
  maintenanceUrl.pathname = "/postgres";
  const maintenancePool = new Pool({ connectionString: maintenanceUrl.toString() });

  try {
    const existing = await maintenancePool.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );
    if (existing.rowCount === 0) {
      const quotedName = `"${databaseName.replaceAll('"', '""')}"`;
      await maintenancePool.query(`CREATE DATABASE ${quotedName}`);
    }
  } finally {
    await maintenancePool.end();
  }

  const db = createDb(safeUrl);
  try {
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../../migrations", import.meta.url)),
    });
  } finally {
    await db.$client.end();
  }
}

function assertSafePool(pool: Pool): void {
  const connectionString = (
    pool.options as typeof pool.options & { connectionString?: string }
  ).connectionString;
  if (connectionString) {
    validateTestDatabaseUrl(connectionString);
    return;
  }

  const host = pool.options.host;
  const port = pool.options.port;
  const database = pool.options.database;

  if (
    host !== "127.0.0.1"
    || port !== 55432
    || typeof database !== "string"
    || !database.endsWith("_test")
  ) {
    throw new Error(
      "Refusing unsafe integration database: pool is not the dedicated local test database",
    );
  }
}

const invokedPath = process.argv[1];
if (invokedPath && import.meta.url === pathToFileURL(invokedPath).href) {
  void prepareIntegrationDatabase().catch((error: unknown) => {
    const message = error instanceof Error
      ? error.message
      : "Unable to prepare integration database";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
