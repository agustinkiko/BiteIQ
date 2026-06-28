export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export type CaptureMode = "photo" | "barcode" | "label" | "text" | "voice";

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
  apiKey?: string;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  enabledTasks: AITask[];
};

export type User = {
  id: string;
  name: string;
  activityLevel: "low" | "moderate" | "high";
  dietaryPreferences: string[];
  timezone: string;
};

export type Goal = {
  calories: number;
  proteinGrams: number;
  carbGrams: number;
  fatGrams: number;
};

export type NutritionEstimate = {
  calories: number;
  proteinGrams: number;
  carbGrams: number;
  fatGrams: number;
  fiberGrams?: number;
  sugarGrams?: number;
  sodiumMg?: number;
  provenance: ProvenanceSource[];
};

export type FoodItem = {
  id: string;
  name: string;
  brand?: string;
  servingSize: string;
  quantity: number;
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

export type Meal = {
  id: string;
  title: string;
  mealType: MealType;
  capturedWith: CaptureMode;
  capturedAt: string;
  entries: MealEntry[];
  inference: AIInference;
  photoUri?: string;
  notes?: string;
};

export type DailyLog = {
  date: string;
  meals: Meal[];
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};
