import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://biteiq:biteiq@127.0.0.1:55432/biteiq",
  },
  strict: true,
  verbose: true,
});
