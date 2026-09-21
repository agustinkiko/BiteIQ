import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { authClient } from "@/auth/authClient";
import { defaultGoal, defaultUser } from "@/config/defaults";
import { MoreScreen } from "@/screens/MoreScreen";
import { useAppStore } from "@/store/useAppStore";
import { useOfflineStore } from "@/store/useOfflineStore";

jest.mock("@/auth/authClient", () => ({ authClient: { signOut: jest.fn() } }));

const userId = "more-screen-user";
const date = "2026-09-19";

function renderMore() {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  client.setQueryData(["diary", userId, date], { private: true });
  render(<QueryClientProvider client={client}><MoreScreen navigation={{ navigate: jest.fn() }} /></QueryClientProvider>);
  return client;
}

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({
    hasCompletedOnboarding: true,
    serverStateUserId: userId,
    user: { ...defaultUser, id: userId, name: "Alice" },
    goal: { ...defaultGoal, calories: 1730.83, proteinGrams: 129.812, carbGrams: 173.083, fatGrams: 57.694 },
    logs: { [date]: { date, meals: [], waterMl: 500, exercises: [] } }
  });
  useOfflineStore.setState({
    cachedDays: { [userId]: { [date]: {
      localDate: date, entries: [], summary: { calorieTotal: "0", nutrientTotals: {}, goalSnapshot: {} }
    } } },
    createsByUser: {}
  });
});

it.each(["network", "response"] as const)("shows a %s sign-out failure and preserves the session until a successful retry", async (failure) => {
  if (failure === "network") {
    jest.mocked(authClient.signOut).mockRejectedValueOnce(new TypeError("Failed to fetch"));
  } else {
    jest.mocked(authClient.signOut).mockResolvedValueOnce({ error: { message: "Unavailable", status: 503 } } as never);
  }
  const client = renderMore();
  fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
  expect((await screen.findByRole("alert")).props.children).toBe("Could not sign out. Check your connection and try again.");
  expect(useAppStore.getState().serverStateUserId).toBe(userId);
  expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
  expect(useAppStore.getState().logs[date].waterMl).toBe(500);
  expect(client.getQueryData(["diary", userId, date])).toEqual({ private: true });
  expect(useOfflineStore.getState().cachedDays[userId]?.[date]).toBeDefined();

  jest.mocked(authClient.signOut).mockResolvedValueOnce({ data: {}, error: null } as never);
  fireEvent.press(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(useAppStore.getState().serverStateUserId).toBeUndefined());
  expect(authClient.signOut).toHaveBeenCalledTimes(2);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(client.getQueryData(["diary", userId, date])).toBeUndefined();
  expect(useOfflineStore.getState().cachedDays[userId]).toBeUndefined();
  expect(useAppStore.getState().logs).toEqual({});
});

it("shows readable rounded goals and describes the live nutrition views", () => {
  renderMore();
  expect(screen.getByText("1731 cal • 129.8p / 173.1c / 57.7f")).toBeTruthy();
  expect(screen.getByText("Daily nutrients, macro split, and 7-day calories")).toBeTruthy();
  expect(screen.queryByText(/high protein/)).toBeNull();
  expect(useAppStore.getState().goal.proteinGrams).toBe(129.812);
});
