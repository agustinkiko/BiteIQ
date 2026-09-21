const { getDefaultConfig } = require("expo/metro-config");

const zustandWebEntries = new Map([
  ["zustand", require.resolve("zustand")],
  ["zustand/middleware", require.resolve("zustand/middleware")],
  ["zustand/vanilla", require.resolve("zustand/vanilla")]
]);

// eslint-disable-next-line no-undef
const config = getDefaultConfig(__dirname);

config.resolver.unstable_enablePackageExports = true;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const zustandWebEntry = platform === "web" ? zustandWebEntries.get(moduleName) : undefined;

  if (zustandWebEntry) {
    return { filePath: zustandWebEntry, type: "sourceFile" };
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
