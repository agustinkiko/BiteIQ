import { CaptureMode, FoodItem, Goal, Meal, ModelProviderConfig, User } from "@/types/domain";

export type CaptureInput = {
  mode: CaptureMode;
  text?: string;
  imageUri?: string;
  barcode?: string;
  mealType?: "breakfast" | "lunch" | "dinner" | "snack";
};

export type AIProviderContext = {
  user: User;
  goal: Goal;
  todayMeals: Meal[];
  providerConfig: ModelProviderConfig;
};

export type AssistantChatInput = {
  message: string;
  context?: AIProviderContext;
};

export type StructuredAIResult<T> = {
  taskId: string;
  confidence: number;
  data: T;
  clarifyingQuestions: string[];
  provenance: string[];
  rawText?: string;
};

export type OCRExtraction = {
  text: string;
  fields: Array<{
    label: string;
    value: string;
    confidence: number;
  }>;
};

export type BarcodeInterpretation = {
  barcode: string;
  productName: string;
  brand?: string;
  servingSize: string;
  nutritionPerServing: {
    calories: number;
    proteinGrams: number;
    carbGrams: number;
    fatGrams: number;
  };
};

export type MealRecognition = {
  title: string;
  foods: Array<{
    name: string;
    servingSize: string;
    visualCue: string;
    confidence: number;
  }>;
};

export type NutritionLabelParse = {
  servingsPerContainer?: number;
  servingSize: string;
  calories: number;
  proteinGrams: number;
  carbGrams: number;
  fatGrams: number;
};

export type MealParseResult = {
  title: string;
  foods: FoodItem[];
  confidence: number;
  clarifyingQuestions: string[];
};

export type AssistantAnswer = {
  message: string;
  suggestedActions: string[];
  confidence: number;
};
