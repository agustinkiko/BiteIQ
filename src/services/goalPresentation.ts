import { CalculatedGoal } from "@/types/domain";

export function formatGoalExplanation(goal: CalculatedGoal): string[] {
  return [
    "This is an estimate calculated with the Mifflin-St Jeor equation.",
    `BMR: ${formatCalories(goal.bmrKcal)} kcal per day at rest.`,
    `Activity multiplier: ${formatDecimal(goal.activityMultiplier)}.`,
    `TDEE: ${formatCalories(goal.tdeeKcal)} kcal per day after activity.`,
    `Daily adjustment: ${formatSignedCalories(goal.calorieAdjustmentKcal)} kcal for your weight goal.`,
    `Daily calorie target: ${formatCalories(goal.calorieTargetKcal)} kcal.`
  ];
}

export function centimetersFromFeetAndInches(feet: number, inches: number): number {
  return (feet * 12 + inches) * 2.54;
}

export function kilogramsFromPounds(pounds: number): number {
  return pounds * 0.45359237;
}

export function feetAndInchesFromCentimeters(centimeters: number): { feet: number; inches: number } {
  const totalInches = centimeters / 2.54;
  const feet = Math.floor(totalInches / 12);
  return { feet, inches: Math.round(totalInches - feet * 12) };
}

export function poundsFromKilograms(kilograms: number): number {
  return kilograms / 0.45359237;
}

function formatCalories(value: string): string {
  return Math.round(Number(value)).toLocaleString("en-US");
}

function formatSignedCalories(value: string): string {
  const rounded = Math.round(Number(value));
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("en-US")}`;
}

function formatDecimal(value: string): string {
  return String(Number(value));
}
