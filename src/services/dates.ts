/**
 * Diary dates are local calendar days, so every helper here works off local
 * time. `Date#toISOString` is UTC and would roll the diary over at the wrong
 * moment for most users, so it is deliberately not used.
 */

export type DateKey = string;

export function toDateKey(date: Date): DateKey {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function todayKey(): DateKey {
  return toDateKey(new Date());
}

export function fromDateKey(key: DateKey): Date {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function shiftDateKey(key: DateKey, days: number): DateKey {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

export function daysBetween(from: DateKey, to: DateKey): number {
  const ms = fromDateKey(to).getTime() - fromDateKey(from).getTime();
  return Math.round(ms / 86400000);
}

/** Keys for the last `count` days ending at `endKey`, oldest first. */
export function recentDateKeys(count: number, endKey: DateKey = todayKey()): DateKey[] {
  return Array.from({ length: count }, (_, index) => shiftDateKey(endKey, index - (count - 1)));
}

export function isToday(key: DateKey): boolean {
  return key === todayKey();
}

export function isFuture(key: DateKey): boolean {
  return daysBetween(todayKey(), key) > 0;
}

/** "Today", "Yesterday", "Tomorrow", or "Mon, Jun 28". */
export function formatDiaryDate(key: DateKey): string {
  const offset = daysBetween(todayKey(), key);
  if (offset === 0) return "Today";
  if (offset === -1) return "Yesterday";
  if (offset === 1) return "Tomorrow";
  return fromDateKey(key).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

export function formatShortDate(key: DateKey): string {
  return fromDateKey(key).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
