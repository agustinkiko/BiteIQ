import { describe, expect, it } from "vitest";

import { calculateGoal } from "../../src/modules/goals/calculator.js";

const baseInput = {
  dateOfBirth: "1996-06-15",
  biologicalSex: "male" as const,
  heightCm: 180,
  timezone: "Asia/Manila",
  calculationDate: "2026-09-08T00:00:00.000Z",
  goalType: "maintain" as const,
  startingWeightKg: 80,
  currentWeightKg: 80,
  targetWeightKg: 80,
  weeklyRateKg: 0,
  activityLevel: "sedentary" as const,
  plannedExerciseInActivity: false,
  targetMode: "percentage" as const,
  macros: { protein: 30, carbohydrate: 40, fat: 30 },
};

describe("calculateGoal", () => {
  it("uses Mifflin-St Jeor and the sedentary multiplier for a male", () => {
    const result = calculateGoal(baseInput);

    expect(result.bmrKcal).toBe("1780.000");
    expect(result.tdeeKcal).toBe("2136.000");
  });

  it("uses the female Mifflin-St Jeor offset", () => {
    const result = calculateGoal({
      ...baseInput,
      dateOfBirth: "2006-01-01",
      biologicalSex: "female",
      heightCm: 180,
      currentWeightKg: 75,
    });

    expect(result.bmrKcal).toBe("1614.000");
  });

  it("converts a losing rate of 0.5 kg per week to minus 550 kcal per day", () => {
    const result = calculateGoal({
      ...baseInput,
      goalType: "lose",
      weeklyRateKg: -0.5,
    });

    expect(result.calorieAdjustmentKcal).toBe("-550.000");
  });

  it("keeps a manual 2100 kcal target after profile inputs change", () => {
    const result = calculateGoal({
      ...baseInput,
      heightCm: 165,
      currentWeightKg: 65,
      manualCalorieTargetKcal: 2100,
    });

    expect(result.calorieTargetKcal).toBe("2100.000");
    expect(result.isManualCalorieTarget).toBe(true);
  });

  it("converts 30/40/30 percentages at 2000 kcal to three-decimal gram targets", () => {
    const result = calculateGoal({
      ...baseInput,
      manualCalorieTargetKcal: 2000,
    });

    expect(result.proteinTargetG).toBe("150.000");
    expect(result.carbohydrateTargetG).toBe("200.000");
    expect(result.fatTargetG).toBe("66.667");
  });

  it("calculates completed age in the supplied IANA timezone", () => {
    const instant = "2026-01-01T00:30:00.000Z";
    const losAngeles = calculateGoal({
      ...baseInput,
      dateOfBirth: "1996-01-01",
      calculationDate: instant,
      timezone: "America/Los_Angeles",
    });
    const tokyo = calculateGoal({
      ...baseInput,
      dateOfBirth: "1996-01-01",
      calculationDate: instant,
      timezone: "Asia/Tokyo",
    });

    expect(losAngeles.equationInputs.age).toBe(29);
    expect(tokyo.equationInputs.age).toBe(30);
  });

  it("returns safety warnings without clamping the calculated target", () => {
    const result = calculateGoal({
      ...baseInput,
      goalType: "lose",
      weeklyRateKg: -1.1,
    });

    expect(result.warnings).toContain("EXTREME_RATE");
    expect(result.warnings).toContain("LOW_CALORIE_TARGET");
    expect(result.calorieTargetKcal).toBe("926.000");
  });

  it("requires manual calories when biological sex is unspecified", () => {
    expect(() =>
      calculateGoal({ ...baseInput, biologicalSex: "unspecified" }),
    ).toThrow(/manual calorie target/i);
  });

  it("rejects invalid dates, timezones, macro totals, and unknown fields", () => {
    expect(() =>
      calculateGoal({ ...baseInput, dateOfBirth: "2026-02-30" }),
    ).toThrow();
    expect(() =>
      calculateGoal({ ...baseInput, timezone: "Mars/Olympus" }),
    ).toThrow();
    expect(() =>
      calculateGoal({
        ...baseInput,
        macros: { protein: 30, carbohydrate: 30, fat: 30 },
      }),
    ).toThrow();
    expect(() =>
      calculateGoal({ ...baseInput, userId: "injected" } as never),
    ).toThrow();
  });

  it("rejects a date of birth after the local calculation date", () => {
    expect(() =>
      calculateGoal({ ...baseInput, dateOfBirth: "2027-01-01" }),
    ).toThrow(/date of birth/i);
  });

  it("stores exact gram targets without changing the calorie target", () => {
    const result = calculateGoal({
      ...baseInput,
      manualCalorieTargetKcal: 2100,
      targetMode: "grams",
      macros: { protein: 135.125, carbohydrate: 210.5, fat: 70.75 },
    });

    expect(result.calorieTargetKcal).toBe("2100.000");
    expect(result.proteinTargetG).toBe("135.125");
    expect(result.carbohydrateTargetG).toBe("210.500");
    expect(result.fatTargetG).toBe("70.750");
  });
});
