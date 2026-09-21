import { CaptureMode, Meal, MealType } from "@/types/domain";
import { NavigatorScreenParams } from "@react-navigation/native";

export type RootStackParamList = {
  Onboarding: undefined;
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  AddMeal: {
    preferredMode?: CaptureMode;
    mealType?: MealType;
    date?: string;
  } | undefined;
  AIReview: {
    draftId: string;
  };
  MealDetail: {
    mealId: string;
    date: string;
  };
  FoodSearch: {
    mealType: MealType;
    date: string;
  };
  /**
   * Serving/quantity editor. `add` needs a `foodId` from the database; `edit`
   * needs the diary coordinates of an already-logged entry.
   */
  FoodDetail: {
    mode: "add" | "edit";
    date: string;
    mealType: MealType;
    foodId?: string;
    mealId?: string;
    entryId?: string;
  };
  QuickAdd: {
    date: string;
    mealType: MealType;
  };
  Nutrition: {
    date: string;
  };
  Exercise: {
    date: string;
  };
  Goals: undefined;
  Assistant: undefined;
  Settings: undefined;
};

export type MainTabParamList = {
  Home: undefined;
  Diary: undefined;
  AddCapture: undefined;
  Progress: undefined;
  More: undefined;
};

export type MealDraft = Pick<Meal, "title" | "mealType" | "capturedWith" | "entries" | "inference" | "photoUri" | "notes"> & {
  draftId: string;
};
