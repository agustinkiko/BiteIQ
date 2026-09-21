import {
  centimetersFromFeetAndInches,
  feetAndInchesFromCentimeters,
  formatGoalExplanation,
  kilogramsFromPounds
} from "@/services/goalPresentation";
import { CalculatedGoal } from "@/types/domain";

const calculatedGoal: CalculatedGoal = {
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
  calorieAdjustmentKcal: "-550.000",
  calorieTargetKcal: "1586.000",
  proteinTargetG: "118.950",
  carbohydrateTargetG: "158.600",
  fatTargetG: "52.867",
  isManualCalorieTarget: false,
  warnings: []
};

describe("formatGoalExplanation", () => {
  it("explains every part of the server estimate", () => {
    const explanation = formatGoalExplanation(calculatedGoal).join(" ").toLowerCase();

    expect(explanation).toContain("estimate");
    expect(explanation).toContain("mifflin-st jeor");
    expect(explanation).toContain("bmr");
    expect(explanation).toContain("1,780");
    expect(explanation).toContain("multiplier");
    expect(explanation).toContain("1.2");
    expect(explanation).toContain("tdee");
    expect(explanation).toContain("2,136");
    expect(explanation).toContain("adjustment");
    expect(explanation).toContain("-550");
    expect(explanation).toContain("target");
    expect(explanation).toContain("1,586");
  });
});

describe("imperial form conversion", () => {
  it("carries rounded inches into the next foot so a saved 182 cm profile remains valid", () => {
    expect(feetAndInchesFromCentimeters(182)).toEqual({ feet: 6, inches: 0 });
  });

  it.each([151.5, 152.4, 180, 182, 182.88, 210])("keeps rounded height %s cm in valid feet and inches", (centimeters) => {
    const { feet, inches } = feetAndInchesFromCentimeters(centimeters);
    expect(inches).toBeGreaterThanOrEqual(0);
    expect(inches).toBeLessThan(12);
    expect(Math.abs(centimetersFromFeetAndInches(feet, inches) - centimeters)).toBeLessThanOrEqual(1.27);
  });

  it("converts feet and inches to API centimeters at the form boundary", () => {
    expect(centimetersFromFeetAndInches(5, 10)).toBeCloseTo(177.8, 5);
  });

  it("converts pounds to API kilograms at the form boundary", () => {
    expect(kilogramsFromPounds(176)).toBeCloseTo(79.8323, 4);
  });
});
