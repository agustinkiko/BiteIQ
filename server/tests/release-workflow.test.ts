import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, test } from "vitest";

const require = createRequire(new URL("../../package.json", import.meta.url));
const yaml = require("js-yaml");
const workflow = new URL("../../.github/workflows/deploy.yml", import.meta.url);

describe("release build contract", () => {
  test("publishes both AMD64 images with matching immutable release tags and a private API URL", () => {
    expect(existsSync(workflow), "release workflow must exist").toBe(true);
    const spec = yaml.load(readFileSync(workflow, "utf8"));
    expect(spec.permissions).toEqual({ contents: "read", packages: "write" });
    expect(spec.jobs.build.strategy.matrix.include).toEqual([
      { name: "api", dockerfile: "server/Dockerfile" },
      { name: "web", dockerfile: "deploy/web.Dockerfile" },
    ]);
    const steps = spec.jobs.build.steps;
    for (const step of steps.filter((step: any) => step.uses)) {
      expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
    }
    const build = steps.find((step: any) => step.uses.startsWith("docker/build-push-action@"));
    expect(build.with.platforms).toBe("linux/amd64");
    expect(build.with.context).toBe(".");
    expect(build.with.push).toBe(true);
    expect(build.with.tags).toBe("ghcr.io/agustinkiko/biteiq-${{ matrix.name }}:main-${{ github.sha }}-${{ github.run_number }}");
    expect(build.with["build-args"]).toBe("EXPO_PUBLIC_API_URL=https://biteiq.home.arpa/api");
  });
});
