process.env.EXPO_PUBLIC_API_URL = "https://biteiq.test/api";

module.exports = {
  preset: "jest-expo",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1"
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|expo-.*|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-reanimated|better-auth|@better-auth/.*|@better-fetch/.*|nanostores)/)"
  ],
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/server/"]
};
