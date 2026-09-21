import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { defaultFoodSourceConfig, defaultGoal, defaultProviderConfig, defaultUser } from "@/config/defaults";
import { localId } from "@/services/foodEntry";
import { shiftDateKey, todayKey } from "@/services/dates";
import {
  ChatMessage,
  CorrectionFeedback,
  DailyLog,
  DatabaseFood,
  AITask,
  ExerciseEntry,
  FoodItem,
  FoodSourceConfig,
  FoodSourceId,
  FoodSourceSettings,
  Goal,
  Meal,
  MealType,
  ModelProviderConfig,
  ProviderType,
  RecentFood,
  StoredGoal,
  User,
  UserProfile,
  WeightEntry
} from "@/types/domain";
import { MealDraft } from "@/types/navigation";

type AppState = {
  hasHydrated: boolean;
  hasCompletedOnboarding: boolean;
  /** Auth user whose server profile and goal are currently mirrored below. */
  serverStateUserId?: string;
  user: User;
  goal: Goal;
  /** Local preference until the server schema supports a water target. */
  waterGoalMl: number;
  /** Diary days keyed by local YYYY-MM-DD. */
  logs: Record<string, DailyLog>;
  /** The day every diary/dashboard surface is currently showing. */
  selectedDate: string;
  weights: WeightEntry[];
  recentFoods: RecentFood[];
  drafts: Record<string, MealDraft>;
  correctionFeedback: CorrectionFeedback[];
  providerConfig: ModelProviderConfig;
  foodSourceConfig: FoodSourceConfig;
  /**
   * Remote foods the user has interacted with, kept so recents, diary edits,
   * and re-logging keep working without another network round trip.
   */
  cachedFoods: Record<string, DatabaseFood>;
  chatMessages: ChatMessage[];

  setHasHydrated: (value: boolean) => void;
  completeOnboarding: (profile: UserProfile, goal: StoredGoal, authenticatedUserId?: string) => void;
  syncServerProfile: (profile: UserProfile, authenticatedUserId?: string) => void;
  syncServerGoal: (goal: StoredGoal, authenticatedUserId: string) => void;
  clearServerSession: (authenticatedUserId: string) => void;
  updateUser: (patch: Partial<User>) => void;
  updateGoal: (patch: Partial<Goal>) => void;
  upsertProviderConfig: (config: ModelProviderConfig) => void;
  updateFoodSource: (sourceId: Exclude<FoodSourceId, "local">, patch: Partial<FoodSourceSettings>) => void;
  cacheFood: (food: DatabaseFood) => void;

  setSelectedDate: (date: string) => void;
  shiftSelectedDate: (days: number) => void;

  addMeal: (meal: Meal, date?: string) => void;
  updateEntryFood: (date: string, mealId: string, entryId: string, foodItem: FoodItem) => void;
  removeEntry: (date: string, mealId: string, entryId: string) => void;
  moveEntry: (date: string, mealId: string, entryId: string, mealType: MealType) => void;
  removeMeal: (date: string, mealId: string) => void;

  addWater: (date: string, deltaMl: number) => void;
  addExercise: (date: string, entry: Omit<ExerciseEntry, "id" | "createdAt">) => void;
  removeExercise: (date: string, exerciseId: string) => void;
  setSteps: (date: string, steps: number) => void;

  logWeight: (weightKg: number, date?: string) => void;
  removeWeight: (id: string) => void;

  recordFoodUse: (foodId: string) => void;

  saveDraft: (draft: MealDraft) => void;
  updateDraft: (draftId: string, patch: Partial<MealDraft>) => void;
  commitDraft: (draftId: string, date?: string) => Meal | undefined;
  discardDraft: (draftId: string) => void;

  addChatMessage: (message: ChatMessage) => void;
  clearChat: () => void;
  resetDiary: () => void;
};

export function emptyLog(date: string): DailyLog {
  return { date, meals: [], waterMl: 0, exercises: [] };
}

/** Read-only accessor that never inserts an empty day into the store. */
export function selectLog(state: Pick<AppState, "logs">, date: string): DailyLog {
  return state.logs[date] || emptyLog(date);
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hasHydrated: false,
      hasCompletedOnboarding: false,
      serverStateUserId: undefined,
      user: defaultUser,
      goal: defaultGoal,
      waterGoalMl: defaultGoal.waterMl,
      // Authenticated diary entries come only from the server. Never seed or
      // restore legacy development meals into the signed-in diary.
      logs: {},
      selectedDate: todayKey(),
      weights: [],
      recentFoods: [],
      drafts: {},
      correctionFeedback: [],
      providerConfig: defaultProviderConfig,
      foodSourceConfig: defaultFoodSourceConfig,
      cachedFoods: {},
      chatMessages: [
        {
          id: "chat-welcome",
          role: "assistant",
          content: "Ask me about today's macros, meal ideas, or a food estimate.",
          createdAt: new Date().toISOString()
        }
      ],

      setHasHydrated: (value) => set({ hasHydrated: value }),
      completeOnboarding: (profile, serverGoal, authenticatedUserId) =>
        set((state) => ({
          hasCompletedOnboarding: true,
          serverStateUserId: authenticatedUserId ?? profile.userId,
          user: userFromProfile(profile, state.user, serverGoal, authenticatedUserId),
          goal: goalFromServer(serverGoal, state.goal)
        })),
      syncServerProfile: (profile, authenticatedUserId) =>
        set((state) => ({
          serverStateUserId: authenticatedUserId ?? profile.userId,
          user: userFromProfile(profile, state.user, undefined, authenticatedUserId)
        })),
      syncServerGoal: (serverGoal, authenticatedUserId) =>
        set((state) => {
          if (state.serverStateUserId !== authenticatedUserId) return state;
          return {
            user: userFromServerGoal(serverGoal, state.user),
            goal: goalFromServer(serverGoal, state.goal)
          };
        }),
      clearServerSession: (authenticatedUserId) =>
        set((state) => {
          if (state.serverStateUserId && state.serverStateUserId !== authenticatedUserId) return state;
          return {
            hasCompletedOnboarding: false,
            serverStateUserId: undefined,
            user: { ...defaultUser, dietaryPreferences: [...defaultUser.dietaryPreferences] },
            goal: { ...defaultGoal },
            waterGoalMl: defaultGoal.waterMl,
            logs: {},
            selectedDate: todayKey(),
            weights: [],
            recentFoods: [],
            drafts: {},
            correctionFeedback: [],
            cachedFoods: {},
            chatMessages: []
          };
        }),
      updateUser: (patch) => set((state) => ({ user: { ...state.user, ...patch } })),
      updateGoal: (patch) =>
        set((state) => {
          const waterGoalMl = patch.waterMl ?? state.waterGoalMl;
          return {
            waterGoalMl,
            goal: { ...state.goal, ...patch, waterMl: waterGoalMl }
          };
        }),
      upsertProviderConfig: (providerConfig) => set({ providerConfig }),

      updateFoodSource: (sourceId, patch) =>
        set((state) => ({
          foodSourceConfig: { ...state.foodSourceConfig, [sourceId]: { ...state.foodSourceConfig[sourceId], ...patch } }
        })),

      cacheFood: (food) =>
        set((state) => {
          if (food.source === "local" || state.cachedFoods[food.id]) return state;
          const entries = Object.entries(state.cachedFoods);
          // Bound the cache so a long search history can't grow storage forever.
          const trimmed = entries.length >= 300 ? entries.slice(entries.length - 299) : entries;
          return { cachedFoods: { ...Object.fromEntries(trimmed), [food.id]: food } };
        }),

      setSelectedDate: (selectedDate) => set({ selectedDate }),
      shiftSelectedDate: (days) => set((state) => ({ selectedDate: shiftDateKey(state.selectedDate, days) })),

      addMeal: (meal, date) =>
        set((state) => {
          const key = date || state.selectedDate;
          const log = state.logs[key] || emptyLog(key);
          return { logs: { ...state.logs, [key]: { ...log, meals: [...log.meals, meal] } } };
        }),

      updateEntryFood: (date, mealId, entryId, foodItem) =>
        set((state) => {
          const log = state.logs[date];
          if (!log) return state;
          return {
            logs: {
              ...state.logs,
              [date]: {
                ...log,
                meals: log.meals.map((meal) =>
                  meal.id !== mealId
                    ? meal
                    : {
                        ...meal,
                        entries: meal.entries.map((entry) =>
                          entry.id === entryId ? { ...entry, foodItem, userEdited: true } : entry
                        )
                      }
                )
              }
            }
          };
        }),

      removeEntry: (date, mealId, entryId) =>
        set((state) => {
          const log = state.logs[date];
          if (!log) return state;
          const meals = log.meals
            .map((meal) => (meal.id !== mealId ? meal : { ...meal, entries: meal.entries.filter((entry) => entry.id !== entryId) }))
            // A meal with no foods left is no longer a diary row.
            .filter((meal) => meal.entries.length > 0);
          return { logs: { ...state.logs, [date]: { ...log, meals } } };
        }),

      moveEntry: (date, mealId, entryId, mealType) =>
        set((state) => {
          const log = state.logs[date];
          if (!log) return state;
          const source = log.meals.find((meal) => meal.id === mealId);
          const entry = source?.entries.find((item) => item.id === entryId);
          if (!source || !entry) return state;

          const stripped = log.meals
            .map((meal) => (meal.id !== mealId ? meal : { ...meal, entries: meal.entries.filter((item) => item.id !== entryId) }))
            .filter((meal) => meal.entries.length > 0);

          const moved: Meal = {
            ...source,
            id: localId("meal"),
            mealType,
            title: entry.foodItem.name,
            entries: [entry]
          };

          return { logs: { ...state.logs, [date]: { ...log, meals: [...stripped, moved] } } };
        }),

      removeMeal: (date, mealId) =>
        set((state) => {
          const log = state.logs[date];
          if (!log) return state;
          return { logs: { ...state.logs, [date]: { ...log, meals: log.meals.filter((meal) => meal.id !== mealId) } } };
        }),

      addWater: (date, deltaMl) =>
        set((state) => {
          const log = state.logs[date] || emptyLog(date);
          return { logs: { ...state.logs, [date]: { ...log, waterMl: Math.max(0, log.waterMl + deltaMl) } } };
        }),

      addExercise: (date, entry) =>
        set((state) => {
          const log = state.logs[date] || emptyLog(date);
          const exercise: ExerciseEntry = { ...entry, id: localId("ex"), createdAt: new Date().toISOString() };
          return { logs: { ...state.logs, [date]: { ...log, exercises: [...log.exercises, exercise] } } };
        }),

      removeExercise: (date, exerciseId) =>
        set((state) => {
          const log = state.logs[date];
          if (!log) return state;
          return {
            logs: { ...state.logs, [date]: { ...log, exercises: log.exercises.filter((item) => item.id !== exerciseId) } }
          };
        }),

      setSteps: (date, steps) =>
        set((state) => {
          const log = state.logs[date] || emptyLog(date);
          return { logs: { ...state.logs, [date]: { ...log, steps } } };
        }),

      logWeight: (weightKg, date) =>
        set((state) => {
          const key = date || todayKey();
          const entry: WeightEntry = { id: localId("wt"), date: key, weightKg, createdAt: new Date().toISOString() };
          // One weigh-in per day; a second entry replaces the first.
          const weights = [...state.weights.filter((item) => item.date !== key), entry].sort((a, b) => a.date.localeCompare(b.date));
          const goal = state.goal.startWeightKg ? state.goal : { ...state.goal, startWeightKg: weightKg };
          return { weights, goal };
        }),

      removeWeight: (id) => set((state) => ({ weights: state.weights.filter((item) => item.id !== id) })),

      recordFoodUse: (foodId) =>
        set((state) => {
          const now = new Date().toISOString();
          const existing = state.recentFoods.find((item) => item.foodId === foodId);
          const recentFoods = existing
            ? state.recentFoods.map((item) => (item.foodId === foodId ? { ...item, useCount: item.useCount + 1, lastUsedAt: now } : item))
            : [...state.recentFoods, { foodId, useCount: 1, lastUsedAt: now }];
          return { recentFoods: recentFoods.slice(-200) };
        }),

      saveDraft: (draft) => set((state) => ({ drafts: { ...state.drafts, [draft.draftId]: draft } })),

      updateDraft: (draftId, patch) =>
        set((state) => {
          const draft = state.drafts[draftId];
          if (!draft) return state;
          return { drafts: { ...state.drafts, [draftId]: { ...draft, ...patch } } };
        }),

      commitDraft: (draftId, date) => {
        const draft = get().drafts[draftId];
        if (!draft) return undefined;

        const key = date || get().selectedDate;
        const meal: Meal = {
          id: localId("meal"),
          title: draft.title,
          mealType: draft.mealType,
          capturedWith: draft.capturedWith,
          capturedAt: new Date().toISOString(),
          entries: draft.entries,
          inference: draft.inference,
          photoUri: draft.photoUri,
          notes: draft.notes
        };

        get().addMeal(meal, key);
        get().discardDraft(draftId);
        return meal;
      },

      discardDraft: (draftId) =>
        set((state) => {
          const drafts = { ...state.drafts };
          delete drafts[draftId];
          return { drafts };
        }),

      addChatMessage: (message) => set((state) => ({ chatMessages: [...state.chatMessages, message] })),
      clearChat: () => set({ chatMessages: [] }),
      resetDiary: () => set({ logs: {}, weights: [], recentFoods: [] })
    }),
    {
      name: "biteiq-store-v1",
      storage: createJSONStorage(() => AsyncStorage),
      // Authenticated profile and goal data are server-owned and never restored
      // from AsyncStorage. The store only mirrors the current signed-in session.
      partialize: ({ providerConfig, foodSourceConfig }) => ({
        providerConfig: sanitizeProviderConfig(providerConfig),
        foodSourceConfig: sanitizeFoodSourceConfig(foodSourceConfig)
      }),
      version: 6,
      migrate: (persistedState) => {
        const state = persistedState as Partial<AppState>;
        return {
          providerConfig: sanitizeProviderConfig(state.providerConfig),
          foodSourceConfig: sanitizeFoodSourceConfig(state.foodSourceConfig)
        } as AppState;
      },
      onRehydrateStorage: () => (state) => {
        // The stored selectedDate is from a previous session, so land on today.
        state?.setSelectedDate(todayKey());
        if (state) state.updateGoal({ waterMl: state.waterGoalMl });
        state?.setHasHydrated(true);
      }
    }
  )
);

function userFromProfile(
  profile: UserProfile,
  current: User,
  serverGoal?: StoredGoal,
  authenticatedUserId?: string
): User {
  const profileUser: User = {
    ...current,
    id: authenticatedUserId ?? profile.userId ?? "authenticated-user",
    name: profile.displayName,
    timezone: profile.timezone,
    sex: profile.biologicalSex,
    birthYear: Number(profile.dateOfBirth.slice(0, 4)),
    heightCm: Number(profile.heightCm)
  };
  return serverGoal ? userFromServerGoal(serverGoal, profileUser) : profileUser;
}

function userFromServerGoal(serverGoal: StoredGoal, current: User): User {
  const activityLevel =
    serverGoal.activityLevel === "sedentary"
      ? "low"
      : serverGoal.activityLevel === "very_active" || serverGoal.activityLevel === "extremely_active"
        ? "high"
        : "moderate";
  return { ...current, activityLevel };
}

function goalFromServer(serverGoal: StoredGoal, current: Goal): Goal {
  return {
    ...current,
    calories: Math.round(Number(serverGoal.calorieTargetKcal)),
    proteinGrams: Number(serverGoal.proteinTargetG),
    carbGrams: Number(serverGoal.carbohydrateTargetG),
    fatGrams: Number(serverGoal.fatTargetG),
    startWeightKg: Number(serverGoal.startingWeightKg),
    goalWeightKg: Number(serverGoal.targetWeightKg),
    weeklyRateKg: Number(serverGoal.weeklyRateKg)
  };
}

const providerTypes: ProviderType[] = ["mock", "local-codex", "local-claude", "hosted"];
const aiTasks: AITask[] = [
  "ocrExtraction",
  "barcodeInterpretation",
  "mealPhotoRecognition",
  "nutritionLabelParsing",
  "naturalLanguageMealParsing",
  "portionEstimation",
  "nutritionEstimation",
  "assistantChatReasoning"
];

function sanitizeProviderConfig(value: unknown): ModelProviderConfig {
  const candidate = record(value);
  const retryPolicy = record(candidate.retryPolicy);
  return {
    id: stringValue(candidate.id, defaultProviderConfig.id),
    providerType: providerTypes.includes(candidate.providerType as ProviderType)
      ? candidate.providerType as ProviderType
      : defaultProviderConfig.providerType,
    label: stringValue(candidate.label, defaultProviderConfig.label),
    baseUrl: stringValue(candidate.baseUrl, defaultProviderConfig.baseUrl),
    modelName: stringValue(candidate.modelName, defaultProviderConfig.modelName),
    timeoutMs: finiteNumber(candidate.timeoutMs, defaultProviderConfig.timeoutMs),
    retryPolicy: {
      maxAttempts: finiteNumber(retryPolicy.maxAttempts, defaultProviderConfig.retryPolicy.maxAttempts),
      backoffMs: finiteNumber(retryPolicy.backoffMs, defaultProviderConfig.retryPolicy.backoffMs)
    },
    enabledTasks: Array.isArray(candidate.enabledTasks)
      ? candidate.enabledTasks.filter((task): task is AITask => aiTasks.includes(task as AITask))
      : [...defaultProviderConfig.enabledTasks]
  };
}

function sanitizeFoodSourceConfig(value: unknown): FoodSourceConfig {
  const candidate = record(value);
  return {
    openfoodfacts: sanitizeFoodSource(candidate.openfoodfacts, defaultFoodSourceConfig.openfoodfacts),
    usda: sanitizeFoodSource(candidate.usda, defaultFoodSourceConfig.usda),
    fatsecret: sanitizeFoodSource(candidate.fatsecret, defaultFoodSourceConfig.fatsecret)
  };
}

function sanitizeFoodSource(value: unknown, fallback: FoodSourceSettings): FoodSourceSettings {
  const candidate = record(value);
  const baseUrl = typeof candidate.baseUrl === "string" && candidate.baseUrl.trim()
    ? candidate.baseUrl
    : fallback.baseUrl;
  return {
    enabled: typeof candidate.enabled === "boolean" ? candidate.enabled : fallback.enabled,
    ...(baseUrl ? { baseUrl } : {})
  };
}

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
