import { createFeatureFlags, DEVELOPMENT_PREVIEW } from "@/config/features";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

import { featureFlags } from "@/config/features";
import { MoreScreen } from "@/screens/MoreScreen";
import { DiaryScreen } from "@/screens/DiaryScreen";
import { HomeScreen } from "@/screens/HomeScreen";
import { NutritionScreen } from "@/screens/NutritionScreen";
import { QuickAddScreen } from "@/screens/QuickAddScreen";
import { useAppStore } from "@/store/useAppStore";
import { useOfflineStore } from "@/store/useOfflineStore";

const mockSignOut = jest.fn();

jest.mock("@/auth/authClient", () => ({
  authClient: { signOut: () => mockSignOut(), useSession: () => ({ data: { user: { id: "feature-test-user" } } }) }
}));

jest.mock("@/hooks/useServerDayLog", () => ({
  useServerDayLog: () => ({
    day: { localDate: "2026-09-08", entries: [], summary: { calorieTotal: "0", nutrientTotals: {}, goalSnapshot: {} } },
    isError: false,
    refetch: jest.fn()
  })
}));

jest.mock("@/repositories/diaryRepository", () => ({
  diaryRepository: {
    getDay: async (date: string) => ({ localDate: date, entries: [], summary: { calorieTotal: "0", nutrientTotals: {}, goalSnapshot: {} } })
  }
}));

jest.mock("@/hooks/useDayLog", () => ({
  useDayLog: () => ({
    date: "2026-09-08",
    log: { date: "2026-09-08", meals: [], waterMl: 0, exercises: [] },
    totals: { calories: 0, proteinGrams: 0, carbGrams: 0, fatGrams: 0, provenance: [] },
    remaining: 2200,
    isLoading: false,
    isError: false,
    isOffline: false,
    createEntry: jest.fn()
  })
}));

const deferredFeatures = [
  "mealPhoto",
  "barcode",
  "label",
  "voice",
  "naturalLanguageAi",
  "quickAdd",
  "fasting",
  "subscriptions",
  "planning",
  "water",
  "exercise",
  "weightProgress",
  "aiProviderConfig",
  "weeklyAnalytics",
  "localFoodHistory"
] as const;

describe("deferred feature gates", () => {
  it("keeps demo values out of normal development tracking unless explicitly enabled", () => {
    for (const feature of deferredFeatures) {
      expect(createFeatureFlags("development")[feature].enabled).toBe(false);
      expect(createFeatureFlags("production", true)[feature].enabled).toBe(false);
    }
  });
  afterEach(() => {
    Object.assign(featureFlags, createFeatureFlags(process.env.NODE_ENV));
    mockSignOut.mockReset();
  });

  it("disables every deferred flow in production", () => {
    const flags = createFeatureFlags("production");

    for (const feature of deferredFeatures) {
      expect(flags[feature].enabled).toBe(false);
      expect(flags[feature].label).toBeUndefined();
    }
  });

  it("marks enabled development-only actions as Development preview", () => {
    const flags = createFeatureFlags("development", true);

    for (const feature of deferredFeatures) {
      expect(flags[feature]).toEqual({ enabled: true, label: DEVELOPMENT_PREVIEW });
    }
  });

  it("hides unsupported More actions in production", () => {
    Object.assign(featureFlags, createFeatureFlags("production"));
    const navigation = { navigate: jest.fn() };

    const screen = renderMore(navigation);

    expect(screen.queryByText("Assistant")).toBeNull();
    expect(screen.queryByText("AI capture")).toBeNull();
    expect(screen.queryByText("Exercise")).toBeNull();
    expect(screen.queryByText("AI provider")).toBeNull();
    expect(screen.queryByText("Clear all data")).toBeNull();
    expect(screen.queryByText("Everything is stored on this device only")).toBeNull();
    expect(screen.queryByText(/weekly calories/i)).toBeNull();
  });

  it("uses server-backed weekly analytics in production without a development label", async () => {
    Object.assign(featureFlags, createFeatureFlags("production"));
    const screen = renderNutrition(
      React.createElement(NutritionScreen, {
        navigation: { goBack: jest.fn() } as never,
        route: {
          key: "nutrition",
          name: "Nutrition",
          params: { date: "2026-09-08" }
        }
      })
    );

    fireEvent.press(screen.getByText("Calories"));

    expect(screen.getByText("Last 7 days")).toBeTruthy();
    expect(screen.queryByText(DEVELOPMENT_PREVIEW)).toBeNull();
    await waitFor(() => expect(screen.queryByText("Loading recent days…")).toBeNull());
  });

  it("keeps real weekly analytics available even when development previews are enabled", async () => {
    Object.assign(featureFlags, createFeatureFlags("development", true));
    const screen = renderNutrition(
      React.createElement(NutritionScreen, {
        navigation: { goBack: jest.fn() } as never,
        route: {
          key: "nutrition-development",
          name: "Nutrition",
          params: { date: "2026-09-08" }
        }
      })
    );

    fireEvent.press(screen.getByText("Calories"));

    expect(screen.getByText("Last 7 days")).toBeTruthy();
    expect(screen.queryByText(DEVELOPMENT_PREVIEW)).toBeNull();
    await waitFor(() => expect(screen.queryByText("Loading recent days…")).toBeNull());
  });

  it("hides device-only water and exercise flows from production dashboards", () => {
    Object.assign(featureFlags, createFeatureFlags("production"));
    const navigation = { navigate: jest.fn() };

    const home = render(React.createElement(HomeScreen, { navigation }));
    expect(home.queryByText("Water")).toBeNull();
    expect(home.queryByText("Exercise")).toBeNull();
    home.unmount();

    const diary = render(React.createElement(DiaryScreen, { navigation }));
    expect(diary.queryByText("Water")).toBeNull();
    expect(diary.queryByText("Exercise")).toBeNull();
    expect(diary.queryByText("ADD EXERCISE")).toBeNull();
  });

  it("labels development More actions before navigating", () => {
    Object.assign(featureFlags, createFeatureFlags("development", true));
    const navigation = { navigate: jest.fn() };

    const screen = renderMore(navigation);

    expect(screen.getAllByText(DEVELOPMENT_PREVIEW)).toHaveLength(3);
    expect(screen.getByText(/^Development preview •/)).toBeTruthy();
    fireEvent.press(screen.getByText("Assistant"));
    fireEvent.press(screen.getByText("AI capture"));
    expect(navigation.navigate).toHaveBeenCalledWith("Assistant");
    expect(navigation.navigate).toHaveBeenCalledWith("AddMeal");
  });

  it("signs out through the server and clears the departing account locally", async () => {
    const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    Object.assign(featureFlags, createFeatureFlags("production"));
    useAppStore.setState({
      hasCompletedOnboarding: true,
      serverStateUserId: userA,
      user: { ...useAppStore.getState().user, id: userA, name: "Alice" },
      logs: {
        "2026-09-08": { date: "2026-09-08", meals: [], waterMl: 720, exercises: [] }
      },
      chatMessages: [{ id: "chat-a", role: "user", content: "private", createdAt: "2026-09-08T00:00:00.000Z" }]
    });
    useOfflineStore.setState({
      cachedDays: {
        [userA]: {
          "2026-09-08": {
            localDate: "2026-09-08",
            entries: [],
            summary: { calorieTotal: "0.000000", nutrientTotals: {}, goalSnapshot: {} }
          }
        }
      },
      createsByUser: {}
    });
    let finishSignOut!: (result: { data: {}; error: null }) => void;
    mockSignOut.mockImplementation(
      () => new Promise((resolve) => {
        finishSignOut = resolve;
      }) as never
    );
    const queryClient = new QueryClient();
    queryClient.setQueryData(["diary", userA, "2026-09-08"], { private: true });
    const screen = renderMore({ navigate: jest.fn() }, queryClient);

    fireEvent.press(screen.getByRole("button", { name: "Sign out" }));

    expect(screen.getByText("Signing out…")).toBeTruthy();
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    finishSignOut({ data: {}, error: null });
    await waitFor(() => expect(useAppStore.getState().serverStateUserId).toBeUndefined());
    expect(useAppStore.getState().logs).toEqual({});
    expect(useAppStore.getState().chatMessages).toEqual([]);
    expect(useOfflineStore.getState().cachedDays[userA]).toBeUndefined();
    expect(queryClient.getQueryData(["diary", userA, "2026-09-08"])).toBeUndefined();
  });

  it("disables the local-only Quick Add screen in production", () => {
    Object.assign(featureFlags, createFeatureFlags("production"));
    const screen = render(
      React.createElement(QuickAddScreen, {
        navigation: { goBack: jest.fn() } as never,
        route: {
          key: "quick-add",
          name: "QuickAdd",
          params: { date: "2026-09-08", mealType: "lunch" }
        }
      })
    );

    expect(screen.queryByText("Add to diary")).toBeNull();
  });

  it("labels the development-only Quick Add screen", () => {
    Object.assign(featureFlags, createFeatureFlags("development", true));
    const screen = render(
      React.createElement(QuickAddScreen, {
        navigation: { goBack: jest.fn() } as never,
        route: {
          key: "quick-add",
          name: "QuickAdd",
          params: { date: "2026-09-08", mealType: "lunch" }
        }
      })
    );

    expect(screen.getByText(DEVELOPMENT_PREVIEW)).toBeTruthy();
    expect(screen.getByText("Add to diary")).toBeTruthy();
  });
});

function renderMore(
  navigation: { navigate: jest.Mock },
  queryClient = new QueryClient()
) {
  return render(
    React.createElement(
      QueryClientProvider,
      { client: queryClient },
      React.createElement(MoreScreen, { navigation })
    )
  );
}

function renderNutrition(element: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(React.createElement(QueryClientProvider, { client }, element));
}
