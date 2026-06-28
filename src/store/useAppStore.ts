import { create } from "zustand";

import { defaultGoal, defaultProviderConfig, defaultUser } from "@/config/defaults";
import { ChatMessage, CorrectionFeedback, DailyLog, Goal, Meal, ModelProviderConfig, User } from "@/types/domain";
import { MealDraft } from "@/types/navigation";

type AppState = {
  hasCompletedOnboarding: boolean;
  user: User;
  goal: Goal;
  logs: DailyLog[];
  drafts: Record<string, MealDraft>;
  correctionFeedback: CorrectionFeedback[];
  providerConfig: ModelProviderConfig;
  chatMessages: ChatMessage[];
  completeOnboarding: (user: User, goal: Goal) => void;
  updateGoal: (goal: Goal) => void;
  upsertProviderConfig: (config: ModelProviderConfig) => void;
  saveDraft: (draft: MealDraft) => void;
  updateDraft: (draftId: string, patch: Partial<MealDraft>) => void;
  commitDraft: (draftId: string) => Meal | undefined;
  addMeal: (meal: Meal) => void;
  addChatMessage: (message: ChatMessage) => void;
};

const todayKey = () => new Date().toISOString().slice(0, 10);

export const useAppStore = create<AppState>((set, get) => ({
  hasCompletedOnboarding: false,
  user: defaultUser,
  goal: defaultGoal,
  logs: [
    {
      date: todayKey(),
      meals: [
        seedMeal("meal-seed-1", "Eggs and toast", "breakfast", 410, 28, 32, 18),
        seedMeal("meal-seed-2", "Tuna wrap", "lunch", 520, 38, 58, 16)
      ]
    }
  ],
  drafts: {},
  correctionFeedback: [],
  providerConfig: defaultProviderConfig,
  chatMessages: [
    {
      id: "chat-welcome",
      role: "assistant",
      content: "Ask me about today's macros, meal ideas, or a food estimate.",
      createdAt: new Date().toISOString()
    }
  ],
  completeOnboarding: (user, goal) => set({ hasCompletedOnboarding: true, user, goal }),
  updateGoal: (goal) => set({ goal }),
  upsertProviderConfig: (providerConfig) => set({ providerConfig }),
  saveDraft: (draft) => set((state) => ({ drafts: { ...state.drafts, [draft.draftId]: draft } })),
  updateDraft: (draftId, patch) =>
    set((state) => {
      const draft = state.drafts[draftId];
      if (!draft) return state;
      return { drafts: { ...state.drafts, [draftId]: { ...draft, ...patch } } };
    }),
  commitDraft: (draftId) => {
    const draft = get().drafts[draftId];
    if (!draft) return undefined;

    const meal: Meal = {
      id: `meal-${Date.now()}`,
      title: draft.title,
      mealType: draft.mealType,
      capturedWith: draft.capturedWith,
      capturedAt: new Date().toISOString(),
      entries: draft.entries,
      inference: draft.inference,
      photoUri: draft.photoUri,
      notes: draft.notes
    };

    get().addMeal(meal);
    set((state) => {
      const nextDrafts = { ...state.drafts };
      delete nextDrafts[draftId];
      return { drafts: nextDrafts };
    });

    return meal;
  },
  addMeal: (meal) =>
    set((state) => {
      const date = meal.capturedAt.slice(0, 10);
      const existing = state.logs.find((log) => log.date === date);
      if (!existing) {
        return { logs: [{ date, meals: [meal] }, ...state.logs] };
      }
      return {
        logs: state.logs.map((log) => (log.date === date ? { ...log, meals: [meal, ...log.meals] } : log))
      };
    }),
  addChatMessage: (message) => set((state) => ({ chatMessages: [...state.chatMessages, message] }))
}));

function seedMeal(
  id: string,
  title: string,
  mealType: Meal["mealType"],
  calories: number,
  proteinGrams: number,
  carbGrams: number,
  fatGrams: number
): Meal {
  return {
    id,
    title,
    mealType,
    capturedWith: "text",
    capturedAt: new Date().toISOString(),
    inference: {
      id: `inf-${id}`,
      task: "naturalLanguageMealParsing",
      providerId: "mock-local",
      modelName: "macro-mind-mock",
      confidence: 0.92,
      summary: "Seed meal for demo dashboard",
      clarifyingQuestions: [],
      createdAt: new Date().toISOString()
    },
    entries: [
      {
        id: `entry-${id}`,
        userEdited: false,
        foodItem: {
          id: `food-${id}`,
          name: title,
          servingSize: "1 meal",
          quantity: 1,
          confidence: 0.92,
          provenance: ["manual_entry"],
          nutrition: {
            calories,
            proteinGrams,
            carbGrams,
            fatGrams,
            provenance: ["manual_entry"]
          }
        }
      }
    ]
  };
}
