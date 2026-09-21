import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { DateNav } from "@/components/DateNav";
import { PressableScale, Reveal } from "@/components/motion";
import { ProgressBar } from "@/components/ProgressBar";
import { waterServingMl } from "@/config/defaults";
import { featureFlags } from "@/config/features";
import { colors, elevation, layout, radius, spacing } from "@/config/theme";
import { useDayLog } from "@/hooks/useDayLog";
import { exerciseCalories, exerciseMinutes, ratio } from "@/services/nutritionMath";
import { useAppStore } from "@/store/useAppStore";
import { Meal, MealEntry, MealType } from "@/types/domain";

const mealSections: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

const mealIcons: Record<MealType, keyof typeof Ionicons.glyphMap> = {
  breakfast: "cafe-outline",
  lunch: "fast-food-outline",
  dinner: "moon-outline",
  snack: "nutrition-outline"
};

/** The food diary: a calorie-left summary, then one blue-headed card per meal slot. */
export function DiaryScreen({ navigation }: any) {
  const goal = useAppStore((state) => state.goal);
  const addWater = useAppStore((state) => state.addWater);
  const { date, log, totals, remaining, isLoading, isError, isOffline } = useDayLog();
  const burned = exerciseCalories(log);
  // "Calorie left" reads as a fuel gauge: full at the start of the day, draining as you log.
  const leftShare = goal.calories > 0 ? Math.max(0, remaining) / goal.calories : 0;

  function openSearch(mealType: MealType) {
    navigation.navigate("FoodSearch", {
      mealType,
      date
    });
  }

  function editEntry(meal: Meal, entry: MealEntry) {
    navigation.navigate("FoodDetail", {
      mode: "edit",
      date,
      mealType: meal.mealType,
      mealId: meal.id,
      entryId: entry.id,
      foodId: entry.foodItem.sourceFoodId
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.column}>
        <View style={styles.header}>
          <AppText variant="h1" weight="700">
            Diary
          </AppText>
          <View style={styles.headerIcons}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Nutrition breakdown"
              hitSlop={10}
              onPress={() => navigation.navigate("Nutrition", { date })}
              style={styles.headerButton}
              pressedScale={0.85}
            >
              <Ionicons name="pie-chart-outline" size={22} color={colors.ink} />
            </PressableScale>
            {featureFlags.naturalLanguageAi.enabled ? (
              <PressableScale accessibilityRole="button" accessibilityLabel="Ask the assistant" hitSlop={10} onPress={() => navigation.navigate("Assistant")} style={styles.headerButton} pressedScale={0.85}>
                <Ionicons name="sparkles-outline" size={22} color={colors.ink} />
              </PressableScale>
            ) : null}
          </View>
        </View>

        <DateNav />
      </View>

      {isLoading ? (
        <View style={styles.syncState}>
          <ActivityIndicator color={colors.primary} size="small" />
          <AppText variant="small" color={colors.muted}>Loading diary…</AppText>
        </View>
      ) : isOffline ? (
        <AppText variant="small" color={colors.warning} style={styles.syncState}>
          BiteIQ is offline. Your saved days are still available.
        </AppText>
      ) : isError ? (
        <AppText variant="small" color={colors.warning} style={styles.syncState}>
          Diary is unavailable. Try again.
        </AppText>
      ) : null}

      <ScrollView contentContainerStyle={[styles.scroll, styles.column]} showsVerticalScrollIndicator={false}>
        <Reveal index={0} style={styles.summaryCard}>
          <View style={styles.summaryHeader}>
            <AppText variant="h3" weight="700">
              Calorie left
            </AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Edit goal" hitSlop={10} onPress={() => navigation.navigate("Goals")}>
              <AppText variant="h3" weight="700" color={remaining < 0 ? colors.coral : colors.ink}>
                {remaining < 0 ? "Over" : `${Math.round(leftShare * 100)}%`}
              </AppText>
            </Pressable>
          </View>
          <ProgressBar value={leftShare} color={colors.primary} height={14} />
          <View style={styles.equation}>
            <EquationBlock value={goal.calories} label="Goal" />
            <Operator symbol="−" />
            <EquationBlock value={totals.calories} label="Food" />
            {featureFlags.exercise.enabled ? (
              <>
                <Operator symbol="+" />
                <EquationBlock value={burned} label="Exercise" />
              </>
            ) : null}
            <Operator symbol="=" />
            <EquationBlock value={remaining} label="Remaining" strong negative={remaining < 0} />
          </View>
        </Reveal>

        {mealSections.map((mealType, index) => (
          <Reveal key={mealType} index={index + 1}>
            <DiarySection
              mealType={mealType}
              meals={log.meals.filter((meal) => meal.mealType === mealType)}
              onAdd={() => openSearch(mealType)}
              onEntryPress={editEntry}
            />
          </Reveal>
        ))}

        {featureFlags.exercise.enabled ? <SectionShell
          title="Exercise"
          subtitle={`${exerciseMinutes(log)} minutes · ${Math.round(burned)} cal`}
          icon="barbell-outline"
          actionLabel="Add exercise"
          emptyMessage="Log a workout to earn calories back"
          onAction={() => navigation.navigate("Exercise", { date })}
        >
          {log.exercises.map((entry) => (
            <View key={entry.id} style={styles.foodRow}>
              <View style={styles.foodCopy}>
                <AppText weight="600" numberOfLines={1}>{entry.name}</AppText>
                <AppText variant="small" color={colors.muted}>
                  {entry.minutes} minutes
                </AppText>
              </View>
              <AppText variant="small" weight="600">{Math.round(entry.caloriesBurned)} cals</AppText>
            </View>
          ))}
        </SectionShell> : null}

        {featureFlags.water.enabled ? <WaterSection
          waterMl={log.waterMl}
          goalMl={goal.waterMl}
          onAdd={() => addWater(date, waterServingMl)}
          onRemove={() => addWater(date, -waterServingMl)}
        /> : null}

        <PressableScale
          accessibilityRole="button"
          onPress={() => navigation.navigate("Nutrition", { date })}
          style={styles.nutritionLink}
          pressedScale={0.98}
        >
          <View style={styles.linkIcon}>
            <Ionicons name="stats-chart" size={18} color={colors.primary} />
          </View>
          <View style={styles.foodCopy}>
            <AppText weight="600">Nutrition breakdown</AppText>
            <AppText variant="small" color={colors.muted}>
              Macro split, fiber, sugar, and sodium for this day
            </AppText>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
        </PressableScale>
      </ScrollView>
    </SafeAreaView>
  );
}

function DiarySection({
  mealType,
  meals,
  onAdd,
  onEntryPress
}: {
  mealType: MealType;
  meals: Meal[];
  onAdd: () => void;
  onEntryPress: (meal: Meal, entry: MealEntry) => void;
}) {
  const title = sectionTitle(mealType);
  const total = meals.reduce(
    (sum, meal) => sum + meal.entries.reduce((inner, entry) => inner + entry.foodItem.nutrition.calories, 0),
    0
  );

  return (
    <SectionShell
      title={title}
      subtitle={`${Math.round(total).toLocaleString()} cal`}
      icon={mealIcons[mealType]}
      actionLabel="Add food"
      emptyMessage={`Reminder to have ${mealType === "snack" ? "a snack" : title.toLowerCase()}`}
      onAction={onAdd}
    >
      {meals.flatMap((meal) =>
        meal.entries.map((entry) => (
          <Pressable
            key={entry.id}
            accessibilityRole="button"
            onPress={() => onEntryPress(meal, entry)}
            style={({ pressed }) => [styles.foodRow, pressed ? styles.foodRowPressed : null]}
          >
            <View style={styles.foodCopy}>
              <AppText weight="600" numberOfLines={1}>{entry.foodItem.name}</AppText>
              <AppText variant="small" color={colors.muted} numberOfLines={1}>
                {formatServing(entry)}
              </AppText>
            </View>
            {meal.inference ? <Ionicons name="sparkles" size={14} color={colors.primary} /> : null}
            <AppText variant="small" weight="600">{Math.round(entry.foodItem.nutrition.calories)} cals</AppText>
            <Ionicons name="ellipsis-vertical" size={16} color={colors.subtle} />
          </Pressable>
        ))
      )}
    </SectionShell>
  );
}

/** A meal card: solid brand-blue header with the add button, entries on white below. */
function SectionShell({
  title,
  subtitle,
  icon,
  actionLabel,
  emptyMessage,
  onAction,
  children
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  actionLabel: string;
  emptyMessage: string;
  onAction: () => void;
  children?: React.ReactNode;
}) {
  const empty = !children || (Array.isArray(children) && children.length === 0);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name={icon} size={24} color={colors.onPrimary} />
        <View style={styles.sectionTitle}>
          <AppText variant="h3" weight="700" color={colors.onPrimary}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="tiny" weight="500" color={`${colors.onPrimary}CC`}>
              {subtitle}
            </AppText>
          ) : null}
        </View>
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel={`${actionLabel === "Add food" ? "Add food to" : "Add"} ${title}`}
          hitSlop={8}
          onPress={onAction}
          style={styles.headerAdd}
          pressedScale={0.85}
        >
          <Ionicons name="add" size={20} color={colors.primary} />
        </PressableScale>
      </View>
      {empty ? (
        <AppText variant="small" color={colors.muted} style={styles.reminder}>
          {emptyMessage}
        </AppText>
      ) : (
        <View style={styles.entries}>{children}</View>
      )}
    </View>
  );
}

function WaterSection({
  waterMl,
  goalMl,
  onAdd,
  onRemove
}: {
  waterMl: number;
  goalMl: number;
  onAdd: () => void;
  onRemove: () => void;
}) {
  const cups = Math.round(waterMl / waterServingMl);
  const goalCups = Math.round(goalMl / waterServingMl);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Ionicons name="water-outline" size={24} color={colors.onPrimary} />
        <View style={styles.sectionTitle}>
          <AppText variant="h3" weight="700" color={colors.onPrimary}>
            Water
          </AppText>
          <AppText variant="tiny" weight="500" color={`${colors.onPrimary}CC`}>
            {cups} of {goalCups} cups
          </AppText>
        </View>
      </View>
      <View style={styles.waterBody}>
        <PressableScale accessibilityRole="button" accessibilityLabel="Remove a cup of water" onPress={onRemove} style={[styles.waterButton, styles.waterButtonMuted]} pressedScale={0.88}>
          <Ionicons name="remove" size={20} color={colors.onPrimary} />
        </PressableScale>
        <View style={styles.waterTrack}>
          <ProgressBar value={ratio(waterMl, goalMl)} color={colors.primary} height={10} />
        </View>
        <PressableScale accessibilityRole="button" accessibilityLabel="Add a cup of water" onPress={onAdd} style={styles.waterButton} pressedScale={0.88}>
          <Ionicons name="add" size={20} color={colors.onPrimary} />
        </PressableScale>
      </View>
    </View>
  );
}

function EquationBlock({ value, label, strong, negative }: { value: number; label: string; strong?: boolean; negative?: boolean }) {
  return (
    <View style={styles.equationBlock}>
      <AppText variant="small" weight={strong ? "700" : "500"} color={negative ? colors.coral : colors.ink}>
        {Math.round(value).toLocaleString()}
      </AppText>
      <AppText variant="tiny" color={colors.muted}>
        {label}
      </AppText>
    </View>
  );
}

function Operator({ symbol }: { symbol: string }) {
  return (
    <AppText variant="small" color={colors.subtle} style={styles.operator}>
      {symbol}
    </AppText>
  );
}

function formatServing(entry: MealEntry) {
  const { quantity, servingSize, brand } = entry.foodItem;
  const amount = quantity === 1 ? servingSize : scaledAmount(quantity, servingSize) ?? `${formatQuantity(quantity)} × ${servingSize}`;
  return brand ? `${amount} • ${brand}` : amount;
}

/** "1.18 × 100 g" reads better as "118 g" when the serving is a plain weight or volume. */
function scaledAmount(quantity: number, servingSize: string) {
  const match = /^(\d+(?:\.\d+)?)\s?(g|ml|oz)$/i.exec(servingSize.trim());
  if (!match) return undefined;
  return `${formatQuantity(quantity * Number(match[1]))} ${match[2]}`;
}

function formatQuantity(value: number) {
  return String(Math.round(value * 100) / 100);
}

function sectionTitle(mealType: MealType) {
  return mealType === "snack" ? "Snacks" : mealType.slice(0, 1).toUpperCase() + mealType.slice(1);
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background
  },
  column: {
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center"
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  headerIcons: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs
  },
  headerButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center"
  },
  syncState: {
    marginHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  scroll: {
    padding: spacing.lg,
    paddingTop: spacing.xs,
    gap: spacing.lg,
    paddingBottom: spacing.xxl * 2
  },
  summaryCard: {
    padding: spacing.lg,
    gap: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    ...elevation.card
  },
  summaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  equation: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between"
  },
  equationBlock: {
    alignItems: "center"
  },
  operator: {
    paddingTop: 1
  },
  section: {
    overflow: "hidden",
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...elevation.card
  },
  sectionHeader: {
    minHeight: 56,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primary
  },
  sectionTitle: {
    flex: 1
  },
  headerAdd: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.onPrimary
  },
  entries: {
    paddingVertical: spacing.xs
  },
  reminder: {
    textAlign: "center",
    paddingVertical: spacing.lg
  },
  foodRow: {
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  foodRowPressed: {
    backgroundColor: colors.surfaceMuted
  },
  foodCopy: {
    flex: 1,
    gap: 2
  },
  waterBody: {
    padding: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  waterTrack: {
    flex: 1
  },
  waterButton: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary
  },
  waterButtonMuted: {
    backgroundColor: colors.periwinkle
  },
  nutritionLink: {
    minHeight: 68,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    ...elevation.card
  },
  linkIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft
  }
});
