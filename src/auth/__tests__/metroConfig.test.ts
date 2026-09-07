import path from "path";

describe("Metro configuration", () => {
  it("enables package exports for exported auth client entry points", () => {
    const configPath = path.resolve(__dirname, "../../../metro.config.js");
    let metroConfig: { resolver?: { unstable_enablePackageExports?: boolean } } | undefined;

    expect(() => {
      // Load the same project-level configuration Metro uses for Expo builds.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      metroConfig = require(configPath);
    }).not.toThrow();
    expect(metroConfig?.resolver?.unstable_enablePackageExports).toBe(true);
  });
});
