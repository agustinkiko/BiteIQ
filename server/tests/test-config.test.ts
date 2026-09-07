import { describe, expect, test } from "vitest";
import unitTestConfig from "../vitest.config";

describe("unit test configuration", () => {
  test("excludes PostgreSQL integration tests from the unit suite", () => {
    expect(unitTestConfig.test?.exclude).toContain("tests/integration/**");
  });
});
