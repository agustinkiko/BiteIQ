import { readFileSync } from "node:fs";

import { describe, expect, test } from "vitest";

import { loadConfig } from "../src/config.js";

function readBaseConfig(): string {
  return readFileSync(
    new URL("../../deploy/k8s/base/api-config.yaml", import.meta.url),
    "utf8",
  );
}

function configValue(configMap: string, key: string): string {
  const match = configMap.match(new RegExp(`^  ${key}: ["']?([^"'\\n]+)["']?$`, "m"));

  if (!match) {
    throw new Error(`Rendered biteiq-api-config is missing a non-empty ${key}`);
  }

  return match[1];
}

describe("K3s base configuration", () => {
  test("contains production URLs accepted by the API configuration", () => {
    const configMap = readBaseConfig();
    const appUrl = configValue(configMap, "APP_URL");
    const clientOrigins = configValue(configMap, "CLIENT_ORIGINS");

    expect(appUrl).toBe("https://biteiq.home.arpa");
    expect(clientOrigins).toBe("https://biteiq.home.arpa");
    expect(() => loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://biteiq:test@biteiq-postgres:5432/biteiq",
      AUTH_SECRET: "test-secret-with-at-least-32-characters",
      APP_URL: appUrl,
      CLIENT_ORIGINS: clientOrigins,
    })).not.toThrow();
  });
});
