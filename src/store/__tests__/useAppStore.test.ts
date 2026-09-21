import { defaultGoal, defaultUser } from "@/config/defaults";
import { useAppStore } from "@/store/useAppStore";
import { StoredGoal } from "@/types/domain";

describe("useAppStore persistence boundary", () => {
  afterEach(() => {
    useAppStore.setState({ goal: defaultGoal, waterGoalMl: defaultGoal.waterMl });
  });

  it("persists only device configuration and no account-owned values", () => {
    useAppStore.setState({
      logs: {
        "2026-09-08": { date: "2026-09-08", meals: [], waterMl: 720, exercises: [] }
      },
      weights: [{ id: "weight-a", date: "2026-09-08", weightKg: 80, createdAt: "2026-09-08T00:00:00.000Z" }],
      recentFoods: [{ foodId: "food-a", useCount: 3, lastUsedAt: "2026-09-08T00:00:00.000Z" }],
      drafts: { "draft-a": { draftId: "draft-a" } as never },
      correctionFeedback: [{ id: "feedback-a" } as never],
      cachedFoods: { "food-a": { id: "food-a" } as never },
      chatMessages: [{ id: "chat-a", role: "user", content: "private", createdAt: "2026-09-08T00:00:00.000Z" }]
    });
    useAppStore.getState().updateGoal({ calories: 9876, proteinGrams: 1, waterMl: 3120 });

    const partialize = useAppStore.persist.getOptions().partialize;
    const persisted = partialize?.(useAppStore.getState()) as Record<string, unknown>;

    expect(Object.keys(persisted).sort()).toEqual(["foodSourceConfig", "providerConfig"]);
    expect(JSON.stringify(persisted)).not.toMatch(/9876|3120|weight-a|food-a|draft-a|feedback-a|chat-a|private/);
  });

  it("drops every account-owned value from prior persisted versions", async () => {
    const options = useAppStore.persist.getOptions();
    const priorState = {
      goal: { ...defaultGoal, calories: 9876, waterMl: 2880 },
      user: { id: "stale-user" },
      hasCompletedOnboarding: true,
      serverStateUserId: "stale-user",
      logs: {
        "2026-09-08": { date: "2026-09-08", meals: [], waterMl: 720, exercises: [] }
      }
    };

    expect(options.version).toBe(6);
    const migrated = await options.migrate?.(priorState, 2) as Record<string, unknown>;
    expect(Object.keys(migrated).sort()).toEqual(["foodSourceConfig", "providerConfig"]);
    expect(JSON.stringify(migrated)).not.toMatch(/9876|2880|stale-user|2026-09-08/);
  });

  it("scrubs stale provider credentials from version-4 persistence", async () => {
    const options = useAppStore.persist.getOptions();
    const priorState = {
      providerConfig: {
        id: "hosted-safe",
        providerType: "hosted",
        label: "Home API",
        baseUrl: "https://biteiq.home/api",
        modelName: "server-managed",
        timeoutMs: 8000,
        retryPolicy: { maxAttempts: 2, backoffMs: 250 },
        enabledTasks: ["nutritionEstimation"],
        apiKey: "old-ai-secret",
        clientId: "old-ai-client",
        clientSecret: "old-ai-client-secret"
      },
      foodSourceConfig: {
        openfoodfacts: { enabled: true, baseUrl: "https://proxy.home", apiKey: "old-off-key" },
        usda: { enabled: false, apiKey: "old-usda-key" },
        fatsecret: {
          enabled: false,
          clientId: "old-fatsecret-id",
          clientSecret: "old-fatsecret-secret"
        }
      }
    };

    const migrated = await options.migrate?.(priorState, 4) as Record<string, unknown>;
    const serialized = JSON.stringify(migrated);

    expect(migrated.providerConfig).toEqual({
      id: "hosted-safe",
      providerType: "hosted",
      label: "Home API",
      baseUrl: "https://biteiq.home/api",
      modelName: "server-managed",
      timeoutMs: 8000,
      retryPolicy: { maxAttempts: 2, backoffMs: 250 },
      enabledTasks: ["nutritionEstimation"]
    });
    expect(migrated.foodSourceConfig).toEqual({
      openfoodfacts: { enabled: true, baseUrl: "https://proxy.home" },
      usda: { enabled: false },
      fatsecret: { enabled: false }
    });
    expect(serialized).not.toMatch(/apiKey|clientId|clientSecret|old-.*secret/i);
  });

  it("never persists stale credential fields injected at runtime", () => {
    useAppStore.setState({
      providerConfig: {
        ...useAppStore.getState().providerConfig,
        apiKey: "runtime-secret"
      } as never,
      foodSourceConfig: {
        ...useAppStore.getState().foodSourceConfig,
        usda: { enabled: true, apiKey: "runtime-usda-secret" }
      } as never
    });

    const partialize = useAppStore.persist.getOptions().partialize;
    const persisted = partialize?.(useAppStore.getState()) as Record<string, unknown>;

    expect(JSON.stringify(persisted)).not.toMatch(/apiKey|clientId|clientSecret|runtime-.*secret/i);
  });

  it("clears every User A value while preserving device configuration on account change", () => {
    const providerConfig = {
      ...useAppStore.getState().providerConfig,
      label: "Home API"
    };
    const foodSourceConfig = {
      ...useAppStore.getState().foodSourceConfig,
      openfoodfacts: { enabled: true, baseUrl: "https://foods.home" }
    };
    useAppStore.setState({
      hasCompletedOnboarding: true,
      serverStateUserId: "user-a",
      user: {
        ...defaultUser,
        id: "user-a",
        name: "Alice",
        timezone: "Asia/Manila",
        dietaryPreferences: ["vegan"]
      },
      goal: {
        ...defaultGoal,
        calories: 1800,
        proteinGrams: 140,
        waterMl: 3120
      },
      waterGoalMl: 3120,
      logs: {
        "2026-09-08": { date: "2026-09-08", meals: [], waterMl: 720, exercises: [] }
      },
      weights: [{ id: "weight-a", date: "2026-09-08", weightKg: 80, createdAt: "2026-09-08T00:00:00.000Z" }],
      recentFoods: [{ foodId: "food-a", useCount: 3, lastUsedAt: "2026-09-08T00:00:00.000Z" }],
      drafts: { "draft-a": { draftId: "draft-a" } as never },
      correctionFeedback: [{ id: "feedback-a" } as never],
      cachedFoods: { "food-a": { id: "food-a" } as never },
      chatMessages: [{ id: "chat-a", role: "user", content: "private note", createdAt: "2026-09-08T00:00:00.000Z" }],
      providerConfig,
      foodSourceConfig
    });

    useAppStore.getState().clearServerSession("user-a");

    expect(useAppStore.getState()).toMatchObject({
      hasCompletedOnboarding: false,
      serverStateUserId: undefined,
      user: {
        id: defaultUser.id,
        name: defaultUser.name,
        timezone: defaultUser.timezone,
        dietaryPreferences: defaultUser.dietaryPreferences
      },
      goal: defaultGoal,
      waterGoalMl: defaultGoal.waterMl,
      logs: {},
      weights: [],
      recentFoods: [],
      drafts: {},
      correctionFeedback: [],
      cachedFoods: {},
      chatMessages: [],
      providerConfig,
      foodSourceConfig
    });
  });

  it("does not let a late User A goal overwrite active User B state", () => {
    const userBGoal = { ...defaultGoal, calories: 2600 };
    const userAGoal: StoredGoal = {
      goalType: "lose",
      startingWeightKg: "75",
      currentWeightKg: "75",
      targetWeightKg: "70",
      weeklyRateKg: "-0.5",
      activityLevel: "moderately_active",
      plannedExerciseInActivity: false,
      equation: "mifflin_st_jeor",
      equationInputs: {
        biologicalSex: "male",
        weightKg: 75,
        heightCm: 175,
        age: 36,
        activityLevel: "moderately_active",
        timezone: "Asia/Manila",
        calculationDate: "2026-09-08"
      },
      bmrKcal: "1700",
      activityMultiplier: "1.55",
      tdeeKcal: "2635",
      calorieAdjustmentKcal: "-500",
      calorieTargetKcal: "2135",
      proteinTargetG: "160",
      carbohydrateTargetG: "220",
      fatTargetG: "68",
      targetMode: "percentage",
      isManualCalorieTarget: false
    };
    useAppStore.setState({
      serverStateUserId: "user-b",
      user: { ...defaultUser, id: "user-b", name: "Bob" },
      goal: userBGoal
    });

    useAppStore.getState().syncServerGoal(userAGoal, "user-a");

    expect(useAppStore.getState().serverStateUserId).toBe("user-b");
    expect(useAppStore.getState().goal).toEqual(userBGoal);
  });
});
