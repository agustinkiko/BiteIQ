import { expo } from "@better-auth/expo";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";

import type { BiteIqDatabase } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import type { AuthConfig } from "./types.js";

export function createAuth(db: BiteIqDatabase, config: AuthConfig) {
  const trustedOrigins = buildTrustedOrigins(config);

  return betterAuth({
    appName: "BiteIQ",
    baseURL: config.appUrl,
    secret: config.authSecret,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
    },
    trustedOrigins,
    logger: { level: "error" },
    advanced: {
      database: { generateId: "uuid" },
      disableOriginCheck: false,
      disableCSRFCheck: false,
      useSecureCookies: config.nodeEnv === "production",
    },
    plugins: [
      expo(),
      admin({
        ...(config.administrativeUserIds
          ? { adminUserIds: config.administrativeUserIds }
          : {}),
      }),
    ],
  });
}

export function buildTrustedOrigins(config: AuthConfig): string[] {
  if (
    config.nodeEnv === "production"
    && config.clientOrigins.some(isExpoWildcardOrigin)
  ) {
    throw new Error("Expo wildcard origins are not allowed in production");
  }

  return [
    ...config.clientOrigins,
    "biteiq://",
    ...(config.nodeEnv === "development" ? ["exp://**"] : []),
  ];
}

function isExpoWildcardOrigin(origin: string): boolean {
  const normalized = origin.toLowerCase();
  return (normalized.startsWith("exp://") || normalized.startsWith("expo://"))
    && (normalized.includes("*") || normalized.includes("?"));
}

export type BiteIqAuth = ReturnType<typeof createAuth>;
