import { expo } from "@better-auth/expo";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";

import type { BiteIqDatabase } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import type { AuthConfig } from "./types.js";

export function createAuth(db: BiteIqDatabase, config: AuthConfig) {
  const trustedOrigins = [
    ...config.clientOrigins,
    "biteiq://",
    ...(config.nodeEnv === "development" ? ["exp://**"] : []),
  ];

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

export type BiteIqAuth = ReturnType<typeof createAuth>;
