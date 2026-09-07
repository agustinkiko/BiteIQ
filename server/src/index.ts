import { buildApp } from "./app.js";
import { createAuth } from "./auth/auth.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";

const config = loadConfig(process.env);
const db = createDb(config.databaseUrl);
const auth = createAuth(db, config);
const app = await buildApp({ auth });

let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  app.log.info({ signal }, "shutting down API");
  await app.close();
  await db.$client.end();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));

try {
  await app.listen({ host: config.host, port: config.port });
} catch (error) {
  app.log.error({ err: error }, "unable to start API");
  process.exit(1);
}
