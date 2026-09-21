import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { useDayLog } from "@/hooks/useDayLog";
import { foodRepository } from "@/repositories/foodRepository";
import { FoodDetailScreen } from "@/screens/FoodDetailScreen";
import { buildDatabaseMeal } from "@/services/foodEntry";
import { useAppStore } from "@/store/useAppStore";
import { DatabaseFood } from "@/types/domain";

jest.mock("@/hooks/useDayLog", () => ({ useDayLog: jest.fn() }));
jest.mock("@/repositories/foodRepository", () => ({ foodRepository: { get: jest.fn() } }));

const chicken: DatabaseFood = {
  id: "canonical-chicken",
  name: "Chicken breast, cooked",
  category: "protein",
  source: "usda",
  dataQuality: "verified_authoritative",
  per100g: { calories: 165, proteinGrams: 31, carbGrams: 0, fatGrams: 3.6 },
  servings: [{ id: "100g", label: "100 g", grams: 100 }]
};

const createEntry = jest.fn();
const updateEntry = jest.fn();
const deleteEntry = jest.fn();

function renderDetail(mode: "add" | "edit" = "add") {
  const meal = buildDatabaseMeal(chicken, "100g", 1, "breakfast", "2026-09-19");
  jest.mocked(useDayLog).mockReturnValue({
    log: { meals: [meal] }, isLoading: false, createEntry, updateEntry, deleteEntry
  } as unknown as ReturnType<typeof useDayLog>);
  const navigation = { navigate: jest.fn(), goBack: jest.fn() };
  render(<FoodDetailScreen navigation={navigation as never} route={{
    params: {
      mode, date: "2026-09-19", mealType: "breakfast", foodId: chicken.id,
      ...(mode === "edit" ? { mealId: meal.id, entryId: meal.entries[0].id } : {})
    }
  } as never} />);
  return { navigation, meal };
}

beforeEach(() => {
  jest.clearAllMocks();
  useAppStore.setState({ cachedFoods: { [chicken.id]: chicken } });
  jest.mocked(foodRepository.get).mockResolvedValue(chicken);
  createEntry.mockResolvedValue({ queued: false, day: {} });
  updateEntry.mockResolvedValue({});
  deleteEntry.mockResolvedValue({});
});

it("saves the chosen meal and 150 g quantity, then opens the diary after persistence", async () => {
  let finish!: (value: unknown) => void;
  createEntry.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { navigation } = renderDetail();
  await screen.findByText("Chicken breast, cooked");
  fireEvent.changeText(screen.getByLabelText("Number of servings"), "1.5");
  fireEvent.press(screen.getByRole("button", { name: "Dinner" }));
  fireEvent.press(screen.getByRole("button", { name: "Add to diary" }));
  expect(createEntry).toHaveBeenCalledWith({ foodId: chicken.id, servingId: "100g", quantity: 1.5, mealType: "dinner" });
  expect(screen.getAllByText("46.5 g").length).toBeGreaterThan(0);
  expect(navigation.navigate).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Saving…" }));
  expect(createEntry).toHaveBeenCalledTimes(1);
  await act(async () => finish({ queued: false, day: {} }));
  expect(navigation.navigate).toHaveBeenCalledWith("MainTabs", { screen: "Diary" });
});

it("keeps a failed add open with a visible error and allows a retry", async () => {
  createEntry.mockRejectedValueOnce(new Error("Food provider is unavailable."));
  const { navigation } = renderDetail();
  fireEvent.press(screen.getByRole("button", { name: "Add to diary" }));
  expect((await screen.findByRole("alert")).props.children).toContain("Food provider is unavailable.");
  expect(navigation.goBack).not.toHaveBeenCalled();
  expect(navigation.navigate).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Add to diary" }));
  await waitFor(() => expect(navigation.navigate).toHaveBeenCalledWith("MainTabs", { screen: "Diary" }));
});

it("shows an offline queued state without offering to add a duplicate", async () => {
  createEntry.mockResolvedValue({ queued: true });
  const { navigation } = renderDetail();
  fireEvent.press(screen.getByRole("button", { name: "Add to diary" }));
  expect((await screen.findByRole("alert")).props.children).toContain("Saved offline");
  expect(screen.queryByRole("button", { name: "Add to diary" })).toBeNull();
  expect(navigation.navigate).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "View diary" }));
  expect(navigation.navigate).toHaveBeenCalledWith("MainTabs", { screen: "Diary" });
});

it("rejects a zero quantity visibly without submitting", async () => {
  renderDetail();
  fireEvent.changeText(screen.getByLabelText("Number of servings"), "0");
  fireEvent.press(screen.getByRole("button", { name: "Add to diary" }));
  expect((await screen.findByRole("alert")).props.children).toContain("must be greater than zero");
  expect(createEntry).not.toHaveBeenCalled();
});

it("requires a visible delete confirmation and returns only when deletion succeeds", async () => {
  const { navigation, meal } = renderDetail("edit");
  fireEvent.press(screen.getByRole("button", { name: "Delete entry" }));
  expect(deleteEntry).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Keep entry" }));
  expect(deleteEntry).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole("button", { name: "Delete entry" }));
  fireEvent.press(screen.getByRole("button", { name: "Confirm delete" }));
  await waitFor(() => expect(navigation.goBack).toHaveBeenCalledTimes(1));
  expect(deleteEntry).toHaveBeenCalledWith(meal.entries[0].id);
});

it("shows a failed edit without closing the entry", async () => {
  updateEntry.mockRejectedValue(new Error("Reconnect to edit or delete this entry."));
  const { navigation } = renderDetail("edit");
  fireEvent.press(screen.getByRole("button", { name: "Save changes" }));
  expect((await screen.findByRole("alert")).props.children).toContain("Reconnect");
  expect(navigation.goBack).not.toHaveBeenCalled();
});
