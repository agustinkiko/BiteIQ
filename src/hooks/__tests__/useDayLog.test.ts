import { renderHook } from "@testing-library/react-native";

import { createFeatureFlags, featureFlags } from "@/config/features";
import { useDayLog } from "@/hooks/useDayLog";
import { useAppStore } from "@/store/useAppStore";

jest.mock("@/hooks/useServerDayLog", () => ({
  useServerDayLog: () => ({
    log: { date: "2026-09-08", meals: [], waterMl: 0, exercises: [] },
    totals: { calories: 400, proteinGrams: 20, carbGrams: 30, fatGrams: 10, provenance: [] },
    isLoading: false,
    isError: false,
    isOffline: false,
    createEntry: jest.fn(),
    updateEntry: jest.fn(),
    deleteEntry: jest.fn()
  })
}));

describe("useDayLog production boundary", () => {
  afterEach(() => {
    Object.assign(featureFlags, createFeatureFlags(process.env.NODE_ENV));
    useAppStore.setState({ logs: {} });
  });

  it("does not mix deferred local water or exercise into a production server diary", () => {
    Object.assign(featureFlags, createFeatureFlags("production"));
    useAppStore.setState({
      logs: {
        "2026-09-08": {
          date: "2026-09-08",
          meals: [],
          waterMl: 720,
          exercises: [{
            id: "exercise-a",
            name: "Run",
            kind: "cardio",
            minutes: 30,
            caloriesBurned: 300,
            createdAt: "2026-09-08T00:00:00.000Z"
          }]
        }
      }
    });

    const hook = renderHook(() => useDayLog("2026-09-08"));

    expect(hook.result.current.log.waterMl).toBe(0);
    expect(hook.result.current.log.exercises).toEqual([]);
    expect(hook.result.current.remaining).toBe(1800);
    hook.unmount();
  });
});
