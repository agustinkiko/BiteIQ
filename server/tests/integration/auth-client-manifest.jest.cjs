/* eslint-disable @typescript-eslint/no-require-imports */
/* global require */

const NativeModules = require(
  "react-native/Libraries/BatchedBridge/NativeModules",
);
const { expo } = require("../../../app.json");
const exponentConstants =
  globalThis.expo?.modules?.ExponentConstants
  ?? NativeModules.NativeUnimoduleProxy?.modulesConstants?.ExponentConstants;

if (!exponentConstants) {
  throw new Error("Jest Expo did not provide ExponentConstants");
}

Object.assign(exponentConstants, {
  executionEnvironment: "bare",
  manifest: expo,
});
