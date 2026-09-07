process.env.EXPO_PUBLIC_API_URL = "https://biteiq.test/api";

module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1"
  },
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/server/"]
};
