import { getFoodById } from "@/data/foodDatabase";
import { todayKey } from "@/services/dates";
import { buildDatabaseMeal } from "@/services/foodEntry";
import {
  DailyLog,
  FoodDevelopmentFeatures,
  FoodSourceConfig,
  Goal,
  MealType,
  ModelProviderConfig,
  User
} from "@/types/domain";

export function createFoodDevelopmentFeatures(isDevelopment: boolean): FoodDevelopmentFeatures {
  return {
    bundledFoods: isDevelopment,
    localAdd: isDevelopment
  };
}

export function currentFoodDevelopmentFeatures(): FoodDevelopmentFeatures {
  return createFoodDevelopmentFeatures(typeof __DEV__ !== "undefined" && __DEV__);
}

export const defaultUser: User = {
  id: "user-local",
  name: "Alex",
  activityLevel: "moderate",
  dietaryPreferences: ["high protein"],
  timezone: "local",
  sex: "unspecified",
  heightCm: 175
};

export const defaultGoal: Goal = {
  calories: 2200,
  proteinGrams: 160,
  carbGrams: 230,
  fatGrams: 70,
  waterMl: 2400,
  weeklyRateKg: -0.5
};

export const waterServingMl = 240;

/**
 * Legacy barcode-source toggles contain no credentials. Canonical food search
 * and all USDA access go through the authenticated BiteIQ API.
 */
export const defaultFoodSourceConfig: FoodSourceConfig = {
  openfoodfacts: { enabled: false },
  usda: { enabled: false },
  fatsecret: { enabled: false }
};

/**
 * First-run demo data so the dashboard is not empty before the first log.
 * Persisted state replaces this entirely on every subsequent launch.
 */
export function seedLogs(): Record<string, DailyLog> {
  if (!currentFoodDevelopmentFeatures().bundledFoods) return {};
  const date = todayKey();
  const seeds: [foodId: string, quantity: number, mealType: MealType][] = [
    ["egg-whole", 2, "breakfast"],
    ["whole-wheat-bread", 1, "breakfast"],
    ["greek-yogurt-nonfat", 1, "breakfast"],
    ["chicken-breast", 1, "lunch"],
    ["brown-rice", 1, "lunch"],
    ["broccoli", 1, "lunch"]
  ];

  const meals = seeds
    .map(([foodId, quantity, mealType]) => {
      const food = getFoodById(foodId);
      return food ? buildDatabaseMeal(food, food.servings[0].id, quantity, mealType, date) : undefined;
    })
    .filter((meal): meal is NonNullable<typeof meal> => Boolean(meal));

  return { [date]: { date, meals, waterMl: waterServingMl * 3, exercises: [] } };
}

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
