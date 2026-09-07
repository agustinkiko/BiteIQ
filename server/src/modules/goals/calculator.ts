import { Decimal } from "decimal.js";

import {
  goalCalculationInputSchema,
  type CalculatedGoal,
  type GoalCalculationInput,
  type GoalWarning,
} from "./contracts.js";

const activityMultipliers = {
  sedentary: new Decimal("1.2"),
  lightly_active: new Decimal("1.375"),
  moderately_active: new Decimal("1.55"),
  very_active: new Decimal("1.725"),
  extremely_active: new Decimal("1.9"),
} as const;

export function calculateGoal(input: GoalCalculationInput): CalculatedGoal {
  const value = goalCalculationInputSchema.parse(input);
  if (value.biologicalSex === "unspecified" && value.manualCalorieTargetKcal === undefined) {
    throw new Error("A manual calorie target is required when biological sex is unspecified.");
  }

  const age = completedAge(
    value.dateOfBirth,
    value.calculationDate,
    value.timezone,
  );
  if (age < 0) {
    throw new Error("Date of birth cannot be after the calculation date.");
  }
  const weight = new Decimal(value.currentWeightKg);
  const height = new Decimal(value.heightCm);
  const bmr =
    value.biologicalSex === "unspecified"
      ? new Decimal(0)
      : weight
          .times(10)
          .plus(height.times("6.25"))
          .minus(new Decimal(age).times(5))
          .plus(value.biologicalSex === "male" ? 5 : -161);
  const multiplier = activityMultipliers[value.activityLevel];
  const tdee = bmr.times(multiplier);
  const adjustment = new Decimal(value.weeklyRateKg).times(7700).dividedBy(7);
  const calculatedTarget = tdee.plus(adjustment);
  const calorieTarget =
    value.manualCalorieTargetKcal === undefined
      ? calculatedTarget
      : new Decimal(value.manualCalorieTargetKcal);
  const warnings: GoalWarning[] = [];

  if (Math.abs(value.weeklyRateKg) > 1) {
    warnings.push("EXTREME_RATE");
  }
  if (calorieTarget.lessThan(1200)) {
    warnings.push("LOW_CALORIE_TARGET");
  }

  const macroTargets =
    value.targetMode === "percentage"
      ? {
          protein: calorieTarget.times(value.macros.protein).dividedBy(100).dividedBy(4),
          carbohydrate: calorieTarget
            .times(value.macros.carbohydrate)
            .dividedBy(100)
            .dividedBy(4),
          fat: calorieTarget.times(value.macros.fat).dividedBy(100).dividedBy(9),
        }
      : {
          protein: new Decimal(value.macros.protein),
          carbohydrate: new Decimal(value.macros.carbohydrate),
          fat: new Decimal(value.macros.fat),
        };

  return {
    equation: "mifflin_st_jeor",
    equationInputs: {
      biologicalSex: value.biologicalSex,
      weightKg: value.currentWeightKg,
      heightCm: value.heightCm,
      age,
      activityLevel: value.activityLevel,
      timezone: value.timezone,
      calculationDate: value.calculationDate,
    },
    bmrKcal: decimal(bmr),
    activityMultiplier: decimal(multiplier),
    tdeeKcal: decimal(tdee),
    calorieAdjustmentKcal: decimal(adjustment),
    calorieTargetKcal: decimal(calorieTarget),
    proteinTargetG: decimal(macroTargets.protein),
    carbohydrateTargetG: decimal(macroTargets.carbohydrate),
    fatTargetG: decimal(macroTargets.fat),
    isManualCalorieTarget: value.manualCalorieTargetKcal !== undefined,
    warnings,
  };
}

function decimal(value: Decimal): string {
  return value.toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3);
}

function completedAge(
  dateOfBirth: string,
  calculationDate: string,
  timezone: string,
): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date(calculationDate));
  const local = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(local.year);
  const month = Number(local.month);
  const day = Number(local.day);
  const [birthYear, birthMonth, birthDay] = dateOfBirth.split("-").map(Number);
  const beforeBirthday =
    month < birthMonth! || (month === birthMonth && day < birthDay!);

  return year - birthYear! - (beforeBirthday ? 1 : 0);
}
