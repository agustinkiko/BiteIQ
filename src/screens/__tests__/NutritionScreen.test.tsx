import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { authClient } from "@/auth/authClient";
import { defaultGoal } from "@/config/defaults";
import { useDayLog } from "@/hooks/useDayLog";
import { useServerDayLog } from "@/hooks/useServerDayLog";
import { DiaryDay, diaryRepository } from "@/repositories/diaryRepository";
import { MoreScreen } from "@/screens/MoreScreen";
import { NutritionScreen } from "@/screens/NutritionScreen";
import { emptyNutrition } from "@/services/nutritionMath";
import { useAppStore } from "@/store/useAppStore";

jest.mock("@/hooks/useDayLog", () => ({ useDayLog: jest.fn() }));
jest.mock("@/hooks/useServerDayLog", () => ({ useServerDayLog: jest.fn() }));
jest.mock("@/auth/authClient", () => ({ authClient: { useSession: jest.fn(), signOut: jest.fn() } }));
jest.mock("@/repositories/diaryRepository", () => ({ diaryRepository: { getDay: jest.fn() } }));

const date = "2026-09-19";
const refetch = jest.fn();
const emptyDay: DiaryDay = {
  localDate: date, entries: [],
  summary: { calorieTotal: "0", nutrientTotals: {}, goalSnapshot: {} }
};

function setDay(day: DiaryDay | undefined, isError = false) {
  jest.mocked(useServerDayLog).mockReturnValue({ day, isError, refetch } as unknown as ReturnType<typeof useServerDayLog>);
}

function renderNutrition() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const navigation = { goBack: jest.fn(), navigate: jest.fn() };
  const element = () => <QueryClientProvider client={client}>
    <NutritionScreen navigation={navigation as never} route={{ params: { date } } as never} />
  </QueryClientProvider>;
  const rendered = render(element());
  return { navigation, client, rerenderNutrition: () => rendered.rerender(element()) };
}

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ goal: defaultGoal, selectedDate: date });
  jest.mocked(authClient.useSession).mockReturnValue({ data: { user: { id: "user-a" } } } as ReturnType<typeof authClient.useSession>);
  jest.mocked(useDayLog).mockReturnValue({
    log: { meals: [], waterMl: 0, exercises: [], date }, totals: emptyNutrition()
  } as unknown as ReturnType<typeof useDayLog>);
  jest.mocked(diaryRepository.getDay).mockImplementation(async (dayDate) => ({ ...emptyDay, localDate: dayDate }));
  setDay(emptyDay);
});

it("shows loading instead of presenting empty totals before the diary arrives", () => {
  setDay(undefined);
  const { navigation } = renderNutrition();
  expect(screen.getByText("Loading nutrition…")).toBeTruthy();
  expect(screen.queryByText("Against your targets")).toBeNull();
  fireEvent.press(screen.getByRole("button", { name: "Back" }));
  expect(navigation.goBack).toHaveBeenCalledTimes(1);
});

it("offers a visible retry when the daily request fails", () => {
  setDay(undefined, true);
  renderNutrition();
  expect(screen.getByRole("alert")).toBeTruthy();
  fireEvent.press(screen.getByRole("button", { name: "Retry nutrition" }));
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByText("Against your targets")).toBeNull();
});

it("distinguishes an unreported nutrient from a measured zero and a partial total", () => {
  const nutrients = { protein: { amount: "0", unit: "g" }, fiber: { amount: "3", unit: "g" } };
  setDay({ ...emptyDay,
    entries: [{ nutrientSnapshot: nutrients }, { nutrientSnapshot: { protein: nutrients.protein } }] as unknown as DiaryDay["entries"],
    summary: { ...emptyDay.summary, nutrientTotals: nutrients }
  });
  jest.mocked(useDayLog).mockReturnValue({
    log: { meals: [], waterMl: 0, exercises: [], date }, totals: { ...emptyNutrition(), fiberGrams: 3 }
  } as unknown as ReturnType<typeof useDayLog>);
  renderNutrition();
  fireEvent.press(screen.getByRole("button", { name: "Nutrients" }));
  expect(screen.getByText(`0g / ${defaultGoal.proteinGrams}g`)).toBeTruthy();
  expect(screen.getByText("3g (partial)")).toBeTruthy();
  expect(screen.getAllByText("Not reported").length).toBeGreaterThan(0);
});

it("reads the real seven-day totals and does not retain them when the account changes", async () => {
  jest.mocked(diaryRepository.getDay).mockImplementation(async (dayDate) => ({
    ...emptyDay, localDate: dayDate, summary: { ...emptyDay.summary, calorieTotal: "165" }
  }));
  const { client, rerenderNutrition } = renderNutrition();
  fireEvent.press(screen.getByRole("button", { name: "Calories" }));
  await waitFor(() => expect(screen.getByLabelText(`${date}: 165 calories`)).toBeTruthy());
  expect(client.getQueryData(["diary", "user-a", date])).toMatchObject({ summary: { calorieTotal: "165" } });
  jest.mocked(authClient.useSession).mockReturnValue({ data: { user: { id: "user-b" } } } as ReturnType<typeof authClient.useSession>);
  jest.mocked(diaryRepository.getDay).mockImplementation(async (dayDate) => ({ ...emptyDay, localDate: dayDate }));
  rerenderNutrition();
  await waitFor(() => expect(screen.getByLabelText(`${date}: 0 calories`)).toBeTruthy());
  expect(client.getQueryData(["diary", "user-b", date])).toMatchObject({ summary: { calorieTotal: "0" } });
  expect(screen.queryByLabelText(`${date}: 165 calories`)).toBeNull();
});

it("marks failed historical days unavailable instead of showing zero", async () => {
  jest.mocked(diaryRepository.getDay).mockRejectedValue(new Error("Unavailable"));
  renderNutrition();
  fireEvent.press(screen.getByRole("button", { name: "Calories" }));
  await screen.findByRole("button", { name: "Retry recent days" });
  expect(screen.getByLabelText(`${date}: unavailable`)).toBeTruthy();
  expect(screen.queryByLabelText(`${date}: 0 calories`)).toBeNull();
});

it("keeps Goals and selected-day Nutrition reachable from More", () => {
  const client = new QueryClient();
  const navigation = { navigate: jest.fn() };
  render(<QueryClientProvider client={client}><MoreScreen navigation={navigation} /></QueryClientProvider>);
  fireEvent.press(screen.getByText("Goals"));
  expect(navigation.navigate).toHaveBeenCalledWith("Goals");
  fireEvent.press(screen.getByText("Nutrition"));
  expect(navigation.navigate).toHaveBeenCalledWith("Nutrition", { date });
});
