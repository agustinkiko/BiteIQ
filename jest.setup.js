require("@testing-library/jest-native/extend-expect");

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Reanimated's worklets don't run under Jest. The official mock renders the
// final frame immediately; reduced motion keeps count-up numbers at their target.
jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  ...require("react-native-reanimated/mock"),
  useReducedMotion: () => true
}));
