/* eslint-disable @typescript-eslint/no-require-imports */
/* global module, require */

const baseConfig = require("../../../jest.config.js");
const expoPreset = require("jest-expo/jest-preset");

module.exports = {
  ...baseConfig,
  rootDir: "../../..",
  roots: ["<rootDir>/server/tests/integration"],
  setupFiles: [
    ...expoPreset.setupFiles,
    "<rootDir>/server/tests/integration/auth-client-manifest.jest.cjs",
  ],
  moduleNameMapper: {
    ...baseConfig.moduleNameMapper,
    "^@better-auth/expo/client$":
      "<rootDir>/node_modules/@better-auth/expo/dist/client.cjs",
    "^better-auth/react$":
      "<rootDir>/node_modules/better-auth/dist/client/react/index.cjs",
  },
  testMatch: ["<rootDir>/server/tests/integration/auth-client-compat.jest.ts"],
  testPathIgnorePatterns: ["<rootDir>/node_modules/"],
};
