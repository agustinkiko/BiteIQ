import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { PressableScale, Reveal } from "@/components/motion";
import { Ring } from "@/components/Ring";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Segmented } from "@/components/Segmented";
import { TextField } from "@/components/TextField";
import { colors, dataColors, elevation, fonts, radius, spacing } from "@/config/theme";
import { useDayLog } from "@/hooks/useDayLog";
import { foodRepository } from "@/repositories/foodRepository";
import { sourceLabels } from "@/services/food/foodSources";
import { resolveFood } from "@/services/food/resolveFood";
import { buildDatabaseMeal, previewNutrition, reprice } from "@/services/foodEntry";
import { canonicalFoodSelection, foodQualityLabel, isDevelopmentFood } from "@/services/foodSearch";
import { macroSplit } from "@/services/nutritionMath";
import { useAppStore } from "@/store/useAppStore";
import { MealType, NutritionEstimate } from "@/types/domain";
import { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "FoodDetail">;

const mealTypes: MealType[] = ["breakfast", "lunch", "dinner", "snack"];

export function FoodDetailScreen({ navigation, route }: Props) {
  const { mode, date, mealId, entryId } = route.params;
  const addMeal = useAppStore((state) => state.addMeal);
  const recordFoodUse = useAppStore((state) => state.recordFoodUse);
  const cacheFood = useAppStore((state) => state.cacheFood);
  const day = useDayLog(date);
  const existing = mode === "edit" && mealId && entryId
    ? day.log.meals.find((item) => item.id === mealId)?.entries.find((item) => item.id === entryId)
    : undefined;

  // In edit mode the food identity comes from the logged entry, not the route.
  const initialFood = useRef(resolveFood(route.params.foodId || existing?.foodItem.sourceFoodId));
  const [food, setFood] = useState(initialFood.current);
  const [detailState, setDetailState] = useState<"loading" | "ready" | "error">(
    mode === "add" && !initialFood.current ? "loading" : "ready"
  );

  const [servingId, setServingId] = useState(existing?.foodItem.servingId || food?.servings[0]?.id);
  const [quantityText, setQuantityText] = useState(String(existing?.foodItem.quantity ?? 1));
  const [mealType, setMealType] = useState<MealType>(route.params.mealType);
  const initializedEntryId = useRef<string>();
  const mutationPending = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>();
  const [isQueued, setIsQueued] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);

  const quantity = parseQuantity(quantityText);

  useEffect(() => {
    if (!route.params.foodId || (initialFood.current && isDevelopmentFood(initialFood.current))) return;

    const controller = new AbortController();
    if (!initialFood.current) setDetailState("loading");
    foodRepository
      .get(route.params.foodId, controller.signal)
      .then((loadedFood) => {
        if (controller.signal.aborted) return;
        setFood(loadedFood);
        setServingId((current) => current || loadedFood.servings[0]?.id);
        cacheFood(loadedFood);
        setDetailState("ready");
      })
      .catch((error) => {
        if (controller.signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
        if (mode === "add" && !initialFood.current) setDetailState("error");
      });

    return () => controller.abort();
  }, [cacheFood, mode, route.params.foodId]);

  useEffect(() => {
    if (mode !== "edit" || !existing || initializedEntryId.current === existing.id) return;
    initializedEntryId.current = existing.id;
    setServingId(existing.foodItem.servingId || food?.servings[0]?.id);
    setQuantityText(String(existing.foodItem.quantity));
  }, [existing, food, mode]);

  const nutrition: NutritionEstimate | undefined = useMemo(() => {
    if (food) return previewNutrition(food, servingId, quantity);
    if (!existing) return undefined;
    // Foods with no database source (AI capture, quick add) scale off the
    // amounts already stored on the entry.
    return reprice(existing.foodItem, undefined, undefined, quantity).nutrition;
  }, [food, servingId, quantity, existing]);

  if (detailState === "loading") {
    return (
      <Screen>
        <ScreenHeader title="Food details" onBack={() => navigation.goBack()} />
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.primary} />
          <AppText color={colors.muted}>Loading food details…</AppText>
        </View>
      </Screen>
    );
  }

  if (detailState === "error") {
    return (
      <Screen>
        <ScreenHeader title="Food not found" onBack={() => navigation.goBack()} />
        <AppText color={colors.muted}>That food could not be loaded. Search again.</AppText>
      </Screen>
    );
  }

  if (mode === "edit" && day.isLoading && !existing) {
    return (
      <Screen>
        <ScreenHeader title="Food details" onBack={() => navigation.goBack()} />
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.primary} />
          <AppText color={colors.muted}>Loading diary entry…</AppText>
        </View>
      </Screen>
    );
  }

  if (!nutrition) {
    return (
      <Screen>
        <ScreenHeader title="Food not found" onBack={() => navigation.goBack()} />
        <AppText color={colors.muted}>This entry is no longer in the diary.</AppText>
      </Screen>
    );
  }

  const title = food?.name || existing?.foodItem.name || "Food";
  const brand = food?.brand || existing?.foodItem.brand;
  const split = macroSplit(nutrition);

  async function save() {
    if (mutationPending.current || isQueued) return;
    setSaveError(undefined);
    if (quantity <= 0) {
      setSaveError("Number of servings must be greater than zero.");
      return;
    }

    mutationPending.current = true;
    setIsSaving(true);
    try {
      if (mode === "add" && food) {
        if (isDevelopmentFood(food)) {
          addMeal(buildDatabaseMeal(food, servingId, quantity, mealType, date), date);
          recordFoodUse(food.id);
          navigation.goBack();
          return;
        }

        const selectedServingId = servingId || food.servings[0]?.id;
        if (!selectedServingId) {
          setSaveError("Choose a serving before adding this food.");
          return;
        }
        const result = await day.createEntry({
          ...canonicalFoodSelection(food.id, selectedServingId, quantity),
          mealType
        });
        if (result.queued) {
          setIsQueued(true);
        } else {
          navigation.navigate("MainTabs", { screen: "Diary" });
        }
        return;
      }

      if (mode === "edit" && existing && entryId) {
        const foodId = existing.foodItem.sourceFoodId;
        const selectedServingId = servingId || existing.foodItem.servingId;
        if (!foodId || !selectedServingId) {
          setSaveError("That food is no longer available. Search again.");
          return;
        }
        const updatedDay = await day.updateEntry(entryId, {
          foodId,
          servingId: selectedServingId,
          quantity,
          mealType
        });
        if (updatedDay) navigation.goBack();
        else setSaveError("This entry is no longer in your diary.");
      }
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save this food. Try again.");
    } finally {
      mutationPending.current = false;
      setIsSaving(false);
    }
  }

  async function deleteEntry() {
    if (!entryId || mutationPending.current) return;
    mutationPending.current = true;
    setIsSaving(true);
    setSaveError(undefined);
    try {
      const updatedDay = await day.deleteEntry(entryId);
      if (updatedDay) navigation.goBack();
      else setSaveError("This entry is no longer in your diary.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not delete this food. Try again.");
    } finally {
      mutationPending.current = false;
      setIsSaving(false);
    }
  }

  return (
    <Screen contentStyle={styles.screen}>
      <ScreenHeader title={mode === "add" ? "Add food" : "Edit food"} onBack={() => navigation.goBack()} />

      <Reveal index={0}>
        <LinearGradient colors={[colors.primary, colors.primaryBright]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
          <Ionicons name="nutrition" size={132} color={`${colors.onPrimary}1A`} style={styles.heroMark} />
          {food ? (
            <AppText variant="tiny" weight="600" color={`${colors.onPrimary}CC`}>
              {[isDevelopmentFood(food) ? "Development example" : sourceLabels[food.source], foodQualityLabel(food), food.preparationState]
                .filter((value, index, values) => Boolean(value) && values.indexOf(value) === index)
                .join(" • ")}
            </AppText>
          ) : null}
          <AppText variant="h1" weight="700" color={colors.onPrimary} numberOfLines={2}>
            {title}
          </AppText>
          {brand ? (
            <AppText variant="small" color={`${colors.onPrimary}CC`}>
              {brand}
            </AppText>
          ) : null}
          <View style={styles.calorieRow}>
            <AppText variant="display" weight="700" color={colors.onPrimary}>
              {Math.round(nutrition.calories)}
            </AppText>
            <AppText weight="500" color={`${colors.onPrimary}CC`}>calories</AppText>
          </View>
        </LinearGradient>
      </Reveal>

      <Reveal index={1}>
        <Card style={styles.splitRow}>
          <MacroStat label="Protein" grams={nutrition.proteinGrams} percent={split.protein} color={dataColors.protein} />
          <MacroStat label="Carbs" grams={nutrition.carbGrams} percent={split.carbs} color={dataColors.carbs} />
          <MacroStat label="Fats" grams={nutrition.fatGrams} percent={split.fat} color={dataColors.fat} />
        </Card>
      </Reveal>

      <Reveal index={2}>
        <Card style={styles.card}>
          <AppText variant="h3" weight="700">
            Number of servings
          </AppText>
          <View style={styles.stepperRow}>
            <StepperButton icon="remove" onPress={() => setQuantityText(formatQuantity(Math.max(0.25, quantity - 0.5)))} />
            <View style={styles.quantityField}>
              <TextField accessibilityLabel="Number of servings" value={quantityText} onChangeText={setQuantityText} keyboardType="decimal-pad" style={styles.quantityInput} editable={!isSaving && !isQueued} />
            </View>
            <StepperButton icon="add" onPress={() => setQuantityText(formatQuantity(quantity + 0.5))} />
          </View>
          <View style={styles.presetRow}>
            {[0.5, 1, 1.5, 2, 3].map((preset) => (
              <Pressable
                key={preset}
                accessibilityRole="button"
                accessibilityState={{ selected: quantity === preset }}
                onPress={() => setQuantityText(formatQuantity(preset))}
                style={({ pressed }) => [styles.preset, quantity === preset ? styles.presetActive : null, { opacity: pressed ? 0.8 : 1 }]}
              >
                <AppText variant="small" weight="700" color={quantity === preset ? colors.primary : colors.muted}>
                  {formatQuantity(preset)}
                </AppText>
              </Pressable>
            ))}
          </View>
        </Card>
      </Reveal>

      <Reveal index={3}>
        {food ? (
          <Card style={styles.card}>
            <AppText variant="h3" weight="700">
              Serving size
            </AppText>
            {food.servings.map((serving) => {
              const active = serving.id === (servingId || food.servings[0].id);
              return (
                <Pressable
                  key={serving.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => setServingId(serving.id)}
                  style={[styles.servingRow, active ? styles.servingRowActive : null]}
                >
                  <View style={styles.servingCopy}>
                    <AppText weight={active ? "700" : "400"}>{serving.label}</AppText>
                    <AppText variant="tiny" color={colors.muted}>
                      {Math.round(previewNutrition(food, serving.id, 1).calories)} cal per serving
                    </AppText>
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </Card>
        ) : (
          <Card style={styles.card}>
            <AppText variant="h3" weight="700">
              Serving
            </AppText>
            <AppText color={colors.muted}>
              {existing?.foodItem.servingSize || "1 serving"} — this entry came from {existing?.foodItem.provenance.join(", ") || "manual entry"},
              so only the serving count can be adjusted here.
            </AppText>
          </Card>
        )}
      </Reveal>

      <Reveal index={4}>
        <Card style={styles.card}>
          <AppText variant="h3" weight="700">
            Meal
          </AppText>
          <Segmented
            value={mealType}
            onChange={setMealType}
            options={mealTypes.map((type) => ({ value: type, label: mealTypeLabel(type) }))}
          />
        </Card>
      </Reveal>

      <Reveal index={5}>
        <Card style={styles.card}>
          <AppText variant="h3" weight="700">
            Nutrition facts
          </AppText>
          <FactRow label="Calories" value={`${Math.round(nutrition.calories)}`} bold />
          <FactRow label="Total Fat" value={`${round1(nutrition.fatGrams)} g`} />
          <FactRow label="Saturated Fat" value={optionalGrams(nutrition.saturatedFatGrams)} indent />
          <FactRow label="Total Carbohydrates" value={`${round1(nutrition.carbGrams)} g`} />
          <FactRow label="Dietary Fiber" value={optionalGrams(nutrition.fiberGrams)} indent />
          <FactRow label="Sugars" value={optionalGrams(nutrition.sugarGrams)} indent />
          <FactRow label="Protein" value={`${round1(nutrition.proteinGrams)} g`} />
          <FactRow label="Sodium" value={nutrition.sodiumMg === undefined ? "—" : `${Math.round(nutrition.sodiumMg)} mg`} last />
        </Card>
      </Reveal>

      {saveError ? <AppText accessibilityRole="alert" color={colors.danger}>{saveError}</AppText> : null}
      {isQueued ? (
        <Card style={styles.card}>
          <AppText accessibilityRole="alert">Saved offline. This food will appear in your diary after BiteIQ reconnects.</AppText>
          <Button label="View diary" onPress={() => navigation.navigate("MainTabs", { screen: "Diary" })} />
        </Card>
      ) : (
        <Button label={isSaving ? "Saving…" : mode === "add" ? "Add to diary" : "Save changes"} icon="checkmark" onPress={save} disabled={isSaving} />
      )}
      {mode === "edit" && !deleteConfirmation ? <Button label="Delete entry" icon="trash" variant="secondary" onPress={() => setDeleteConfirmation(true)} disabled={isSaving} /> : null}
      {deleteConfirmation ? (
        <Reveal>
        <Card style={[styles.card, styles.dangerCard]}>
          <AppText weight="600">Remove {title} from your diary?</AppText>
          <Button label="Confirm delete" icon="trash" variant="danger" onPress={deleteEntry} disabled={isSaving} />
          <Button label="Keep entry" variant="secondary" onPress={() => setDeleteConfirmation(false)} disabled={isSaving} />
        </Card>
        </Reveal>
      ) : null}
    </Screen>
  );
}

/** A macro's share of this serving's calories, drawn as a ring with the grams inside. */
function MacroStat({ label, grams, percent, color }: { label: string; grams: number; percent: number; color: string }) {
  return (
    <View style={styles.splitStat}>
      <Ring progress={percent / 100} size={76} thickness={8} color={color}>
        <AppText variant="h3" weight="700">
          {round1(grams)}
        </AppText>
        <AppText variant="tiny" weight="600" color={colors.muted}>
          g
        </AppText>
      </Ring>
      <AppText variant="small" weight="500" color={colors.muted}>
        {label} · {percent}%
      </AppText>
    </View>
  );
}

function StepperButton({ icon, onPress }: { icon: "add" | "remove"; onPress: () => void }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={icon === "add" ? "Increase servings" : "Decrease servings"}
      onPress={onPress}
      style={styles.stepper}
      pressedScale={0.88}
    >
      <Ionicons name={icon} size={22} color={colors.ink} />
    </PressableScale>
  );
}

function FactRow({ label, value, bold, indent, last }: { label: string; value: string; bold?: boolean; indent?: boolean; last?: boolean }) {
  return (
    <View style={[styles.factRow, indent ? styles.factIndent : null, last ? styles.factLast : null]}>
      <AppText color={bold ? colors.ink : colors.muted} weight={bold ? "800" : "400"}>
        {label}
      </AppText>
      <AppText weight={bold ? "800" : "600"}>{value}</AppText>
    </View>
  );
}

function optionalGrams(value: number | undefined) {
  return value === undefined ? "—" : `${round1(value)} g`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function parseQuantity(text: string) {
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatQuantity(value: number) {
  return String(Math.round(value * 100) / 100);
}

function mealTypeLabel(type: MealType) {
  return type === "snack" ? "Snacks" : type.slice(0, 1).toUpperCase() + type.slice(1);
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md
  },
  stateBox: {
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.xl
  },
  hero: {
    overflow: "hidden",
    borderRadius: radius.xl,
    padding: spacing.lg + 4,
    gap: spacing.xs,
    ...elevation.raised
  },
  heroMark: {
    position: "absolute",
    right: -18,
    bottom: -22,
    transform: [{ rotate: "-12deg" }]
  },
  dangerCard: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSoft
  },
  calorieRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm
  },
  splitRow: {
    flexDirection: "row",
    justifyContent: "space-between"
  },
  splitStat: {
    flex: 1,
    alignItems: "center",
    gap: spacing.sm
  },
  card: {
    gap: spacing.md
  },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  stepper: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border
  },
  quantityField: {
    flex: 1
  },
  quantityInput: {
    textAlign: "center",
    fontSize: 22,
    fontFamily: fonts["800"]
  },
  presetRow: {
    flexDirection: "row",
    gap: spacing.sm
  },
  preset: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border
  },
  presetActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primaryLine
  },
  servingRow: {
    minHeight: 56,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border
  },
  servingRowActive: {
    borderColor: colors.primaryLine,
    backgroundColor: colors.primarySoft
  },
  servingCopy: {
    flex: 1
  },
  factRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  factLast: {
    borderBottomWidth: 0
  },
  factIndent: {
    paddingLeft: spacing.lg
  }
});
