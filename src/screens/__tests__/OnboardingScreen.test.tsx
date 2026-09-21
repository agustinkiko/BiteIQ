import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { authClient } from "@/auth/authClient";
import { defaultGoal, defaultUser } from "@/config/defaults";
import { profileRepository } from "@/repositories/profileRepository";
import { OnboardingScreen } from "@/screens/OnboardingScreen";
import { useAppStore } from "@/store/useAppStore";
import { CalculatedGoal, StoredGoal, UserProfile } from "@/types/domain";

jest.mock("@/auth/authClient", () => ({
  authClient: { useSession: jest.fn() }
}));

jest.mock("@/repositories/profileRepository", () => {
  class ProfileConfirmationRequiredError extends Error {
    public readonly warnings: string[];

    constructor(mockWarnings: string[]) {
      super("Review and confirm the profile safety warnings before saving.");
      this.name = "ProfileConfirmationRequiredError";
      this.warnings = mockWarnings;
    }
  }

  class GoalConfirmationRequiredError extends Error {}

  return {
    ProfileConfirmationRequiredError,
    GoalConfirmationRequiredError,
    profileRepository: {
      get: jest.fn(),
      getGoal: jest.fn(),
      update: jest.fn(),
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
  biologicalSex: "unspecified",
  heightCm: 175,
  countryCode: "PH",
  timezone: "Asia/Manila",
  languageCode: "en",
  measurementSystem: "metric"
};

const calculatedGoal: CalculatedGoal = {
  equation: "mifflin_st_jeor",
  equationInputs: {
    biologicalSex: "unspecified",
    weightKg: 75,
    heightCm: 175,
    age: 36,
    activityLevel: "moderately_active",
    timezone: "Asia/Manila",
    calculationDate: "2026-09-08T00:00:00.000Z"
  },
  bmrKcal: "0.000",
  activityMultiplier: "1.550",
  tdeeKcal: "0.000",
  calorieAdjustmentKcal: "-550.000",
  calorieTargetKcal: "2200.000",
  proteinTargetG: "165.000",
  carbohydrateTargetG: "220.000",
  fatTargetG: "73.333",
  isManualCalorieTarget: true,
  warnings: []
};

const storedGoalA: StoredGoal = {
  ...calculatedGoal,
  goalType: "lose",
  startingWeightKg: "75",
  currentWeightKg: "75",
  targetWeightKg: "70",
  weeklyRateKg: "-0.5",
  activityLevel: "moderately_active",
  plannedExerciseInActivity: false,
  targetMode: "percentage"
};

function renderOnboarding() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity }
    }
  });
  const rendered = render(
    <QueryClientProvider client={client}>
      <OnboardingScreen />
    </QueryClientProvider>
  );
  return {
    ...rendered,
    client,
    rerenderOnboarding: () => rendered.rerender(
      <QueryClientProvider client={client}>
        <OnboardingScreen />
      </QueryClientProvider>
    )
  };
}

async function advanceToActivity() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Start tracking" }).props.accessibilityState?.disabled).toBe(false)
  );
  fireEvent.changeText(screen.getByDisplayValue(""), "Alice");
  fireEvent.press(screen.getByRole("button", { name: "Start tracking" }));
  await screen.findByText("Your goal");
  fireEvent.press(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("Activity");
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

describe("OnboardingScreen server profile boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-b" } },
      isPending: false
    } as ReturnType<typeof authClient.useSession>);
    repository.getGoal.mockResolvedValue(null);
    useAppStore.setState({ hasCompletedOnboarding: false, serverStateUserId: undefined });
  });

  it("shows height validation next to the field instead of silently blocking navigation", async () => {
    repository.get.mockResolvedValue(null);
    renderOnboarding();
    await waitFor(() => expect(screen.getByRole("button", { name: "Start tracking" }).props.accessibilityState?.disabled).toBe(false));
    fireEvent.changeText(screen.getByLabelText("Name"), "QA");
    fireEvent.changeText(screen.getByLabelText("Height (cm)"), "0");
    fireEvent.press(screen.getByRole("button", { name: "Start tracking" }));
    expect(await screen.findByText("Number must be greater than 0")).toBeTruthy();
    expect(screen.queryByText("Your goal")).toBeNull();
  });

  it("reloads an existing User B profile and goal in user-scoped query caches", async () => {
    const profile = {
      userId: "server-returned-id",
      displayName: "Bob",
      dateOfBirth: "1990-01-01",
      biologicalSex: "male" as const,
      heightCm: "180",
      countryCode: "US",
      timezone: "America/Los_Angeles",
      languageCode: "en",
      measurementSystem: "imperial" as const
    };
    const goal = {
      goalType: "maintain" as const,
      startingWeightKg: "80",
      currentWeightKg: "80",
      targetWeightKg: "80",
      weeklyRateKg: "0",
      activityLevel: "moderately_active" as const,
      plannedExerciseInActivity: false,
      equation: "mifflin_st_jeor" as const,
      equationInputs: {
        biologicalSex: "male" as const,
        weightKg: 80,
        heightCm: 180,
        age: 36,
        activityLevel: "moderately_active" as const,
        timezone: "America/Los_Angeles",
        calculationDate: "2026-09-08"
      },
      bmrKcal: "1780",
      activityMultiplier: "1.55",
      tdeeKcal: "2759",
      calorieAdjustmentKcal: "0",
      calorieTargetKcal: "2759",
      proteinTargetG: "160",
      carbohydrateTargetG: "300",
      fatTargetG: "90",
      targetMode: "percentage" as const,
      isManualCalorieTarget: false
    };
    repository.get.mockResolvedValue(profile);
    repository.getGoal.mockResolvedValue(goal);

    const { client } = renderOnboarding();

    await waitFor(() => expect(useAppStore.getState().serverStateUserId).toBe("user-b"));
    expect(useAppStore.getState().hasCompletedOnboarding).toBe(true);
    expect(useAppStore.getState().user).toMatchObject({
      id: "user-b",
      name: "Bob",
      timezone: "America/Los_Angeles"
    });
    expect(client.getQueryData(["profile", "user-b"])).toEqual(profile);
    expect(client.getQueryData(["goal", "user-b"])).toEqual(goal);
    expect(client.getQueryData(["profile"])).toBeUndefined();
    expect(client.getQueryData(["goal"])).toBeUndefined();
  });

  it("blocks form advancement while the authoritative profile lookup is unresolved", async () => {
    let resolveProfile!: (value: null) => void;
    repository.get.mockImplementation(() => new Promise<null>((resolve) => { resolveProfile = resolve; }));
    renderOnboarding();

    fireEvent.changeText(screen.getByDisplayValue(""), "Returning user");

    expect(screen.getByRole("button", { name: "Start tracking" }).props.accessibilityState?.disabled).toBe(true);
    expect(screen.queryByText("Your goal")).toBeNull();

    await act(async () => resolveProfile(null));
    await waitFor(() => expect(screen.getByRole("button", { name: "Start tracking" }).props.accessibilityState?.disabled).toBe(false));
  });

  it("shows profile warnings and retries only after a second confirmation", async () => {
    const { ProfileConfirmationRequiredError } = jest.requireMock("@/repositories/profileRepository");
    repository.get.mockResolvedValue(null);
    repository.update
      .mockRejectedValueOnce(new ProfileConfirmationRequiredError(["LOW_CALORIE_TARGET"]))
      .mockResolvedValueOnce({
        displayName: "Alex",
        dateOfBirth: "1990-01-01",
        biologicalSex: "unspecified",
        heightCm: 175,
        countryCode: "PH",
        timezone: "Asia/Manila",
        languageCode: "en",
        measurementSystem: "metric"
      });
    repository.calculateGoal.mockResolvedValue({
      equation: "mifflin_st_jeor",
      equationInputs: {
        biologicalSex: "unspecified",
        weightKg: 75,
        heightCm: 175,
        age: 36,
        activityLevel: "moderately_active",
        timezone: "Asia/Manila",
        calculationDate: "2026-09-08T00:00:00.000Z"
      },
      bmrKcal: "0.000",
      activityMultiplier: "1.550",
      tdeeKcal: "0.000",
      calorieAdjustmentKcal: "-550.000",
      calorieTargetKcal: "2200.000",
      proteinTargetG: "165.000",
      carbohydrateTargetG: "220.000",
      fatTargetG: "73.333",
      isManualCalorieTarget: true,
      warnings: []
    });
    renderOnboarding();

    await waitFor(() => expect(screen.getByRole("button", { name: "Start tracking" }).props.accessibilityState?.disabled).toBe(false));
    fireEvent.changeText(screen.getByDisplayValue(""), "Alex");
    fireEvent.press(screen.getByRole("button", { name: "Start tracking" }));
    await screen.findByText("Your goal");
    fireEvent.press(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Activity");
    fireEvent.press(screen.getByRole("button", { name: "Calculate target" }));

    expect(await screen.findByText("Confirm profile safety warning")).toBeTruthy();
    expect(repository.update).toHaveBeenCalledTimes(1);

    fireEvent.press(screen.getByRole("button", { name: "I understand, update profile" }));

    await waitFor(() => expect(repository.update).toHaveBeenCalledTimes(2));
    expect(repository.update.mock.calls[1][1]).toEqual(["LOW_CALORIE_TARGET"]);
    expect(await screen.findByText("Review your estimate")).toBeTruthy();
  });

  it("does not apply User A's late onboarding review after switching to User B", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-a" } },
      isPending: false
    } as ReturnType<typeof authClient.useSession>);
    repository.get.mockResolvedValue(null);
    repository.update.mockResolvedValue(profileA);
    let finishCalculation!: (value: CalculatedGoal) => void;
    repository.calculateGoal.mockImplementation(
      () => new Promise<CalculatedGoal>((resolve) => {
        finishCalculation = resolve;
      })
    );
    const { client, rerenderOnboarding } = renderOnboarding();
    await advanceToActivity();

    fireEvent.press(screen.getByRole("button", { name: "Calculate target" }));
    await waitFor(() => expect(repository.calculateGoal).toHaveBeenCalledTimes(1));
    act(() => switchFromUserAToUserB());
    rerenderOnboarding();
    await waitFor(() => expect(client.getQueryState(["profile", "user-b"])?.status).toBe("success"));
    await act(async () => {
      finishCalculation(calculatedGoal);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(client.getQueryData(["profile", "user-a"])).toBeNull();
    expect(useAppStore.getState().serverStateUserId).toBe("user-b");
    expect(useAppStore.getState().goal.calories).toBe(2600);
    expect(screen.queryByText("Review your estimate")).toBeNull();
  });

  it("does not apply User A's late onboarding save after switching to User B", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-a" } },
      isPending: false
    } as ReturnType<typeof authClient.useSession>);
    repository.get.mockResolvedValue(null);
    repository.update.mockResolvedValue(profileA);
    repository.calculateGoal.mockResolvedValue(calculatedGoal);
    let finishSave!: (value: { goal: StoredGoal }) => void;
    repository.saveGoal.mockImplementation(
      () => new Promise<{ goal: StoredGoal }>((resolve) => {
        finishSave = resolve;
      })
    );
    const { client, rerenderOnboarding } = renderOnboarding();
    await advanceToActivity();
    fireEvent.press(screen.getByRole("button", { name: "Calculate target" }));
    await screen.findByText("Review your estimate");

    fireEvent.press(screen.getByRole("button", { name: "Save goal" }));
    await waitFor(() => expect(repository.saveGoal).toHaveBeenCalledTimes(1));
    act(() => switchFromUserAToUserB());
    rerenderOnboarding();
    await waitFor(() => expect(client.getQueryState(["profile", "user-b"])?.status).toBe("success"));
    await act(async () => {
      finishSave({ goal: storedGoalA });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(client.getQueryData(["goal", "user-a"])).toBeNull();
    expect(useAppStore.getState().serverStateUserId).toBe("user-b");
    expect(useAppStore.getState().user.name).toBe("Bob");
    expect(useAppStore.getState().goal.calories).toBe(2600);
  });

  it("does not show User A's delayed onboarding error to User B", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-a" } },
      isPending: false
    } as ReturnType<typeof authClient.useSession>);
    repository.get.mockResolvedValue(null);
    let failReview!: (error: Error) => void;
    repository.update.mockImplementation(
      () => new Promise<UserProfile>((_resolve, reject) => {
        failReview = reject;
      })
    );
    const { client, rerenderOnboarding } = renderOnboarding();
    await advanceToActivity();
    fireEvent.press(screen.getByRole("button", { name: "Calculate target" }));
    await waitFor(() => expect(repository.update).toHaveBeenCalledTimes(1));

    act(() => switchFromUserAToUserB());
    rerenderOnboarding();
    await waitFor(() => expect(client.getQueryState(["profile", "user-b"])?.status).toBe("success"));
    const { ProfileConfirmationRequiredError } = jest.requireMock("@/repositories/profileRepository");
    await act(async () => {
      failReview(new ProfileConfirmationRequiredError(["LOW_CALORIE_TARGET"]));
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(screen.queryByText("Confirm profile safety warning")).toBeNull();
    expect(screen.queryByText("Could not save your goal.")).toBeNull();
  });

  it("does not keep User B busy while User A's onboarding review remains pending", async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: "user-a" } },
      isPending: false
    } as ReturnType<typeof authClient.useSession>);
    repository.get.mockResolvedValue(null);
    repository.update.mockImplementation(() => new Promise<UserProfile>(() => undefined));
    const { client, rerenderOnboarding } = renderOnboarding();
    await advanceToActivity();
    fireEvent.press(screen.getByRole("button", { name: "Calculate target" }));
    await waitFor(() => expect(repository.update).toHaveBeenCalledTimes(1));

    act(() => switchFromUserAToUserB());
    rerenderOnboarding();
    await waitFor(() => expect(client.getQueryState(["profile", "user-b"])?.status).toBe("success"));

    expect(screen.getByRole("button", { name: "Start tracking" }).props.accessibilityState?.disabled).toBe(false);
  });
});
