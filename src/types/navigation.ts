import { Meal, MealType, CaptureMode } from "@/types/domain";

export type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: undefined;
  AddMeal: {
    preferredMode?: CaptureMode;
    mealType?: MealType;
  } | undefined;
  AIReview: {
    draftId: string;
  };
  MealDetail: {
    mealId: string;
  };
};

export type MainTabParamList = {
  Home: undefined;
  History: undefined;
  Assistant: undefined;
  Settings: undefined;
};

export type MealDraft = Pick<Meal, "title" | "mealType" | "capturedWith" | "entries" | "inference" | "photoUri" | "notes"> & {
  draftId: string;
};
