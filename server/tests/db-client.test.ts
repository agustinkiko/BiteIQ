import { describe, expect, test, vi } from "vitest";
import { createDb } from "../src/db/client.js";

describe("database connection recovery", () => {
  test("handles an idle connection loss without crashing or logging connection secrets", async () => {
    const db = createDb("postgresql://biteiq:never-log-this@127.0.0.1:1/biteiq");
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const error = Object.assign(new Error("terminating connection never-log-this"), {
        code: "57P01", client: { password: "never-log-this" },
      });
      expect(() => db.$client.emit("error", error, { password: "never-log-this" })).not.toThrow();
      const output = stderr.mock.calls.map(call => String(call[0])).join("");
      expect(output).toContain("idle database connection lost");
      expect(output).not.toContain("never-log-this");
    } finally {
      stderr.mockRestore();
      await db.$client.end();
    }
  });
});
