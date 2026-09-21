export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type CaptureMode = "photo" | "barcode" | "label" | "text" | "voice" | "search" | "quick";

export type ProvenanceSource =
  | "ai_vision"
  | "ocr"
  | "barcode_lookup"
  | "nutrition_database"
  | "user_correction"
  | "manual_entry"
  | "assistant_reasoning";

export type AITask =
  | "ocrExtraction"
  | "barcodeInterpretation"
  | "mealPhotoRecognition"
  | "nutritionLabelParsing"
  | "naturalLanguageMealParsing"
  | "portionEstimation"
  | "nutritionEstimation"
  | "assistantChatReasoning";

export type ProviderType = "mock" | "local-codex" | "local-claude" | "hosted";

export type RetryPolicy = {
  maxAttempts: number;
  backoffMs: number;
};

export type ModelProviderConfig = {
  id: string;
  providerType: ProviderType;
  label: string;
  baseUrl: string;
  modelName: string;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  enabledTasks: AITask[];
};

export type Sex = "female" | "male" | "unspecified";

export type User = {
  id: string;
  name: string;
  activityLevel: "low" | "moderate" | "high";
  dietaryPreferences: string[];
  timezone: string;
  sex?: Sex;
  birthYear?: number;
  heightCm?: number;
};

export type Goal = {
  calories: number;
  proteinGrams: number;
  carbGrams: number;
  fatGrams: number;
  waterMl: number;
  startWeightKg?: number;
  goalWeightKg?: number;
  weeklyRateKg?: number;
};

export type MeasurementSystem = "metric" | "imperial";
export type GoalType = "lose" | "maintain" | "gain";
export type GoalActivityLevel =
  | "sedentary"
  | "lightly_active"
  | "moderately_active"
  | "very_active"
  | "extremely_active";
export type GoalTargetMode = "percentage" | "grams";
export type GoalWarning = "EXTREME_RATE" | "LOW_CALORIE_TARGET";

export type ProfileInput = {
  displayName: string;
  dateOfBirth: string;
  biologicalSex: Sex;
  heightCm: number;
  countryCode: string;
  timezone: string;
  languageCode: string;
  measurementSystem: MeasurementSystem;
};

export type UserProfile = Omit<ProfileInput, "heightCm"> & {
  heightCm: string | number;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type GoalInput = {
  goalType: GoalType;
  startingWeightKg: number;
  currentWeightKg: number;
  targetWeightKg: number;
  weeklyRateKg: number;
  activityLevel: GoalActivityLevel;
  plannedExerciseInActivity: boolean;
  targetMode: GoalTargetMode;
  macros: {
    protein: number;
    carbohydrate: number;
    fat: number;
  };
  manualCalorieTargetKcal?: number;
};

export type CalculatedGoal = {
  equation: "mifflin_st_jeor";
  equationInputs: {
    biologicalSex: Sex;
    weightKg: number;
    heightCm: number;
    age: number;
    activityLevel: GoalActivityLevel;
    timezone: string;
    calculationDate: string;
    macros?: GoalInput["macros"];
    manualCalorieTargetKcal?: number | null;
  };
  bmrKcal: string;
  activityMultiplier: string;
  tdeeKcal: string;
  calorieAdjustmentKcal: string;
  calorieTargetKcal: string;
  proteinTargetG: string;
  carbohydrateTargetG: string;
  fatTargetG: string;
  isManualCalorieTarget: boolean;
  warnings: GoalWarning[];
};

export type StoredGoal = {
  id?: string;
  userId?: string;
  goalType: GoalType;
  startingWeightKg: string | number;
  currentWeightKg: string | number;
  targetWeightKg: string | number;
  weeklyRateKg: string | number;
  activityLevel: GoalActivityLevel;
  plannedExerciseInActivity: boolean;
  equation: "mifflin_st_jeor";
  equationInputs: CalculatedGoal["equationInputs"];
  bmrKcal: string;
  activityMultiplier: string;
  tdeeKcal: string;
  calorieAdjustmentKcal: string;
  calorieTargetKcal: string;
  proteinTargetG: string;
  carbohydrateTargetG: string;
  fatTargetG: string;
  targetMode: GoalTargetMode;
  isManualCalorieTarget: boolean;
  warnings?: GoalWarning[];
  createdAt?: string;
  updatedAt?: string;
};

/** Nutrition for a concrete amount of food, not a per-100g rate. */
export type NutritionEstimate = {
  calories: number;
  proteinGrams: number;
  carbGrams: number;
  fatGrams: number;
  fiberGrams?: number;
  sugarGrams?: number;
  sodiumMg?: number;
  saturatedFatGrams?: number;
  cholesterolMg?: number;
  potassiumMg?: number;
  provenance: ProvenanceSource[];
};

/** Nutrition per 100 g: the normalized form stored in the food database. */
export type Nutrients100g = {
  calories: number;
  proteinGrams: number;
  carbGrams: number;
  fatGrams: number;
  fiberGrams?: number;
  sugarGrams?: number;
  sodiumMg?: number;
  saturatedFatGrams?: number;
  cholesterolMg?: number;
  potassiumMg?: number;
};

export type ServingOption = {
  id: string;
  label: string;
  grams: number;
  milliliters?: number;
  unit?: "serving" | "g" | "ml";
  quantity?: number;
  isDefault?: boolean;
  source?: string;
  sourceServingId?: string;
};

export type FoodCategory =
  | "protein"
  | "grain"
  | "vegetable"
  | "fruit"
  | "dairy"
  | "snack"
  | "beverage"
  | "condiment"
  | "prepared"
  | "restaurant";

export type FoodSourceId = "local" | "openfoodfacts" | "usda" | "fatsecret";

export type FoodDataQuality =
  | "verified_authoritative"
  | "verified_manufacturer"
  | "community"
  | "user_created"
  | "unverified";

export type FoodSourceDetails = {
  provider: string;
  externalId: string;
  datasetType: string | null;
  providerUpdatedAt: string | null;
  importedAt: string;
  verificationState: FoodDataQuality;
  attribution: string | null;
  licenseCategory: string | null;
};

export type FoodSearchWarning = {
  code: "NUTRITION_PROVIDER_UNAVAILABLE";
  provider: string;
  message: string;
};

export type FoodSelection = {
  foodId: string;
  servingId: string;
  quantity: number;
};

export type FoodDevelopmentFeatures = {
  bundledFoods: boolean;
  localAdd: boolean;
};

export type DatabaseFood = {
  /** Namespaced by source for everything but the bundled table, e.g. `off:737628064502`. */
  id: string;
  name: string;
  brand?: string;
  category: FoodCategory;
  barcode?: string;
  verified?: boolean;
  source: FoodSourceId;
  sourceDetails?: FoodSourceDetails;
  dataQuality?: FoodDataQuality;
  preparationState?: string;
  nutritionBasisUnit?: "g" | "ml";
  developmentExample?: boolean;
  per100g: Nutrients100g;
  /** First serving is the default selection. */
  servings: ServingOption[];
};

export type FoodSourceSettings = {
  enabled: boolean;
  /** Optional self-hosted or server-proxy endpoint. */
  baseUrl?: string;
};

export type FoodSourceConfig = Record<Exclude<FoodSourceId, "local">, FoodSourceSettings>;

export type FoodItem = {
  id: string;
  name: string;
  brand?: string;
  /** Label of the chosen serving, e.g. "1 cup (240 g)". */
  servingSize: string;
  /** Number of servings logged. */
  quantity: number;
  /** Total grams logged, when the food came from a gram-based source. */
  grams?: number;
  sourceFoodId?: string;
  servingId?: string;
  /** Totals for `quantity` servings, not per serving. */
  nutrition: NutritionEstimate;
  confidence: number;
  provenance: ProvenanceSource[];
};

export type MealEntry = {
  id: string;
  foodItem: FoodItem;
  userEdited: boolean;
  notes?: string;
};

export type AIInference = {
  id: string;
  task: AITask;
  providerId: string;
  modelName: string;
  confidence: number;
  summary: string;
  clarifyingQuestions: string[];
  createdAt: string;
};

export type CorrectionFeedback = {
  id: string;
  mealId: string;
  field: string;
  previousValue: string | number;
  correctedValue: string | number;
  createdAt: string;
};

/**
 * A logged group of food in one diary slot. AI captures produce a multi-entry
 * meal carrying an `inference`; a food picked from the database produces a
 * single-entry meal with no inference.
 */
export type Meal = {
  id: string;
  title: string;
  mealType: MealType;
  capturedWith: CaptureMode;
  capturedAt: string;
  entries: MealEntry[];
  inference?: AIInference;
  photoUri?: string;
  notes?: string;
};

export type ExerciseKind = "cardio" | "strength";

export type ExerciseEntry = {
  id: string;
  name: string;
  kind: ExerciseKind;
  minutes: number;
  caloriesBurned: number;
  createdAt: string;
};

export type DailyLog = {
  /** ISO date, YYYY-MM-DD, in the device's local timezone. */
  date: string;
  meals: Meal[];
  waterMl: number;
  exercises: ExerciseEntry[];
  steps?: number;
  notes?: string;
};

export type WeightEntry = {
  id: string;
  date: string;
  weightKg: number;
  createdAt: string;
};

export type RecentFood = {
  foodId: string;
  useCount: number;
  lastUsedAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
