import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useQueries } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withTiming } from "react-native-reanimated";

import { authClient } from "@/auth/authClient";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { MacroPie, PieSlice } from "@/components/MacroPie";
import { MacroRings, macroColors } from "@/components/MacroRings";
import { Reveal } from "@/components/motion";
import { ProgressBar } from "@/components/ProgressBar";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Segmented } from "@/components/Segmented";
import { colors, dataColors, elevation, motion, radius, spacing } from "@/config/theme";
import { useDayLog } from "@/hooks/useDayLog";
import { useServerDayLog } from "@/hooks/useServerDayLog";
import { DiaryDay, diaryRepository } from "@/repositories/diaryRepository";
import { formatDiaryDate, formatShortDate, recentDateKeys } from "@/services/dates";
import { caloriesForType, goalMacroSplit, ratio } from "@/services/nutritionMath";
import { useAppStore } from "@/store/useAppStore";
import { DailyLog, Goal, MealType, NutritionEstimate } from "@/types/domain";
import { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Nutrition">;

type Tab = "calories" | "nutrients" | "macros";

const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export function NutritionScreen({ navigation, route }: Props) {
  const { date } = route.params;
  const [tab, setTab] = useState<Tab>("macros");
  const { log, totals } = useDayLog(date);
  const server = useServerDayLog(date);
  const goal = useAppStore((state) => state.goal);

  if (!server.day) {
    return (
      <Screen contentStyle={styles.screen}>
        <ScreenHeader title="Nutrition" subtitle={formatDiaryDate(date)} onBack={() => navigation.goBack()} />
        {server.isError ? (
          <>
            <AppText accessibilityRole="alert">Nutrition could not be loaded. Try again.</AppText>
            <Button label="Retry nutrition" onPress={() => { void server.refetch(); }} />
          </>
        ) : (
          <><ActivityIndicator color={colors.primary} /><AppText>Loading nutrition…</AppText></>
        )}
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screen}>
      <ScreenHeader title="Nutrition" onBack={() => navigation.goBack()} />

      {server.isError ? (
        <>
          <AppText accessibilityRole="alert" color={colors.warning}>Showing saved nutrition. Reconnect to get the latest totals.</AppText>
          <Button label="Retry nutrition" variant="secondary" onPress={() => { void server.refetch(); }} />
        </>
      ) : null}

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "calories", label: "Calories" },
          { value: "nutrients", label: "Nutrients" },
          { value: "macros", label: "Macros" }
        ]}
      />

      <View style={styles.dayView}>
        <AppText variant="tiny" color={colors.muted}>
          Day view
        </AppText>
        <AppText variant="h3" weight="700">
          {formatDiaryDate(date)}
        </AppText>
      </View>

      {server.day.entries.length === 0 ? <AppText color={colors.muted} style={styles.centered}>Nothing logged for this day yet.</AppText> : null}

      {tab === "macros" ? <MacrosTab totals={totals} goal={goal} /> : null}
      {tab === "calories" ? <CaloriesTab date={date} log={log} totals={totals} goalCalories={goal.calories} /> : null}
      {tab === "nutrients" ? <NutrientsTab totals={totals} goal={goal} day={server.day} /> : null}
    </Screen>
  );
}

function MacrosTab({ totals, goal }: { totals: NutritionEstimate; goal: Goal }) {
  // Shares follow calorie contribution, which is how macro splits are
  // conventionally reported — grams alone would overstate carbs and protein.
  const macroCalories = totals.proteinGrams * 4 + totals.carbGrams * 4 + totals.fatGrams * 9;
  const share = (kcal: number) => (macroCalories > 0 ? Math.round((kcal / macroCalories) * 100) : 0);
  const target = goalMacroSplit(goal);
  const rows = [
    { key: "protein", label: "Protein", value: totals.proteinGrams, target: goal.proteinGrams, share: share(totals.proteinGrams * 4), color: macroColors.protein },
    { key: "carbs", label: "Carbohydrates", value: totals.carbGrams, target: goal.carbGrams, share: share(totals.carbGrams * 4), color: macroColors.carbs },
    { key: "fat", label: "Fats", value: totals.fatGrams, target: goal.fatGrams, share: share(totals.fatGrams * 9), color: macroColors.fat }
  ];

  return (
    <Reveal index={0}>
      <Card style={styles.card}>
        <MacroRings totals={totals} goal={goal} size={84} showRemaining={false} />
        <View style={styles.divider} />
        <AppText variant="h3" weight="700">
          Against your targets
        </AppText>
        {rows.map((row) => (
          <View key={row.key} style={styles.targetRow}>
            <View style={styles.targetHead}>
              <View style={[styles.swatch, { backgroundColor: row.color }]} />
              <AppText style={styles.flex}>{row.label}</AppText>
              <AppText variant="small" color={colors.muted}>{row.share}% of kcal</AppText>
              <AppText weight="600" style={styles.targetValue}>
                {Math.round(row.value)}g of {Math.round(row.target)}g
              </AppText>
            </View>
            <ProgressBar value={ratio(row.value, row.target)} color={row.value > row.target ? colors.coral : row.color} height={6} />
          </View>
        ))}
        <AppText variant="tiny" color={colors.muted}>
          Goal split: {target.protein}% protein / {target.carbs}% carbs / {target.fat}% fat
        </AppText>
      </Card>
    </Reveal>
  );
}

function CaloriesTab({
  date,
  log,
  totals,
  goalCalories
}: {
  date: string;
  log: DailyLog;
  totals: NutritionEstimate;
  goalCalories: number;
}) {
  const slices: PieSlice[] = mealTypes.map((mealType) => ({
    key: mealType,
    label: mealType === "snack" ? "Snacks" : mealType.slice(0, 1).toUpperCase() + mealType.slice(1),
    value: caloriesForType(log, mealType),
    color: dataColors[mealType]
  }));
  const eatenPercent = goalCalories > 0 ? Math.round((totals.calories / goalCalories) * 100) : 0;
  const remaining = goalCalories - totals.calories;
  // The ring is scaled to the goal: meals fill their share and the rest stays grey.
  const ringSlices: PieSlice[] = totals.calories > 0
    ? [...slices, { key: "remaining", label: "Remaining", value: Math.max(0, remaining), color: colors.lavender }]
    : slices;

  return (
    <>
      <Reveal index={0}>
        <Card style={styles.card}>
          <View style={styles.donutWrap}>
            <MacroPie slices={ringSlices} size={196} innerRatio={0.7}>
              <AppText variant="title" weight="700">
                {eatenPercent}%
              </AppText>
              <AppText variant="tiny" color={colors.muted}>
                of daily goal
              </AppText>
            </MacroPie>
          </View>
          <View style={styles.legendGrid}>
            {slices.map((slice) => (
              <View key={slice.key} style={styles.legendCell}>
                <View style={[styles.swatch, styles.legendSwatch, { backgroundColor: slice.color }]} />
                <View>
                  <AppText weight="500">{slice.label}</AppText>
                  <AppText variant="tiny" color={colors.muted}>
                    {totals.calories > 0 ? Math.round((slice.value / totals.calories) * 100) : 0}% ({Math.round(slice.value)} cal)
                  </AppText>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.summaryRows}>
            <SummaryRow label="Daily goal" value={`${goalCalories.toLocaleString()} cal`} />
            <SummaryRow label="Consumed" value={`${Math.round(totals.calories).toLocaleString()} cal`} />
            <SummaryRow label={remaining < 0 ? "Over" : "Remaining"} value={`${Math.abs(Math.round(remaining)).toLocaleString()} cal`} strong />
          </View>
        </Card>
      </Reveal>

      <Reveal index={1}>
        <WeeklyCalories date={date} goalCalories={goalCalories} />
      </Reveal>
    </>
  );
}

function SummaryRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <AppText color={colors.muted}>{label}</AppText>
      <AppText weight={strong ? "700" : "500"}>{value}</AppText>
    </View>
  );
}

function WeeklyCalories({ date, goalCalories }: { date: string; goalCalories: number }) {
  const userId = authClient.useSession().data?.user.id;
  const keys = recentDateKeys(7, date);
  const queries = useQueries({
    queries: keys.map((key) => ({
      queryKey: ["diary", userId, key],
      enabled: Boolean(userId),
      retry: false,
      queryFn: ({ signal }: { signal: AbortSignal }) => diaryRepository.getDay(key, signal)
    }))
  });
  const week = keys.map((key, index) => ({
    key,
    calories: queries[index].data ? Number(queries[index].data?.summary.calorieTotal) : undefined
  }));
  const peak = Math.max(goalCalories, ...week.map((day) => day.calories ?? 0), 1);
  const loading = queries.some((query) => query.isPending);
  const failed = queries.some((query) => query.isError);

  return (
    <Card style={styles.card}>
      <AppText variant="h3" weight="700">
        Last 7 days
      </AppText>
      {loading ? <AppText>Loading recent days…</AppText> : null}
      {failed ? (
        <>
          <AppText accessibilityRole="alert" color={colors.warning}>Some days could not be refreshed. Missing days are shown as —.</AppText>
          <Button label="Retry recent days" variant="secondary" onPress={() => { queries.filter((query) => query.isError).forEach((query) => { void query.refetch(); }); }} />
        </>
      ) : null}
      <View style={styles.chart}>
        <View pointerEvents="none" style={[styles.goalLine, { bottom: CHART_LABELS + (goalCalories / peak) * CHART_BARS }]}>
          <AppText variant="tiny" color={colors.subtle} style={styles.goalLineLabel}>
            Goal
          </AppText>
        </View>
        {week.map((day, index) => (
          <View key={day.key} style={styles.chartColumn} accessibilityLabel={`${day.key}: ${day.calories === undefined ? "unavailable" : `${Math.round(day.calories)} calories`}`}>
            <View style={styles.chartBarTrack}>
              {day.calories === undefined ? null : (
                <ChartBar
                  fraction={day.calories / peak}
                  delay={index * motion.stagger}
                  color={day.calories > goalCalories ? colors.coral : day.key === date ? colors.primary : colors.periwinkle}
                />
              )}
            </View>
            <AppText variant="tiny" weight={day.key === date ? "700" : "400"}>{day.calories === undefined ? "—" : Math.round(day.calories)}</AppText>
            <AppText variant="tiny" weight={day.key === date ? "700" : "400"} color={day.key === date ? colors.primary : colors.muted}>
              {formatShortDate(day.key)}
            </AppText>
          </View>
        ))}
      </View>
      <View style={styles.goalLineNote}>
        <View style={styles.goalDot} />
        <AppText variant="tiny" color={colors.muted}>
          Bars above your {goalCalories} cal goal are highlighted
        </AppText>
      </View>
    </Card>
  );
}

/** The design's nutrient table: a blue header row, then one line per nutrient with a colored rule under it. */
function NutrientsTab({ totals, goal, day }: { totals: NutritionEstimate; goal: Goal; day: DiaryDay }) {
  const rows = [
    { key: "energy", label: "Calories", value: totals.calories, target: goal.calories, unit: "", color: colors.primary },
    { key: "protein", label: "Protein", value: totals.proteinGrams, target: goal.proteinGrams, unit: "g", color: dataColors.protein },
    { key: "carbohydrate", label: "Carbohydrates", value: totals.carbGrams, target: goal.carbGrams, unit: "g", color: dataColors.carbs },
    { key: "fat", label: "Fat", value: totals.fatGrams, target: goal.fatGrams, unit: "g", color: dataColors.fat },
    // Reference values, not personal targets.
    { key: "fiber", label: "Fiber", value: totals.fiberGrams ?? 0, target: 30, unit: "g", color: colors.teal },
    { key: "sugar", label: "Sugar", value: totals.sugarGrams ?? 0, target: 50, unit: "g", color: colors.coral },
    { key: "sodium", label: "Sodium", value: totals.sodiumMg ?? 0, target: 2300, unit: "mg", color: colors.violet }
  ];

  return (
    <Reveal index={0}>
      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <AppText weight="700" color={colors.onPrimary} style={styles.flex}>Nutrients</AppText>
          <AppText variant="small" weight="600" color={colors.onPrimary} style={styles.totalColumn}>Total / Goal</AppText>
          <AppText variant="small" weight="600" color={colors.onPrimary} style={styles.leftColumn}>Left</AppText>
        </View>
        {rows.map((row) => {
          const reported = row.key === "energy" || day.entries.length === 0 || day.summary.nutrientTotals[row.key] !== undefined;
          const partial = reported && row.key !== "energy" && day.entries.some((entry) => entry.nutrientSnapshot[row.key] === undefined);
          const left = Math.round(row.target) - Math.round(row.value);
          return (
            <View key={row.label} style={styles.tableRow}>
              <View style={styles.tableCells}>
                <AppText style={styles.flex}>{row.label}</AppText>
                <AppText variant="small" weight="600" style={styles.totalColumn}>
                  {reported ? `${Math.round(row.value)}${row.unit}${partial ? " (partial)" : ` / ${Math.round(row.target)}${row.unit}`}` : "Not reported"}
                </AppText>
                <AppText variant="small" color={left < 0 ? colors.coral : colors.muted} style={styles.leftColumn}>
                  {reported && !partial ? `${left}${row.unit}` : "—"}
                </AppText>
              </View>
              {reported && !partial ? <ProgressBar value={ratio(row.value, row.target)} color={row.value > row.target ? colors.coral : row.color} height={3} /> : <View style={styles.tableRule} />}
            </View>
          );
        })}
        <View style={styles.tableFoot}>
          <AppText variant="tiny" color={colors.muted}>
            Not reported means the source did not supply this nutrient. Partial totals include only foods with reported values.
          </AppText>
          <AppText variant="tiny" color={colors.muted}>
            Fiber, sugar, and sodium use general daily reference values, not personal targets.
          </AppText>
        </View>
      </View>
    </Reveal>
  );
}

const CHART_BARS = 130;
const CHART_LABELS = 34;

/** One day's bar, growing up from the baseline a beat after its neighbour. */
function ChartBar({ fraction, delay, color }: { fraction: number; delay: number; color: string }) {
  const height = useSharedValue(0);
  useEffect(() => {
    height.value = withDelay(delay, withTiming(Math.max(0, Math.min(1, fraction)), { duration: motion.fill, easing: Easing.out(Easing.cubic) }));
  }, [delay, fraction, height]);
  const style = useAnimatedStyle(() => ({ height: `${height.value * 100}%` }));

  return <Animated.View style={[styles.chartBar, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md
  },
  centered: {
    textAlign: "center"
  },
  flex: {
    flex: 1
  },
  dayView: {
    alignItems: "center"
  },
  card: {
    gap: spacing.md
  },
  divider: {
    height: 1,
    backgroundColor: colors.border
  },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: 3
  },
  targetRow: {
    gap: spacing.sm
  },
  targetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  targetValue: {
    minWidth: 96,
    textAlign: "right"
  },
  donutWrap: {
    alignItems: "center",
    paddingVertical: spacing.sm
  },
  legendGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.md
  },
  legendCell: {
    width: "50%",
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm
  },
  legendSwatch: {
    marginTop: 4
  },
  summaryRows: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm
  },
  summaryRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  table: {
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...elevation.card
  },
  tableHeader: {
    minHeight: 46,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primary
  },
  tableRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm
  },
  tableCells: {
    flexDirection: "row",
    alignItems: "center"
  },
  totalColumn: {
    minWidth: 110,
    textAlign: "right"
  },
  leftColumn: {
    minWidth: 64,
    textAlign: "right"
  },
  tableRule: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.lavender
  },
  tableFoot: {
    padding: spacing.lg,
    gap: spacing.xs
  },
  chart: {
    height: CHART_BARS + CHART_LABELS,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm
  },
  goalLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 0,
    borderTopWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.borderStrong
  },
  goalLineLabel: {
    position: "absolute",
    right: 0,
    top: -16
  },
  chartColumn: {
    flex: 1,
    alignItems: "center",
    gap: 2
  },
  chartBarTrack: {
    width: "100%",
    height: CHART_BARS,
    justifyContent: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong
  },
  chartBar: {
    width: "100%",
    minHeight: 3,
    borderTopLeftRadius: radius.sm,
    borderTopRightRadius: radius.sm
  },
  goalLineNote: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  goalDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.coral
  }
});
