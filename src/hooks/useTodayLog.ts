import { useMemo } from "react";

import { useAppStore } from "@/store/useAppStore";
import { sumMeals } from "@/services/nutritionMath";

export function useTodayLog() {
  const logs = useAppStore((state) => state.logs);
  const today = new Date().toISOString().slice(0, 10);
  const log = logs.find((item) => item.date === today) || { date: today, meals: [] };

  return useMemo(
    () => ({
      log,
      totals: sumMeals(log.meals)
    }),
    [log]
  );
}
