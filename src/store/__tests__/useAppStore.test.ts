import { defaultGoal } from "@/config/defaults";
import { useAppStore } from "@/store/useAppStore";

describe("useAppStore persistence boundary", () => {
  afterEach(() => {
    useAppStore.setState({ goal: defaultGoal, waterGoalMl: defaultGoal.waterMl });
  });

  it("persists water separately without persisting server-owned goal fields", () => {
    useAppStore.getState().updateGoal({ calories: 9876, proteinGrams: 1, waterMl: 3120 });

    const partialize = useAppStore.persist.getOptions().partialize;
    const persisted = partialize?.(useAppStore.getState()) as Record<string, unknown>;

    expect(persisted).toMatchObject({ waterGoalMl: 3120 });
    expect(persisted).not.toHaveProperty("goal");
    expect(persisted).not.toHaveProperty("user");
    expect(persisted).not.toHaveProperty("hasCompletedOnboarding");
  });

  it("migrates water from the prior version without restoring its server-owned goal", async () => {
    const options = useAppStore.persist.getOptions();
    const priorState = {
      goal: { ...defaultGoal, calories: 9876, waterMl: 2880 },
      user: { id: "stale-user" },
      hasCompletedOnboarding: true
    };

    expect(options.version).toBe(3);
    const migrated = await options.migrate?.(priorState, 2) as Record<string, unknown>;
    expect(migrated).toMatchObject({ waterGoalMl: 2880 });
    expect(migrated).not.toHaveProperty("goal");
    expect(migrated).not.toHaveProperty("user");
    expect(migrated).not.toHaveProperty("hasCompletedOnboarding");
  });
});
