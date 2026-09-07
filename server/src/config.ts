import { z } from "zod";

export type ServerConfig = {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  databaseUrl: string;
  authSecret: string;
  appUrl: string;
  clientOrigins: string[];
  usdaApiKey?: string;
};

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().trim().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
  APP_URL: z.string().url("APP_URL must be a valid URL"),
  CLIENT_ORIGINS: z.string().default("http://localhost:8081"),
  USDA_FDC_API_KEY: z.string().trim().optional(),
});

export function loadConfig(env: NodeJS.ProcessEnv): ServerConfig {
  const parsed = environmentSchema.safeParse(env);

  if (!parsed.success) {
    throw new Error(
      `Invalid server configuration: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`,
    );
  }

  const { NODE_ENV, HOST, PORT, DATABASE_URL, AUTH_SECRET, APP_URL, CLIENT_ORIGINS, USDA_FDC_API_KEY } = parsed.data;
  const clientOrigins = CLIENT_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean);

  if (clientOrigins.length === 0) {
    throw new Error("Invalid server configuration: CLIENT_ORIGINS must include at least one origin");
  }

  if (NODE_ENV === "production" && AUTH_SECRET.length < 32) {
    throw new Error("Invalid server configuration: AUTH_SECRET must be at least 32 characters in production");
  }

  if (
    NODE_ENV === "production"
    && clientOrigins.some(isExpoWildcardOrigin)
  ) {
    throw new Error(
      "Invalid server configuration: Expo wildcard origins are not allowed in production",
    );
  }

  return {
    nodeEnv: NODE_ENV,
    host: HOST,
    port: PORT,
    databaseUrl: DATABASE_URL,
    authSecret: AUTH_SECRET,
    appUrl: APP_URL,
    clientOrigins,
    ...(USDA_FDC_API_KEY ? { usdaApiKey: USDA_FDC_API_KEY } : {}),
  };
}

function isExpoWildcardOrigin(origin: string): boolean {
  const normalized = origin.toLowerCase();
  return (normalized.startsWith("exp://") || normalized.startsWith("expo://"))
    && (normalized.includes("*") || normalized.includes("?"));
}
