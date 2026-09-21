import { useMemo } from "react";

import { featureFlags } from "@/config/features";
import { useServerDayLog } from "@/hooks/useServerDayLog";
import { todayKey } from "@/services/dates";
import { exerciseCalories } from "@/services/nutritionMath";
import { emptyLog, useAppStore } from "@/store/useAppStore";
import { DailyLog } from "@/types/domain";

/**
 * The stored log for a day, or a stable empty one.
 *
 * Selectors must not build a new object per call — zustand compares snapshots
 * by identity, so an inline `logs[date] || emptyLog(date)` selector would
 * report a change on every render.
 */
export function useLog(date: string): DailyLog {
  return useDayLog(date).log;
}

/**
 * Everything a day surface needs: the log itself plus the derived totals that
 * three different screens would otherwise each recompute.
 */
export function useDayLog(date?: string) {
  const selectedDate = useAppStore((state) => state.selectedDate);
  const key = date || selectedDate;
  const local = useAppStore((state) => state.logs[key]);
  const goal = useAppStore((state) => state.goal);
  const server = useServerDayLog(key);

  return useMemo(() => {
    const localLog = local || emptyLog(key);
    const log: DailyLog = {
      ...server.log,
      waterMl: featureFlags.water.enabled ? localLog.waterMl : server.log.waterMl,
      exercises: featureFlags.exercise.enabled ? localLog.exercises : server.log.exercises,
      ...(featureFlags.exercise.enabled && localLog.steps !== undefined ? { steps: localLog.steps } : {}),
      ...(localLog.notes === undefined ? {} : { notes: localLog.notes })
    };
    const totals = server.totals;
    const burned = exerciseCalories(log);

    return {
      date: key,
      log,
      totals,
      exerciseCalories: burned,
      remaining: goal.calories - totals.calories + burned,
      isLoading: server.isLoading && !server.day,
      isError: server.isError,
      isOffline: server.isOffline,
      error: server.error,
      createEntry: server.createEntry,
      updateEntry: server.updateEntry,
      deleteEntry: server.deleteEntry
    };
  }, [key, local, goal, server]);
}

export function useTodayLog() {
  return useDayLog(todayKey());
}
