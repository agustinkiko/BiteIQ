import { createModelProvider } from "@/services/ai/providerRegistry";
import { CaptureInput } from "@/types/ai";
import { AIInference, MealEntry, MealType, ModelProviderConfig, User, Goal, Meal } from "@/types/domain";
import { MealDraft } from "@/types/navigation";

export async function buildMealDraft(params: {
  input: CaptureInput;
  user: User;
  goal: Goal;
  todayMeals: Meal[];
  providerConfig: ModelProviderConfig;
}): Promise<MealDraft> {
  const provider = createModelProvider(params.providerConfig);
  const result = await provider.estimateNutrition(params.input);
  const mealType = params.input.mealType || inferMealType();

  const inference: AIInference = {
    id: result.taskId,
    task: params.input.mode === "photo" ? "mealPhotoRecognition" : "nutritionEstimation",
    providerId: params.providerConfig.id,
    modelName: params.providerConfig.modelName,
    confidence: result.confidence,
    summary: `${result.data.foods.length} food item estimate`,
    clarifyingQuestions: [...result.clarifyingQuestions, ...result.data.clarifyingQuestions],
    createdAt: new Date().toISOString()
  };

  const entries: MealEntry[] = result.data.foods.map((foodItem) => ({
    id: `entry-${foodItem.id}`,
    foodItem,
    userEdited: false
  }));

  return {
    draftId: `draft-${Date.now()}`,
    title: result.data.title,
    mealType,
    capturedWith: params.input.mode,
    entries,
    inference,
    photoUri: params.input.imageUri,
    notes: params.input.text
  };
}

function inferMealType(): MealType {
  const hour = new Date().getHours();
  if (hour < 11) return "breakfast";
  if (hour < 15) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}
