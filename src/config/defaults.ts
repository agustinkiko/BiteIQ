import { Goal, ModelProviderConfig, User } from "@/types/domain";

export const defaultUser: User = {
  id: "user-local",
  name: "Alex",
  activityLevel: "moderate",
  dietaryPreferences: ["high protein"],
  timezone: "local"
};

export const defaultGoal: Goal = {
  calories: 2200,
  proteinGrams: 160,
  carbGrams: 230,
  fatGrams: 70
};

export const defaultProviderConfig: ModelProviderConfig = {
  id: "mock-local",
  providerType: "mock",
  label: "Mock AI",
  baseUrl: "local://mock",
  modelName: "macro-mind-mock",
  timeoutMs: 12000,
  retryPolicy: {
    maxAttempts: 2,
    backoffMs: 500
  },
  enabledTasks: [
    "ocrExtraction",
    "barcodeInterpretation",
    "mealPhotoRecognition",
    "nutritionLabelParsing",
    "naturalLanguageMealParsing",
    "portionEstimation",
    "nutritionEstimation",
    "assistantChatReasoning"
  ]
};

export const providerPresets: ModelProviderConfig[] = [
  defaultProviderConfig,
  {
    ...defaultProviderConfig,
    id: "local-codex",
    providerType: "local-codex",
    label: "Local Codex",
    baseUrl: "http://192.168.1.20:8787",
    modelName: "codex-local"
  },
  {
    ...defaultProviderConfig,
    id: "local-claude",
    providerType: "local-claude",
    label: "Local Claude",
    baseUrl: "http://192.168.1.20:8788",
    modelName: "claude-local"
  }
];
