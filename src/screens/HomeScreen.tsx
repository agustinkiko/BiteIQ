import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";

import { AppText } from "@/components/AppText";
import { BrandMark } from "@/components/BrandMark";
import { Card } from "@/components/Card";
import { MacroRings } from "@/components/MacroRings";
import { PressableScale, Reveal, useCountUp } from "@/components/motion";
import { ProgressBar } from "@/components/ProgressBar";
import { Ring } from "@/components/Ring";
import { Screen } from "@/components/Screen";
import { Segmented } from "@/components/Segmented";
import { WeekStrip } from "@/components/WeekStrip";
import { waterServingMl } from "@/config/defaults";
import { DEVELOPMENT_PREVIEW, featureFlags } from "@/config/features";
import { colors, dataColors, elevation, layout, radius, spacing } from "@/config/theme";
import { useDayLog } from "@/hooks/useDayLog";
import { formatDiaryDate } from "@/services/dates";
import { exerciseCalories, exerciseMinutes, ratio } from "@/services/nutritionMath";
import { useAppStore } from "@/store/useAppStore";
import { CaptureMode, MealType } from "@/types/domain";

type HeroView = "macros" | "calories";

const mealSlots: { type: MealType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { type: "breakfast", label: "Breakfast", icon: "cafe" },
  { type: "lunch", label: "Lunch", icon: "fast-food" },
  { type: "dinner", label: "Dinner", icon: "moon" },
  { type: "snack", label: "Snacks", icon: "nutrition" }
];

export function HomeScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const goal = useAppStore((state) => state.goal);
  const addWater = useAppStore((state) => state.addWater);
  const { date, log, totals, remaining, isLoading, isError, isOffline } = useDayLog();
  const [weekOpen, setWeekOpen] = useState(false);
  const [heroView, setHeroView] = useState<HeroView>("calories");

  const wide = width >= layout.wideBreakpoint;
  const compact = width < layout.compactBreakpoint;
  const ringSize = compact ? 144 : 172;
  const burned = exerciseCalories(log);
  const over = remaining < 0;
  const shownRemaining = useCountUp(Math.abs(Math.round(remaining)));

  function openCapture(mode?: CaptureMode) {
    navigation.navigate("AddMeal", mode ? { preferredMode: mode, date } : { date });
  }

  function openSearch(mealType: MealType) {
    navigation.navigate("FoodSearch", {
      mealType,
      date
    });
  }

  const hero = (
    <Reveal index={1}>
      <View style={styles.heroShell}>
        <LinearGradient colors={[colors.heroTint, colors.surface]} locations={[0, 0.7]} style={styles.hero}>
          <Segmented
            value={heroView}
            onChange={setHeroView}
            options={[
              { value: "macros", label: "Macros" },
              { value: "calories", label: "Calories" }
            ]}
          />
          {heroView === "calories" ? (
            <Animated.View key="calories" entering={FadeInDown.duration(260)} style={styles.heroBody}>
              <Ring progress={ratio(totals.calories, goal.calories)} size={ringSize} thickness={compact ? 14 : 16} color={over ? colors.coral : colors.primary}>
                <AppText variant={compact ? "h1" : "title"} weight="700">
                  {Math.round(shownRemaining).toLocaleString()}
                </AppText>
                <AppText variant="small" weight="500" color={over ? colors.coral : colors.muted}>
                  {over ? "Over" : "Remaining"}
                </AppText>
              </Ring>
              <View style={styles.legend}>
                <LegendItem color={colors.primary} label="Consumed" value={totals.calories} />
                {featureFlags.exercise.enabled ? <LegendItem color={dataColors.exercise} label="Burned" value={burned} /> : null}
                <LegendItem color={colors.periwinkle} label="Goal" value={goal.calories} />
              </View>
            </Animated.View>
          ) : (
            <Animated.View key="macros" entering={FadeInDown.duration(260)} style={styles.heroBody}>
              <MacroRings totals={totals} goal={goal} size={compact ? 72 : 84} />
            </Animated.View>
          )}
        </LinearGradient>
      </View>
    </Reveal>
  );

  const meals = (
    <View style={styles.meals}>
      <Reveal index={2} style={styles.sectionHeader}>
        <AppText variant="h3" weight="700">
          Meals
        </AppText>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={() => navigation.navigate("Diary")} style={styles.link}>
          <AppText variant="small" weight="600" color={colors.primary}>
            Open diary
          </AppText>
          <Ionicons name="chevron-forward" size={14} color={colors.primary} />
        </Pressable>
      </Reveal>
      {mealSlots.map((slot, index) => {
        const slotMeals = log.meals.filter((meal) => meal.mealType === slot.type);
        const calories = slotMeals.reduce(
          (sum, meal) => sum + meal.entries.reduce((inner, entry) => inner + entry.foodItem.nutrition.calories, 0),
          0
        );
        const items = slotMeals.reduce((sum, meal) => sum + meal.entries.length, 0);
        const tint = dataColors[slot.type];

        return (
          <Reveal key={slot.type} index={3 + index}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel={`Add food to ${slot.label}`}
              onPress={() => openSearch(slot.type)}
              style={styles.row}
              pressedScale={0.98}
            >
              <View style={[styles.rowIcon, { backgroundColor: `${tint}1F` }]}>
                <Ionicons name={slot.icon} size={20} color={tint} />
              </View>
              <View style={styles.rowCopy}>
                <AppText variant="h3" weight="600">{slot.label}</AppText>
                <AppText variant="small" color={colors.muted}>
                  {items ? `${items} item${items === 1 ? "" : "s"} · ${Math.round(calories).toLocaleString()} cal` : "Nothing logged yet"}
                </AppText>
              </View>
              <View style={styles.plus}>
                <Ionicons name="add" size={22} color={colors.onPrimary} />
              </View>
            </PressableScale>
          </Reveal>
        );
      })}
    </View>
  );

  return (
    <Screen contentStyle={styles.screen} maxWidth={wide ? 1040 : layout.maxContentWidth}>
      <Reveal index={0}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose day"
            accessibilityState={{ expanded: weekOpen }}
            hitSlop={8}
            onPress={() => setWeekOpen((open) => !open)}
            style={styles.dayPicker}
          >
            <AppText variant="small" weight="700">
              {formatDiaryDate(date)}
            </AppText>
            <Ionicons name={weekOpen ? "caret-up" : "caret-down"} size={12} color={colors.ink} />
          </Pressable>
          <View style={styles.brand}>
            <BrandMark />
          </View>
          <View style={styles.topRight}>
            <PressableScale
              accessibilityRole="button"
              accessibilityLabel="Nutrition breakdown"
              hitSlop={8}
              onPress={() => navigation.navigate("Nutrition", { date })}
              style={styles.iconButton}
              pressedScale={0.85}
            >
              <Ionicons name="pie-chart-outline" size={22} color={colors.ink} />
            </PressableScale>
          </View>
        </View>
        {weekOpen ? (
          <Animated.View entering={FadeInDown.duration(220)} exiting={FadeOutUp.duration(160)} style={styles.week}>
            <WeekStrip />
          </Animated.View>
        ) : null}
      </Reveal>

      {isLoading ? (
        <View style={styles.syncState}>
          <ActivityIndicator color={colors.primary} size="small" />
          <AppText variant="small" color={colors.muted}>Loading diary…</AppText>
        </View>
      ) : isOffline ? (
        <Notice icon="cloud-offline-outline" message="BiteIQ is offline. Your saved days are still available." />
      ) : isError ? (
        <Notice icon="alert-circle-outline" message="Diary is unavailable. Try again." />
      ) : null}

      {wide ? (
        <View style={styles.columns}>
          <View style={styles.column}>{hero}</View>
          <View style={styles.column}>{meals}</View>
        </View>
      ) : (
        <>
          {hero}
          {meals}
        </>
      )}

      {featureFlags.mealPhoto.enabled || featureFlags.barcode.enabled || featureFlags.voice.enabled ? (
        <>
          <View style={styles.quickRow}>
            {featureFlags.mealPhoto.enabled ? <QuickAction icon="camera" label="Scan a meal" onPress={() => openCapture("photo")} /> : null}
            {featureFlags.barcode.enabled ? <QuickAction icon="barcode-outline" label="Scan a barcode" onPress={() => openCapture("barcode")} /> : null}
            {featureFlags.voice.enabled ? <QuickAction icon="mic" label="Voice" onPress={() => openCapture("voice")} /> : null}
          </View>
          <AppText variant="tiny" color={colors.warning}>{DEVELOPMENT_PREVIEW}</AppText>
        </>
      ) : null}

      {featureFlags.water.enabled ? <Card style={styles.waterCard}>
        <View style={styles.sectionHeader}>
          <AppText variant="h3" weight="700">
            Daily water intake
          </AppText>
          <AppText weight="600" color={dataColors.water}>
            {Math.round(log.waterMl / waterServingMl)} / {Math.round(goal.waterMl / waterServingMl)} cups
          </AppText>
        </View>
        <View style={styles.waterRow}>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Remove a cup of water"
            onPress={() => addWater(date, -waterServingMl)}
            style={[styles.plus, styles.minus]}
            pressedScale={0.88}
          >
            <Ionicons name="remove" size={20} color={colors.onPrimary} />
          </PressableScale>
          <View style={styles.waterTrack}>
            <ProgressBar value={ratio(log.waterMl, goal.waterMl)} color={dataColors.water} height={10} />
          </View>
          <PressableScale
            accessibilityRole="button"
            accessibilityLabel="Add a cup of water"
            onPress={() => addWater(date, waterServingMl)}
            style={styles.plus}
            pressedScale={0.88}
          >
            <Ionicons name="add" size={20} color={colors.onPrimary} />
          </PressableScale>
        </View>
      </Card> : null}

      {featureFlags.exercise.enabled ? <PressableScale
        accessibilityRole="button"
        onPress={() => navigation.navigate("Exercise", { date })}
        style={styles.row}
        pressedScale={0.98}
      >
        <LinearGradient colors={[`${dataColors.exercise}26`, `${dataColors.exercise}00`]} start={{ x: 0, y: 0.5 }} end={{ x: 0.55, y: 0.5 }} style={StyleSheet.absoluteFill} />
        <View style={[styles.rowIcon, { backgroundColor: `${dataColors.exercise}1F` }]}>
          <Ionicons name="barbell" size={20} color={dataColors.exercise} />
        </View>
        <View style={styles.rowCopy}>
          <AppText variant="h3" weight="600">Exercise</AppText>
          <AppText variant="small" color={colors.muted}>
            {burned > 0 ? `${exerciseMinutes(log)} minutes · ${Math.round(burned)} cal` : "Log a workout to earn calories back"}
          </AppText>
        </View>
        <View style={styles.plus}>
          <Ionicons name="add" size={22} color={colors.onPrimary} />
        </View>
      </PressableScale> : null}
    </Screen>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <View style={styles.legendItem}>
      <AppText variant="small" color={colors.muted}>
        {label}
      </AppText>
      <View style={styles.legendValue}>
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <AppText variant="h3" weight="700">
          {Math.round(value).toLocaleString()}
        </AppText>
      </View>
    </View>
  );
}

function Notice({ icon, message }: { icon: keyof typeof Ionicons.glyphMap; message: string }) {
  return (
    <View style={styles.notice}>
      <Ionicons name={icon} size={16} color={colors.warning} />
      <AppText variant="small" color={colors.warning} style={styles.rowCopy}>
        {message}
      </AppText>
    </View>
  );
}

function QuickAction({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <PressableScale accessibilityRole="button" onPress={onPress} style={styles.quickAction} pressedScale={0.96}>
      <Ionicons name={icon} size={28} color={colors.ink} />
      <AppText variant="small" weight="600">
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.lg,
    paddingTop: spacing.sm
  },
  topBar: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center"
  },
  dayPicker: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4
  },
  brand: {
    alignItems: "center"
  },
  topRight: {
    flex: 1,
    alignItems: "flex-end"
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center"
  },
  week: {
    marginTop: spacing.sm
  },
  syncState: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft
  },
  columns: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.lg
  },
  column: {
    flex: 1
  },
  heroShell: {
    borderRadius: radius.xl,
    backgroundColor: colors.surface,
    ...elevation.card
  },
  hero: {
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.lg
  },
  heroBody: {
    alignItems: "center",
    gap: spacing.lg,
    paddingBottom: spacing.xs
  },
  legend: {
    alignSelf: "stretch",
    flexDirection: "row",
    justifyContent: "space-around"
  },
  legendItem: {
    alignItems: "flex-start",
    gap: 2
  },
  legendValue: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6
  },
  swatch: {
    width: 10,
    height: 10,
    borderRadius: 2
  },
  meals: {
    gap: spacing.md
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  },
  row: {
    minHeight: 72,
    overflow: "hidden",
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    ...elevation.card
  },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center"
  },
  rowCopy: {
    flex: 1,
    gap: 2
  },
  plus: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary
  },
  minus: {
    backgroundColor: colors.periwinkle
  },
  quickRow: {
    flexDirection: "row",
    gap: spacing.md
  },
  quickAction: {
    flex: 1,
    minHeight: 96,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    backgroundColor: colors.surface,
    ...elevation.card
  },
  waterCard: {
    gap: spacing.md
  },
  waterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  waterTrack: {
    flex: 1
  }
});
