import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, Polyline } from "react-native-svg";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { Segmented } from "@/components/Segmented";
import { TextField } from "@/components/TextField";
import { colors, radius, spacing } from "@/config/theme";
import { formatShortDate, recentDateKeys, todayKey } from "@/services/dates";
import { sumMeals } from "@/services/nutritionMath";
import { useAppStore } from "@/store/useAppStore";
import { DailyLog, WeightEntry } from "@/types/domain";

type Range = "7" | "30" | "90";

export function ProgressScreen({ navigation }: any) {
  const [range, setRange] = useState<Range>("30");
  const weights = useAppStore((state) => state.weights);
  const logs = useAppStore((state) => state.logs);
  const goal = useAppStore((state) => state.goal);
  const logWeight = useAppStore((state) => state.logWeight);
  const [weightInput, setWeightInput] = useState("");

  const days = Number(range);
  const keys = useMemo(() => recentDateKeys(days), [days]);

  const calorieSeries = keys.map((key) => sumMeals(logs[key]?.meals || []).calories);
  const loggedDays = calorieSeries.filter((value) => value > 0).length;
  const averageCalories = loggedDays ? Math.round(calorieSeries.reduce((sum, value) => sum + value, 0) / loggedDays) : 0;

  const weightSeries = weights.filter((entry) => entry.date >= keys[0]);
  const latest = weights[weights.length - 1];
  const first = weightSeries[0] || latest;
  const change = latest && first ? latest.weightKg - first.weightKg : 0;

  function saveWeight() {
    const parsed = Number(weightInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      Alert.alert("Enter a weight", "Add today's weight in kilograms.");
      return;
    }
    logWeight(parsed);
    setWeightInput("");
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.header}>
        <AppText variant="title" weight="800">
          Progress
        </AppText>
        <Pressable accessibilityRole="button" accessibilityLabel="Edit goals" hitSlop={10} onPress={() => navigation.navigate("Goals")}>
          <Ionicons name="options-outline" size={26} color={colors.muted} />
        </Pressable>
      </View>

      <Segmented
        value={range}
        onChange={setRange}
        options={[
          { value: "7", label: "7 days" },
          { value: "30", label: "30 days" },
          { value: "90", label: "90 days" }
        ]}
      />

      <Card style={styles.card}>
        <View style={styles.cardHead}>
          <View>
            <AppText variant="h3" weight="800">
              Weight
            </AppText>
            <AppText variant="small" color={colors.muted}>
              {latest ? `${latest.weightKg.toFixed(1)} kg` : "No weigh-ins yet"}
              {goal.goalWeightKg ? ` • goal ${goal.goalWeightKg.toFixed(1)} kg` : ""}
            </AppText>
          </View>
          {latest && weightSeries.length > 1 ? (
            <View style={[styles.deltaPill, { backgroundColor: change <= 0 ? colors.primarySoft : colors.warningSoft }]}>
              <AppText variant="small" weight="800" color={change <= 0 ? colors.success : colors.warning}>
                {change > 0 ? "+" : ""}
                {change.toFixed(1)} kg
              </AppText>
            </View>
          ) : null}
        </View>

        <WeightChart entries={weightSeries} goalWeightKg={goal.goalWeightKg} />

        <View style={styles.weightForm}>
          <View style={styles.weightField}>
            <TextField label="Today's weight (kg)" value={weightInput} onChangeText={setWeightInput} keyboardType="decimal-pad" placeholder="0.0" />
          </View>
          <Button label="Log" icon="add" onPress={saveWeight} style={styles.weightButton} />
        </View>
      </Card>

      <Card style={styles.card}>
        <AppText variant="h3" weight="800">
          Calories logged
        </AppText>
        <View style={styles.statRow}>
          <Stat label="Daily average" value={averageCalories ? `${averageCalories}` : "—"} detail="calories" />
          <Stat label="Days logged" value={`${loggedDays}`} detail={`of ${days}`} />
          <Stat label="Goal" value={`${goal.calories}`} detail="calories" />
        </View>
        <View style={styles.barRow}>
          {calorieSeries.slice(-14).map((value, index) => (
            <View key={keys.slice(-14)[index]} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.min(100, Math.max(2, (value / Math.max(goal.calories * 1.3, 1)) * 100))}%`,
                      backgroundColor: value > goal.calories ? colors.warning : colors.primary
                    }
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
        <AppText variant="tiny" color={colors.muted}>
          Last 14 days • bars over your goal are highlighted
        </AppText>
      </Card>

      <Card style={styles.card}>
        <AppText variant="h3" weight="800">
          Streak
        </AppText>
        <View style={styles.statRow}>
          <Stat label="Current streak" value={`${currentStreak(logs)}`} detail="days" />
          <Stat label="Water goal" value={`${Math.round(goal.waterMl / 240)}`} detail="cups/day" />
          <Stat label="Weigh-ins" value={`${weights.length}`} detail="recorded" />
        </View>
      </Card>
    </Screen>
  );
}

function WeightChart({ entries, goalWeightKg }: { entries: WeightEntry[]; goalWeightKg?: number }) {
  const width = 300;
  const height = 140;
  const padding = 12;

  if (entries.length < 2) {
    return (
      <View style={styles.chartEmpty}>
        <AppText variant="small" color={colors.muted}>
          Log at least two weigh-ins to see a trend line.
        </AppText>
      </View>
    );
  }

  const values = entries.map((entry) => entry.weightKg);
  const candidates = goalWeightKg ? [...values, goalWeightKg] : values;
  const min = Math.min(...candidates);
  const max = Math.max(...candidates);
  const span = max - min || 1;

  const points = entries.map((entry, index) => {
    const x = padding + (index / (entries.length - 1)) * (width - padding * 2);
    const y = height - padding - ((entry.weightKg - min) / span) * (height - padding * 2);
    return { x, y };
  });

  const goalY = goalWeightKg === undefined ? undefined : height - padding - ((goalWeightKg - min) / span) * (height - padding * 2);

  return (
    <View style={styles.chartWrap}>
      <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
        {goalY !== undefined ? (
          <Polyline points={`${padding},${goalY} ${width - padding},${goalY}`} stroke={colors.success} strokeWidth={1.5} strokeDasharray="6 6" />
        ) : null}
        <Polyline
          points={points.map((point) => `${point.x},${point.y}`).join(" ")}
          fill="none"
          stroke={colors.primary}
          strokeWidth={3}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((point, index) => (
          <Circle key={index} cx={point.x} cy={point.y} r={3.5} fill={colors.primary} />
        ))}
      </Svg>
      <View style={styles.chartLabels}>
        <AppText variant="tiny" color={colors.muted}>
          {formatShortDate(entries[0].date)}
        </AppText>
        <AppText variant="tiny" color={colors.muted}>
          {formatShortDate(entries[entries.length - 1].date)}
        </AppText>
      </View>
    </View>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <View style={styles.stat}>
      <AppText variant="h2" weight="800">
        {value}
      </AppText>
      <AppText variant="tiny" color={colors.muted}>
        {detail}
      </AppText>
      <AppText variant="small" color={colors.muted}>
        {label}
      </AppText>
    </View>
  );
}

/** Consecutive days ending today (or yesterday) that have at least one food. */
function currentStreak(logs: Record<string, DailyLog>): number {
  const keys = recentDateKeys(365, todayKey()).reverse();
  let streak = 0;

  for (const [index, key] of keys.entries()) {
    const logged = (logs[key]?.meals.length || 0) > 0;
    if (logged) {
      streak += 1;
      continue;
    }
    // Today not being logged yet shouldn't break a streak that's still alive.
    if (index === 0) continue;
    break;
  }

  return streak;
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  card: {
    gap: spacing.md
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md
  },
  deltaPill: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs
  },
  chartWrap: {
    gap: spacing.xs
  },
  chartEmpty: {
    minHeight: 90,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted
  },
  chartLabels: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  weightForm: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.md
  },
  weightField: {
    flex: 1
  },
  weightButton: {
    minWidth: 96
  },
  statRow: {
    flexDirection: "row",
    gap: spacing.md
  },
  stat: {
    flex: 1,
    gap: 2
  },
  barRow: {
    height: 90,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.xs
  },
  barColumn: {
    flex: 1,
    height: "100%",
    justifyContent: "flex-end"
  },
  barTrack: {
    height: "100%",
    justifyContent: "flex-end",
    borderRadius: radius.sm,
    overflow: "hidden",
    backgroundColor: colors.surfaceMuted
  },
  bar: {
    width: "100%",
    borderRadius: radius.sm
  }
});
