import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { authClient } from "@/auth/authClient";
import { defaultGoal, defaultUser } from "@/config/defaults";
import { profileRepository } from "@/repositories/profileRepository";
import { GoalsScreen } from "@/screens/GoalsScreen";
import { useAppStore } from "@/store/useAppStore";
import { CalculatedGoal, StoredGoal, UserProfile } from "@/types/domain";

jest.mock("@/auth/authClient", () => ({
  authClient: { useSession: jest.fn() }
}));

jest.mock("@/repositories/profileRepository", () => {
  class GoalConfirmationRequiredError extends Error {}
  return {
    GoalConfirmationRequiredError,
    profileRepository: {
      get: jest.fn(),
      getGoal: jest.fn(),
      calculateGoal: jest.fn(),
      saveGoal: jest.fn()
    }
  };
});

const repository = profileRepository as jest.Mocked<typeof profileRepository>;
const mockUseSession = authClient.useSession as jest.MockedFunction<typeof authClient.useSession>;

const profileA: UserProfile = {
  displayName: "Alice",
  dateOfBirth: "1990-01-01",
  biologicalSex: "female",
  heightCm: "165",
  countryCode: "PH",
  timezone: "Asia/Manila",
  languageCode: "en",
  measurementSystem: "metric"
};

const calculationA: CalculatedGoal = {
  equation: "mifflin_st_jeor",
  equationInputs: {
    biologicalSex: "female",
    weightKg: 75,
    heightCm: 165,
    age: 36,
    activityLevel: "moderately_active",
    timezone: "Asia/Manila",
    calculationDate: "2026-09-08"
  },
  bmrKcal: "1500",
  activityMultiplier: "1.55",
  tdeeKcal: "2325",
  calorieAdjustmentKcal: "-325",
  calorieTargetKcal: "2000",
  proteinTargetG: "150",
  carbohydrateTargetG: "200",
  fatTargetG: "67",
  isManualCalorieTarget: true,
  warnings: []
};

const goalA: StoredGoal = {
  ...calculationA,
  userId: "user-a",
  goalType: "lose",
  startingWeightKg: "75",
  currentWeightKg: "75",
  targetWeightKg: "70",
  weeklyRateKg: "-0.5",
  activityLevel: "moderately_active",
  plannedExerciseInActivity: false,
  targetMode: "percentage"
};

const goalB: StoredGoal = {
  ...goalA,
  userId: "user-b",
  calorieTargetKcal: "2600",
  targetWeightKg: "80"
};

function renderGoals() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity }
    }
  });
  const navigation = { goBack: jest.fn() };
  const element = () => (
    <QueryClientProvider client={client}>
      <GoalsScreen navigation={navigation as never} route={{} as never} />
    </QueryClientProvider>
  );
  const rendered = render(element());
  return {
    ...rendered,
    client,
    navigation,
    rerenderGoals: () => rendered.rerender(element())
  };
}

function switchFromUserAToUserB() {
  useAppStore.setState({
    hasCompletedOnboarding: true,
    serverStateUserId: "user-b",
    user: { ...defaultUser, id: "user-b", name: "Bob" },
    goal: { ...defaultGoal, calories: 2600 }
  });
  mockUseSession.mockReturnValue({
    data: { user: { id: "user-b" } },
    isPending: false
  } as ReturnType<typeof authClient.useSession>);
}

describe("GoalsScreen session ownership", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-a" } },
      isPending: false
    } as ReturnType<typeof authClient.useSession>);
    repository.get.mockResolvedValueOnce(profileA).mockResolvedValue({
      ...profileA,
      displayName: "Bob"
    });
    repository.getGoal.mockResolvedValueOnce(goalA).mockResolvedValue(goalB);
    useAppStore.setState({
      hasCompletedOnboarding: true,
      serverStateUserId: "user-a",
      user: { ...defaultUser, id: "user-a", name: "Alice" },
      goal: { ...defaultGoal, calories: 2000 }
    });
  });

  it("does not show User A's late calculation after switching to User B", async () => {
    let finishCalculation!: (value: CalculatedGoal) => void;
    repository.calculateGoal.mockImplementation(
      () => new Promise<CalculatedGoal>((resolve) => {
        finishCalculation = resolve;
      })
    );
    const { client, rerenderGoals } = renderGoals();
    await waitFor(() => expect(screen.getByDisplayValue("70")).toBeTruthy());

    fireEvent.press(screen.getByRole("button", { name: "Review calculated goal" }));
    await waitFor(() => expect(repository.calculateGoal).toHaveBeenCalledTimes(1));
    act(() => switchFromUserAToUserB());
    rerenderGoals();
    await waitFor(() => expect(client.getQueryData(["goal", "user-b"])).toEqual(goalB));
    await waitFor(() => expect(client.getQueryData(["profile", "user-b"])).toMatchObject({ displayName: "Bob" }));
    await act(async () => {
      finishCalculation(calculationA);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(useAppStore.getState().serverStateUserId).toBe("user-b");
    expect(useAppStore.getState().goal.calories).toBe(2600);
    expect(screen.queryByText("Review this estimate")).toBeNull();
  });

  it("does not apply User A's late goal save after switching to User B", async () => {
    repository.calculateGoal.mockResolvedValue(calculationA);
    const lateGoalA = { ...goalA, calorieTargetKcal: "1800" };
    let finishSave!: (value: { goal: StoredGoal }) => void;
    repository.saveGoal.mockImplementation(
      () => new Promise<{ goal: StoredGoal }>((resolve) => {
        finishSave = resolve;
      })
    );
    const { client, navigation, rerenderGoals } = renderGoals();
    await waitFor(() => expect(screen.getByDisplayValue("70")).toBeTruthy());
    fireEvent.press(screen.getByRole("button", { name: "Review calculated goal" }));
    await screen.findByText("Review this estimate");

    fireEvent.press(screen.getByRole("button", { name: "Save goals" }));
    await waitFor(() => expect(repository.saveGoal).toHaveBeenCalledTimes(1));
    act(() => switchFromUserAToUserB());
    rerenderGoals();
    await waitFor(() => expect(client.getQueryData(["goal", "user-b"])).toEqual(goalB));
    await waitFor(() => expect(client.getQueryData(["profile", "user-b"])).toMatchObject({ displayName: "Bob" }));
    await act(async () => {
      finishSave({ goal: lateGoalA });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(client.getQueryData(["goal", "user-a"])).toEqual(goalA);
    expect(client.getQueryData(["goal", "user-a"])).not.toEqual(lateGoalA);
    expect(useAppStore.getState().serverStateUserId).toBe("user-b");
    expect(useAppStore.getState().goal.calories).toBe(2600);
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it("does not show User A's delayed save error to User B", async () => {
    repository.calculateGoal.mockResolvedValue(calculationA);
    let failSave!: (error: Error) => void;
    repository.saveGoal.mockImplementation(
      () => new Promise<{ goal: StoredGoal }>((_resolve, reject) => {
        failSave = reject;
      })
    );
    const { client, rerenderGoals } = renderGoals();
    await waitFor(() => expect(screen.getByDisplayValue("70")).toBeTruthy());
    fireEvent.press(screen.getByRole("button", { name: "Review calculated goal" }));
    await screen.findByText("Review this estimate");
    fireEvent.press(screen.getByRole("button", { name: "Save goals" }));
    await waitFor(() => expect(repository.saveGoal).toHaveBeenCalledTimes(1));

    act(() => switchFromUserAToUserB());
    rerenderGoals();
    await waitFor(() => expect(client.getQueryData(["goal", "user-b"])).toEqual(goalB));
    const { GoalConfirmationRequiredError } = jest.requireMock("@/repositories/profileRepository");
    await act(async () => {
      failSave(new GoalConfirmationRequiredError());
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByText("Confirm safety warning")).toBeNull();
    expect(screen.queryByText("Could not update your goal.")).toBeNull();
  });

  it("does not keep User B busy while User A's goal calculation remains pending", async () => {
    repository.calculateGoal.mockImplementation(() => new Promise<CalculatedGoal>(() => undefined));
    const { client, rerenderGoals } = renderGoals();
    await waitFor(() => expect(screen.getByDisplayValue("70")).toBeTruthy());
    fireEvent.press(screen.getByRole("button", { name: "Review calculated goal" }));
    await waitFor(() => expect(repository.calculateGoal).toHaveBeenCalledTimes(1));

    act(() => switchFromUserAToUserB());
    rerenderGoals();
    await waitFor(() => expect(client.getQueryData(["goal", "user-b"])).toEqual(goalB));

    expect(screen.getByRole("button", { name: "Review calculated goal" }).props.accessibilityState?.disabled).toBe(false);
  });
});
