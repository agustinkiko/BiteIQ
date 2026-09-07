import type { Auth } from "better-auth";

export type AuthConfig = {
  nodeEnv: "development" | "test" | "production";
  authSecret: string;
  appUrl: string;
  clientOrigins: string[];
  administrativeUserIds?: string[];
};

export type BetterAuthInstance = Auth;

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
};
