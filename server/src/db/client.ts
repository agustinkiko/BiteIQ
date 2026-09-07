import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema/index.js";

function connect(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  return drizzle(pool, { schema });
}

export type BiteIqDatabase = ReturnType<typeof connect>;

export function createDb(databaseUrl: string): BiteIqDatabase {
  return connect(databaseUrl);
}
