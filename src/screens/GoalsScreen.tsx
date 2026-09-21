import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MutableRefObject, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { authClient } from "@/auth/authClient";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { macroColors } from "@/components/MacroRings";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { TextField } from "@/components/TextField";
import { waterServingMl } from "@/config/defaults";
import { featureFlags } from "@/config/features";
import { colors, radius, spacing } from "@/config/theme";
import { GoalConfirmationRequiredError, profileRepository } from "@/repositories/profileRepository";
import { formatGoalExplanation, kilogramsFromPounds, poundsFromKilograms } from "@/services/goalPresentation";
import { goalFromSplit } from "@/services/nutritionMath";
import { useAppStore } from "@/store/useAppStore";
import {
  captureUserSessionEpoch,
  isUserSessionEpochCurrent
} from "@/store/useOfflineStore";
import { CalculatedGoal, GoalInput, StoredGoal } from "@/types/domain";
import { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Goals">;

const presets = [
  { label: "Balanced", carbs: 50, fat: 30, protein: 20 },
  { label: "High protein", carbs: 40, fat: 25, protein: 35 },
  { label: "Low carb", carbs: 25, fat: 45, protein: 30 },
  { label: "Keto", carbs: 10, fat: 70, protein: 20 }
];

type Split = { carbs: number; fat: number; protein: number };
type SessionOwner = { userId: string; epoch: number };

export function GoalsScreen(props: Props) {
  const session = authClient.useSession();
  const userId = session.data?.user.id;
  const liveUserId = useRef(userId);
  liveUserId.current = userId;
  return <GoalsContent key={userId ?? "signed-out"} {...props} userId={userId} liveUserId={liveUserId} />;
}

function GoalsContent({
  navigation,
  userId,
  liveUserId
}: Props & {
  userId: string | undefined;
  liveUserId: MutableRefObject<string | undefined>;
}) {
  const queryClient = useQueryClient();
  const localGoal = useAppStore((state) => state.goal);
  const syncServerGoal = useAppStore((state) => state.syncServerGoal);
  const updateGoal = useAppStore((state) => state.updateGoal);
  const goalQuery = useQuery({
    queryKey: ["goal", userId],
    queryFn: profileRepository.getGoal,
    enabled: Boolean(userId)
  });
  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    queryFn: profileRepository.get,
    enabled: Boolean(userId)
  });
  const serverGoal = goalQuery.data;
  const imperial = profileQuery.data?.measurementSystem === "imperial";

  const [calories, setCalories] = useState("");
  const [split, setSplit] = useState<Split>({ carbs: 40, fat: 30, protein: 30 });
  const [waterCups, setWaterCups] = useState(String(Math.round(localGoal.waterMl / waterServingMl)));
  const [goalWeight, setGoalWeight] = useState("");
  const [manualTarget, setManualTarget] = useState(false);
  const [calculation, setCalculation] = useState<CalculatedGoal>();
  const [confirmingWarnings, setConfirmingWarnings] = useState(false);

  useEffect(() => {
    if (!serverGoal || !userId) return;
    syncServerGoal(serverGoal, userId);
    setCalories(String(Math.round(Number(serverGoal.calorieTargetKcal))));
    setGoalWeight(String(roundWeight(imperial ? poundsFromKilograms(Number(serverGoal.targetWeightKg)) : Number(serverGoal.targetWeightKg))));
    setSplit(splitFromServerGoal(serverGoal));
    setManualTarget(serverGoal.isManualCalorieTarget);
  }, [imperial, serverGoal, syncServerGoal, userId]);

  const parsedCalories = Number(calories) || 0;
  const grams = useMemo(() => goalFromSplit(parsedCalories, split), [parsedCalories, split]);
  const splitTotal = split.carbs + split.fat + split.protein;

  const calculateMutation = useMutation({
    mutationFn: async ({ owner }: { owner: SessionOwner }) => {
      if (!isSessionOwnerCurrent(owner, liveUserId)) return undefined;
      if (!serverGoal) throw new Error("No saved goal was found.");
      const result = await profileRepository.calculateGoal(buildGoalInput(serverGoal, goalWeight, imperial, split, manualTarget ? parsedCalories : undefined));
      return isSessionOwnerCurrent(owner, liveUserId) ? result : undefined;
    },
    onSuccess: (value, { owner }) => {
      if (!value || !isSessionOwnerCurrent(owner, liveUserId)) return;
      setCalculation(value);
      setConfirmingWarnings(false);
    }
  });

  const saveMutation = useMutation({
    mutationFn: async ({ confirmed, owner }: { confirmed: boolean; owner: SessionOwner }) => {
      if (!isSessionOwnerCurrent(owner, liveUserId)) return undefined;
      if (!serverGoal || !calculation) throw new Error("Review the calculated goal before saving.");
      const input = buildGoalInput(serverGoal, goalWeight, imperial, split, manualTarget ? parsedCalories : undefined);
      const result = await profileRepository.saveGoal(input, calculation, confirmed ? calculation.warnings : []);
      return isSessionOwnerCurrent(owner, liveUserId) ? result : undefined;
    },
    onSuccess: (result, { owner }) => {
      if (!result || !isSessionOwnerCurrent(owner, liveUserId)) return;
      queryClient.setQueryData(["goal", owner.userId], result.goal);
      syncServerGoal(result.goal, owner.userId);
      if (featureFlags.water.enabled) {
        const cups = Number(waterCups);
        updateGoal({ waterMl: Number.isFinite(cups) && cups > 0 ? Math.round(cups) * waterServingMl : localGoal.waterMl });
      }
      navigation.goBack();
    },
    onError: (error, { owner }) => {
      if (!isSessionOwnerCurrent(owner, liveUserId)) return;
      if (error instanceof GoalConfirmationRequiredError) setConfirmingWarnings(true);
    }
  });

  function adjust(key: keyof Split, delta: number) {
    setSplit((current) => ({ ...current, [key]: Math.max(0, Math.min(100, current[key] + delta)) }));
    setCalculation(undefined);
  }

  function review() {
    if (parsedCalories < 800 || parsedCalories > 10000) return;
    if (splitTotal !== 100 || !Number(goalWeight)) return;
    const owner = captureSessionOwner(userId);
    if (owner) calculateMutation.mutate({ owner });
  }

  function save(confirmed: boolean) {
    const owner = captureSessionOwner(userId);
    if (owner) saveMutation.mutate({ confirmed, owner });
  }

  if ((goalQuery.isPending || profileQuery.isPending) && !serverGoal) {
    return <StatusScreen navigation={navigation} title="Loading goals" loading />;
  }

  if ((goalQuery.isError || profileQuery.isError) && !serverGoal) {
    return <StatusScreen navigation={navigation} title="We could not load your goals" message="Check your connection, then try again." actionLabel="Try again" onAction={() => { void goalQuery.refetch(); void profileQuery.refetch(); }} />;
  }

  if (!serverGoal) {
    return <StatusScreen navigation={navigation} title="No saved goal yet" message="Complete onboarding first so BiteIQ can calculate your estimate." />;
  }

  const busy = calculateMutation.isPending || saveMutation.isPending;
  const error = calculateMutation.error ?? saveMutation.error;

  return (
    <Screen contentStyle={styles.screen}>
      <ScreenHeader title="Goals" subtitle="Server-synced calories, macros, and weight" onBack={() => navigation.goBack()} />

      {(goalQuery.isError || profileQuery.isError) && serverGoal ? (
        <Card style={styles.warningCard}>
          <AppText color={colors.danger}>Offline. Showing the last synchronized goal. Saving is disabled.</AppText>
        </Card>
      ) : null}

      <Card style={styles.card}>
        <AppText variant="h3" weight="800">Daily calorie goal</AppText>
        <TextField
          label="Calories"
          value={calories}
          onChangeText={(value) => {
            setCalories(value);
            setManualTarget(true);
            setCalculation(undefined);
          }}
          keyboardType="number-pad"
          error={parsedCalories < 800 || parsedCalories > 10000 ? "Enter 800 to 10,000 calories." : undefined}
        />
        <AppText variant="small" color={colors.muted}>
          {manualTarget ? "This will be saved as a manual target." : "This target currently comes from the server estimate."}
        </AppText>
      </Card>

      <Card style={styles.card}>
        <View style={styles.splitHeader}>
          <AppText variant="h3" weight="800">Macro split</AppText>
          <AppText weight="800" color={splitTotal === 100 ? colors.primary : colors.danger}>{splitTotal}%</AppText>
        </View>
        <View style={styles.presetRow}>
          {presets.map((preset) => {
            const active = preset.carbs === split.carbs && preset.fat === split.fat && preset.protein === split.protein;
            return (
              <Pressable key={preset.label} accessibilityRole="button" onPress={() => { setSplit({ carbs: preset.carbs, fat: preset.fat, protein: preset.protein }); setCalculation(undefined); }} style={[styles.preset, active ? styles.presetActive : null]}>
                <AppText variant="small" weight="700" color={active ? colors.primary : colors.muted}>{preset.label}</AppText>
              </Pressable>
            );
          })}
        </View>
        <SplitRow label="Carbohydrates" percent={split.carbs} grams={grams.carbGrams} color={macroColors.carbs} onAdjust={(delta) => adjust("carbs", delta)} />
        <SplitRow label="Fat" percent={split.fat} grams={grams.fatGrams} color={macroColors.fat} onAdjust={(delta) => adjust("fat", delta)} />
        <SplitRow label="Protein" percent={split.protein} grams={grams.proteinGrams} color={macroColors.protein} onAdjust={(delta) => adjust("protein", delta)} />
        {splitTotal !== 100 ? <AppText variant="small" color={colors.danger}>Adjust the percentages until they add up to 100%.</AppText> : null}
      </Card>

      <Card style={styles.card}>
        <AppText variant="h3" weight="800">{featureFlags.water.enabled ? "Water and weight" : "Goal weight"}</AppText>
        {featureFlags.water.enabled ? (
          <TextField label="Water goal (cups)" value={waterCups} onChangeText={setWaterCups} keyboardType="number-pad" />
        ) : null}
        <TextField
          label={`Goal weight (${imperial ? "lb" : "kg"})`}
          value={goalWeight}
          onChangeText={(value) => { setGoalWeight(value); setCalculation(undefined); }}
          keyboardType="decimal-pad"
        />
      </Card>

      {!calculation ? (
        <Button label="Review calculated goal" icon="calculator" disabled={busy || goalQuery.isError || profileQuery.isError} onPress={review} />
      ) : !confirmingWarnings ? (
        <Card style={styles.card}>
          <AppText variant="h3" weight="800">Review this estimate</AppText>
          {formatGoalExplanation(calculation).map((line) => <AppText key={line} color={colors.muted}>{line}</AppText>)}
          <GoalWarnings calculation={calculation} />
          <Button label="Save goals" icon="checkmark" disabled={busy} onPress={() => save(false)} />
        </Card>
      ) : (
        <Card style={styles.warningCard}>
          <AppText variant="h3" weight="800" color={colors.danger}>Confirm safety warning</AppText>
          <GoalWarnings calculation={calculation} />
          <AppText color={colors.muted}>This is a second confirmation. Save only if you understand these warnings.</AppText>
          <Button label="I understand, save" disabled={busy} onPress={() => save(true)} />
        </Card>
      )}

      {error && !(error instanceof GoalConfirmationRequiredError) ? (
        <AppText color={colors.danger}>{error instanceof Error ? error.message : "Could not update your goal."}</AppText>
      ) : null}
    </Screen>
  );
}

function captureSessionOwner(userId: string | undefined): SessionOwner | undefined {
  return userId ? { userId, epoch: captureUserSessionEpoch(userId) } : undefined;
}

function isSessionOwnerCurrent(
  owner: SessionOwner,
  liveUserId: MutableRefObject<string | undefined>
): boolean {
  return liveUserId.current === owner.userId && isUserSessionEpochCurrent(owner.userId, owner.epoch);
}

function buildGoalInput(goal: StoredGoal, displayedTargetWeight: string, imperial: boolean, split: Split, manualCalories?: number): GoalInput {
  const targetWeight = Number(displayedTargetWeight);
  return {
    goalType: goal.goalType,
    startingWeightKg: Number(goal.startingWeightKg),
    currentWeightKg: Number(goal.currentWeightKg),
    targetWeightKg: imperial ? kilogramsFromPounds(targetWeight) : targetWeight,
    weeklyRateKg: Number(goal.weeklyRateKg),
    activityLevel: goal.activityLevel,
    plannedExerciseInActivity: goal.plannedExerciseInActivity,
    targetMode: "percentage",
    macros: { protein: split.protein, carbohydrate: split.carbs, fat: split.fat },
    ...(manualCalories ? { manualCalorieTargetKcal: manualCalories } : {})
  };
}

function splitFromServerGoal(goal: StoredGoal): Split {
  const audit = goal.equationInputs as StoredGoal["equationInputs"] & { macros?: { protein: number; carbohydrate: number; fat: number } };
  if (goal.targetMode === "percentage" && audit.macros) {
    return { protein: audit.macros.protein, carbs: audit.macros.carbohydrate, fat: audit.macros.fat };
  }
  const calories = Number(goal.calorieTargetKcal);
  return {
    protein: Math.round((Number(goal.proteinTargetG) * 4 * 100) / calories),
    carbs: Math.round((Number(goal.carbohydrateTargetG) * 4 * 100) / calories),
    fat: Math.round((Number(goal.fatTargetG) * 9 * 100) / calories)
  };
}

function roundWeight(value: number): number {
  return Math.round(value * 10) / 10;
}

function GoalWarnings({ calculation }: { calculation: CalculatedGoal }) {
  return (
    <View style={styles.warningList}>
      {calculation.warnings.includes("LOW_CALORIE_TARGET") ? <AppText color={colors.danger}>Below 1,200 kcal/day. Consider speaking with a qualified clinician.</AppText> : null}
      {calculation.warnings.includes("EXTREME_RATE") ? <AppText color={colors.danger}>Faster than 1 kg/week. This may be unsafe or hard to sustain.</AppText> : null}
    </View>
  );
}

function SplitRow({ label, percent, grams, color, onAdjust }: { label: string; percent: number; grams: number; color: string; onAdjust: (delta: number) => void }) {
  return (
    <View style={styles.splitRow}>
      <View style={styles.splitCopy}>
        <AppText weight="700" color={color}>{label}</AppText>
        <AppText variant="small" color={colors.muted}>{grams} g per day</AppText>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Decrease ${label}`} onPress={() => onAdjust(-5)} style={styles.stepper}><AppText weight="800">−</AppText></Pressable>
      <AppText variant="h3" weight="800" style={styles.percent}>{percent}%</AppText>
      <Pressable accessibilityRole="button" accessibilityLabel={`Increase ${label}`} onPress={() => onAdjust(5)} style={styles.stepper}><AppText weight="800">+</AppText></Pressable>
    </View>
  );
}

function StatusScreen({ navigation, title, message, loading, actionLabel, onAction }: { navigation: Props["navigation"]; title: string; message?: string; loading?: boolean; actionLabel?: string; onAction?: () => void }) {
  return (
    <Screen contentStyle={styles.screen}>
      <ScreenHeader title="Goals" onBack={() => navigation.goBack()} />
      <Card style={styles.statusCard}>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        <AppText variant="h3" weight="800">{title}</AppText>
        {message ? <AppText color={colors.muted}>{message}</AppText> : null}
        {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.md },
  card: { gap: spacing.md },
  statusCard: { gap: spacing.md, alignItems: "center" },
  warningCard: { gap: spacing.md, borderColor: colors.danger },
  warningList: { gap: spacing.sm },
  splitHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  presetRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  preset: { minHeight: 36, paddingHorizontal: spacing.md, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  presetActive: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLine },
  splitRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  splitCopy: { flex: 1 },
  stepper: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  percent: { minWidth: 54, textAlign: "center" }
});
