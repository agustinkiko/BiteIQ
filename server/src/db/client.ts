import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index.js";

function connect(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  // pg removes failed idle clients itself. Handle its error event so a database
  // restart does not terminate the API or dump connection credentials to logs.
  pool.on("error", () => {
    process.stderr.write("BiteIQ: idle database connection lost; pool will reconnect.\n");
  });
  return drizzle(pool, { schema });
}

export type BiteIqDatabase = ReturnType<typeof connect>;

export function createDb(databaseUrl: string): BiteIqDatabase {
  return connect(databaseUrl);
}
