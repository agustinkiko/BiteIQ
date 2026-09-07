import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { profileRepository } from "@/repositories/profileRepository";
import { OnboardingScreen } from "@/screens/OnboardingScreen";

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

function renderOnboarding() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity }
    }
  });
  return render(
    <QueryClientProvider client={client}>
      <OnboardingScreen />
    </QueryClientProvider>
  );
}

describe("OnboardingScreen server profile boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    repository.getGoal.mockResolvedValue(null);
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
});
