import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppText } from "@/components/AppText";
import { Segmented } from "@/components/Segmented";
import { noBrowserOutline } from "@/components/TextField";
import { featureFlags } from "@/config/features";
import { colors, elevation, fonts, layout, radius, spacing } from "@/config/theme";
import { foodRepository } from "@/repositories/foodRepository";
import { sourceLabels } from "@/services/food/foodSources";
import { previewNutrition } from "@/services/foodEntry";
import {
  SearchScope,
  foodQualityLabel,
  frequentFoods,
  recentFoods,
  scopeLabel,
  searchFoods,
  searchScopes
} from "@/services/foodSearch";
import { useAppStore } from "@/store/useAppStore";
import { DatabaseFood, FoodSearchWarning, MealType } from "@/types/domain";
import { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "FoodSearch">;

type Tab = "all" | "recent" | "frequent";

const DEBOUNCE_MS = 250;
const NO_LOCAL_RECENTS: ReturnType<typeof useAppStore.getState>["recentFoods"] = [];

export function FoodSearchScreen({ navigation, route }: Props) {
  const { mealType, date } = route.params;
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [scope, setScope] = useState<SearchScope>("all");
  const [tab, setTab] = useState<Tab>("all");
  const [serverFoods, setServerFoods] = useState<DatabaseFood[]>([]);
  const [warnings, setWarnings] = useState<FoodSearchWarning[]>([]);
  const [searchError, setSearchError] = useState(false);
  const [searching, setSearching] = useState(false);

  const recents = useAppStore((state) =>
    featureFlags.localFoodHistory.enabled ? state.recentFoods : NO_LOCAL_RECENTS
  );
  const cacheFood = useAppStore((state) => state.cacheFood);

  const localResults = useMemo(() => {
    if (query.trim()) return [];
    if (!featureFlags.localFoodHistory.enabled) return [];
    if (tab === "recent") return recentFoods(recents, 40);
    if (tab === "frequent") return frequentFoods(recents, 40);
    return searchFoods("", { scope, limit: 60 });
  }, [query, scope, tab, recents]);

  // Remote catalogs are queried on a debounce so typing doesn't fan out a
  // request per keystroke. Each new query aborts the one still in flight.
  const abortRef = useRef<AbortController>();

  useEffect(() => {
    const trimmed = query.trim();
    const serverHistory = !trimmed && tab !== "all" && !featureFlags.localFoodHistory.enabled;
    abortRef.current?.abort();
    setServerFoods([]);
    setWarnings([]);

    if (!serverHistory && trimmed.length < 2) {
      setSearchError(false);
      setSearching(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setSearching(true);
    setSearchError(false);

    const timer = setTimeout(async () => {
      try {
        const result = await foodRepository.search(trimmed, controller.signal);
        if (controller.signal.aborted) return;
        setServerFoods(result.foods);
        setWarnings(result.warnings);
      } catch (error) {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
        setServerFoods([]);
        setWarnings([]);
        setSearchError(true);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, tab]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const results = useMemo(() => {
    if (!query.trim()) {
      return tab !== "all" && !featureFlags.localFoodHistory.enabled ? serverFoods : localResults;
    }
    return scope === "all" ? serverFoods : serverFoods.filter((food) => food.category === scope);
  }, [localResults, query, scope, serverFoods, tab]);

  const historyTabs: { value: Tab; label: string }[] = [
    { value: "all", label: "All foods" },
    { value: "recent", label: "Recent" },
    ...(featureFlags.localFoodHistory.enabled
      ? [{ value: "frequent" as const, label: "Frequent" }]
      : [])
  ];

  function openFood(food: DatabaseFood) {
    // Cache before navigating so the detail screen can resolve it by id.
    cacheFood(food);
    navigation.navigate(
      "FoodDetail",
      { mode: "add", date, mealType, foodId: food.id }
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.column}>
        <View style={styles.header}>
          <View style={styles.headerSide}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={10} onPress={() => navigation.goBack()} style={styles.closeButton}>
              <Ionicons name="arrow-back" size={24} color={colors.ink} />
            </Pressable>
          </View>
          <AppText variant="h2" weight="700" style={styles.headerTitle} accessibilityLabel={mealLabel(mealType)}>
            {mealName(mealType)}
          </AppText>
          {featureFlags.quickAdd.enabled ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Quick add calories"
              hitSlop={10}
              onPress={() => navigation.navigate("QuickAdd", { date, mealType })}
            >
              <AppText weight="600" color={colors.primary}>
                Quick add
              </AppText>
              {featureFlags.quickAdd.label ? (
                <AppText variant="tiny" color={colors.muted}>
                  {featureFlags.quickAdd.label}
                </AppText>
              ) : null}
            </Pressable>
          ) : (
            <View style={styles.headerSide} />
          )}
        </View>

        <View style={[styles.searchRow, searchFocused ? styles.searchRowFocused : null]}>
          <Ionicons name="search" size={20} color={searchFocused ? colors.primary : colors.subtle} />
          <TextInput
            accessibilityLabel="Search for a food"
            value={query}
            onChangeText={setQuery}
            placeholder="Search for a food"
            placeholderTextColor={colors.subtle}
            style={[styles.searchInput, noBrowserOutline]}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            selectionColor={colors.primary}
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching ? <ActivityIndicator color={colors.primary} size="small" /> : null}
          {query && !searching ? (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={10} onPress={() => setQuery("")}>
              <Ionicons name="close-circle" size={20} color={colors.subtle} />
            </Pressable>
          ) : null}
        </View>

        {featureFlags.mealPhoto.enabled ||
        featureFlags.barcode.enabled ||
        featureFlags.voice.enabled ||
        featureFlags.naturalLanguageAi.enabled ? (
          <View style={styles.captureRow}>
            {featureFlags.mealPhoto.enabled ? (
              <CaptureChip
                icon="camera"
                label="Photo"
                previewLabel={featureFlags.mealPhoto.label}
                onPress={() => navigation.navigate("AddMeal", { preferredMode: "photo", mealType, date })}
              />
            ) : null}
            {featureFlags.barcode.enabled ? (
              <CaptureChip
                icon="barcode"
                label="Barcode"
                previewLabel={featureFlags.barcode.label}
                onPress={() => navigation.navigate("AddMeal", { preferredMode: "barcode", mealType, date })}
              />
            ) : null}
            {featureFlags.voice.enabled ? (
              <CaptureChip
                icon="mic"
                label="Voice"
                previewLabel={featureFlags.voice.label}
                onPress={() => navigation.navigate("AddMeal", { preferredMode: "voice", mealType, date })}
              />
            ) : null}
            {featureFlags.naturalLanguageAi.enabled ? (
              <CaptureChip
                icon="sparkles"
                label="Describe"
                previewLabel={featureFlags.naturalLanguageAi.label}
                onPress={() => navigation.navigate("AddMeal", { preferredMode: "text", mealType, date })}
              />
            ) : null}
          </View>
        ) : null}

        {query.trim() ? (
          <View style={styles.scopeRow}>
            <Segmented scrollable value={scope} onChange={setScope} options={searchScopes.map((item) => ({ value: item, label: scopeLabel(item) }))} />
          </View>
        ) : (
          <View style={styles.tabRow}>
            <Segmented
              variant="underline"
              value={tab}
              onChange={setTab}
              options={historyTabs}
            />
            {featureFlags.localFoodHistory.label ? (
              <AppText variant="tiny" color={colors.muted}>
                {featureFlags.localFoodHistory.label} • Recent and Frequent use this device's history.
              </AppText>
            ) : null}
          </View>
        )}

        {warnings.length ? (
          <View style={styles.errorBar}>
            <Ionicons name="cloud-offline-outline" size={16} color={colors.warning} />
            <AppText variant="tiny" color={colors.warning} style={styles.errorText}>
              {warnings.map((warning) => `${providerLabel(warning.provider)}: ${warning.message}`).join(" • ")}
            </AppText>
          </View>
        ) : null}

        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListHeaderComponent={results.length ? (
            <AppText variant="h3" weight="700" style={styles.listTitle}>
              {query.trim() ? "Results" : tab === "all" ? "Foods" : tab === "recent" ? "History" : "Frequent"}
            </AppText>
          ) : null}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<EmptyState query={query} tab={tab} searching={searching} failed={searchError} />}
          renderItem={({ item }) => <FoodRow food={item} onPress={() => openFood(item)} />}
        />
      </View>
    </SafeAreaView>
  );
}

function FoodRow({ food, onPress }: { food: DatabaseFood; onPress: () => void }) {
  const serving = food.servings[0];
  const nutrition = previewNutrition(food, serving.id, 1);

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}>
      <View style={styles.rowCopy}>
        <AppText weight="600" numberOfLines={2}>
          {food.name}
        </AppText>
        <View style={styles.rowMeta}>
          <AppText variant="small" color={colors.muted} numberOfLines={1} style={styles.rowServing}>
            {serving.label}
            {food.brand ? ` • ${food.brand}` : ""}
          </AppText>
          <View style={styles.sourceTag}>
            <AppText variant="tiny" color={colors.subtle}>
              {foodQualityLabel(food) === "Development example" ? "Development example" : sourceLabels[food.source]}
            </AppText>
          </View>
        </View>
        <AppText variant="tiny" color={colors.subtle}>
          {[foodQualityLabel(food), food.preparationState].filter(Boolean).join(" • ")}
        </AppText>
      </View>
      <AppText variant="small" weight="600" style={styles.rowRight}>
        {Math.round(nutrition.calories)} cals
      </AppText>
      <View style={styles.addDot}>
        <Ionicons name="add" size={20} color={colors.onPrimary} />
      </View>
    </Pressable>
  );
}

function CaptureChip({
  icon,
  label,
  previewLabel,
  onPress
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  previewLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.chip, { opacity: pressed ? 0.8 : 1 }]}>
      <Ionicons name={icon} size={30} color={colors.ink} />
      <AppText variant="small" weight="600">
        {label}
      </AppText>
      {previewLabel ? <AppText variant="tiny">{previewLabel}</AppText> : null}
    </Pressable>
  );
}

function EmptyState({ query, tab, searching, failed }: { query: string; tab: Tab; searching: boolean; failed: boolean }) {
  if (searching) {
    return (
      <View style={styles.empty}>
        <ActivityIndicator color={colors.primary} />
        <AppText color={colors.muted}>Searching food databases…</AppText>
      </View>
    );
  }

  if (failed) {
    return (
      <View style={styles.empty}>
        <Ionicons name="cloud-offline-outline" size={34} color={colors.warning} />
        <AppText color={colors.muted}>Food search is unavailable. Try again.</AppText>
      </View>
    );
  }

  const message = query.trim().length === 1
    ? "Type at least 2 characters to search."
    : query.trim()
    ? `No match for "${query.trim()}".`
    : tab === "recent"
      ? "Foods you log will show up here for one-tap re-logging."
      : tab === "frequent"
        ? "Log a few foods and your most-used ones will collect here."
        : "Search for a food to get started.";

  return (
    <View style={styles.empty}>
      <Ionicons name="nutrition-outline" size={34} color={colors.subtle} />
      <AppText color={colors.muted} style={styles.emptyText}>
        {message}
      </AppText>
    </View>
  );
}

function providerLabel(provider: string): string {
  if (provider === "usda" || provider === "openfoodfacts" || provider === "fatsecret") {
    return sourceLabels[provider];
  }
  return provider;
}

function mealName(mealType: MealType) {
  return mealType === "snack" ? "Snacks" : `${mealType.slice(0, 1).toUpperCase()}${mealType.slice(1)}`;
}

function mealLabel(mealType: MealType) {
  if (mealType === "snack") return "Add to Snacks";
  return `Add to ${mealType.slice(0, 1).toUpperCase()}${mealType.slice(1)}`;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background
  },
  column: {
    flex: 1,
    width: "100%",
    maxWidth: layout.maxContentWidth,
    alignSelf: "center"
  },
  header: {
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  headerSide: {
    width: 72
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: "center"
  },
  headerTitle: {
    flex: 1,
    textAlign: "center"
  },
  searchRow: {
    marginHorizontal: spacing.lg,
    minHeight: 48,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  searchRowFocused: {
    borderColor: colors.primary
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    color: colors.ink,
    fontFamily: fonts["500"],
    fontSize: 16,
    paddingVertical: spacing.sm
  },
  captureRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  chip: {
    flexGrow: 1,
    minWidth: "45%",
    minHeight: 100,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    ...elevation.card
  },
  scopeRow: {
    paddingLeft: spacing.lg,
    paddingTop: spacing.md
  },
  tabRow: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.xs
  },
  errorBar: {
    marginTop: spacing.md,
    marginHorizontal: spacing.lg,
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  errorText: {
    flex: 1
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    flexGrow: 1
  },
  listTitle: {
    marginBottom: spacing.md
  },
  separator: {
    height: spacing.sm
  },
  row: {
    minHeight: 64,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    ...elevation.card
  },
  rowPressed: {
    backgroundColor: colors.surfaceMuted
  },
  addDot: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary
  },
  rowCopy: {
    flex: 1,
    gap: 2
  },
  rowMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  rowServing: {
    flexShrink: 1
  },
  sourceTag: {
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
    backgroundColor: colors.surfaceRaised
  },
  rowRight: {
    minWidth: 56,
    textAlign: "right"
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl
  },
  emptyText: {
    textAlign: "center"
  }
});
