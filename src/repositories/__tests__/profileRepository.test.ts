import { authClient } from "@/auth/authClient";
import {
  GoalConfirmationRequiredError,
  profileRepository
} from "@/repositories/profileRepository";
import { CalculatedGoal, GoalInput, ProfileInput } from "@/types/domain";

jest.mock("@/auth/authClient", () => ({
  authClient: { getCookie: jest.fn() }
}));

const mockGetCookie = authClient.getCookie as jest.MockedFunction<typeof authClient.getCookie>;

type StubResponse = {
  ok: boolean;
  status: number;
  json: jest.Mock<Promise<unknown>, []>;
};

function response(status: number, body: unknown): StubResponse {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body)
  };
}

const profile: ProfileInput = {
  displayName: "Alex",
  dateOfBirth: "1996-06-15",
  biologicalSex: "male",
  heightCm: 180,
  countryCode: "PH",
  timezone: "Asia/Manila",
  languageCode: "en",
  measurementSystem: "metric"
};

const goal: GoalInput = {
  goalType: "lose",
  startingWeightKg: 80,
  currentWeightKg: 80,
  targetWeightKg: 72,
  weeklyRateKg: -0.5,
  activityLevel: "sedentary",
  plannedExerciseInActivity: false,
  targetMode: "percentage",
  macros: { protein: 30, carbohydrate: 40, fat: 30 }
};

const lowCalculation: CalculatedGoal = {
  equation: "mifflin_st_jeor",
  equationInputs: {
    biologicalSex: "male",
    weightKg: 80,
    heightCm: 180,
    age: 30,
    activityLevel: "sedentary",
    timezone: "Asia/Manila",
    calculationDate: "2026-09-08T00:00:00.000Z"
  },
  bmrKcal: "1780.000",
  activityMultiplier: "1.200",
  tdeeKcal: "2136.000",
  calorieAdjustmentKcal: "-1100.000",
  calorieTargetKcal: "1036.000",
  proteinTargetG: "77.700",
  carbohydrateTargetG: "103.600",
  fatTargetG: "34.533",
  isManualCalorieTarget: false,
  warnings: ["LOW_CALORIE_TARGET"]
};

describe("profileRepository", () => {
  const fetchMock = jest.fn<Promise<StubResponse>, [RequestInfo | URL, RequestInit?]>();

  beforeEach(() => {
    mockGetCookie.mockReset();
    mockGetCookie.mockReturnValue("better-auth.session_token=session-value");
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("gets the signed-in user's profile without sending a UUID", async () => {
    fetchMock.mockResolvedValue(response(200, { profile }));

    await expect(profileRepository.get()).resolves.toEqual(profile);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://biteiq.test/api/me");
    expect(options?.method).toBeUndefined();
    expect(options?.body).toBeUndefined();
  });

  it("gets the signed-in user's goal without sending a UUID", async () => {
    fetchMock.mockResolvedValue(response(200, { goal: lowCalculation }));

    await expect(profileRepository.getGoal()).resolves.toEqual(lowCalculation);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://biteiq.test/api/goals");
    expect(options?.method).toBeUndefined();
    expect(options?.body).toBeUndefined();
  });

  it("updates the signed-in profile with required fields and no user UUID", async () => {
    fetchMock.mockResolvedValue(response(200, { profile }));

    await expect(
      profileRepository.update({ ...profile, userId: "injected-user-id" } as ProfileInput)
    ).resolves.toEqual(profile);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://biteiq.test/api/me");
    expect(options?.method).toBe("PATCH");
    expect(JSON.parse(String(options?.body))).toEqual({ ...profile, confirmedWarnings: [] });
    expect(JSON.parse(String(options?.body))).not.toHaveProperty("userId");
  });

  it("retries a profile update only after the returned warnings are confirmed", async () => {
    fetchMock.mockResolvedValueOnce(
      response(400, {
        error: {
          code: "INVALID_INPUT",
          message: "Confirm these warnings before saving: LOW_CALORIE_TARGET.",
          warnings: ["LOW_CALORIE_TARGET"]
        }
      })
    );

    await expect(profileRepository.update({ heightCm: 50 })).rejects.toMatchObject({
      name: "ProfileConfirmationRequiredError",
      warnings: ["LOW_CALORIE_TARGET"]
    });

    fetchMock.mockResolvedValueOnce(response(200, { profile: { ...profile, heightCm: 50 } }));
    await profileRepository.update(
      { heightCm: 50, userId: "injected-user-id" } as never,
      ["LOW_CALORIE_TARGET"]
    );

    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      heightCm: 50,
      confirmedWarnings: ["LOW_CALORIE_TARGET"]
    });
  });

  it("calculates a goal from required metric goal fields and no user UUID", async () => {
    fetchMock.mockResolvedValue(response(200, { calculation: lowCalculation }));

    await expect(
      profileRepository.calculateGoal({ ...goal, userId: "injected-user-id" } as GoalInput)
    ).resolves.toEqual(lowCalculation);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://biteiq.test/api/goals/calculate");
    expect(options?.method).toBe("POST");
    expect(JSON.parse(String(options?.body))).toEqual(goal);
    expect(JSON.parse(String(options?.body))).not.toHaveProperty("userId");
  });

  it("requires a second explicit confirmation before saving a low-calorie target", async () => {
    await expect(profileRepository.saveGoal(goal, lowCalculation)).rejects.toEqual(
      new GoalConfirmationRequiredError(["LOW_CALORIE_TARGET"])
    );
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(response(200, { goal: lowCalculation }));
    await profileRepository.saveGoal(
      { ...goal, userId: "injected-user-id" } as GoalInput,
      lowCalculation,
      ["LOW_CALORIE_TARGET"]
    );

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://biteiq.test/api/goals");
    expect(options?.method).toBe("PUT");
    expect(JSON.parse(String(options?.body))).toEqual({
      ...goal,
      confirmedWarnings: ["LOW_CALORIE_TARGET"]
    });
    expect(JSON.parse(String(options?.body))).not.toHaveProperty("userId");
  });
});
