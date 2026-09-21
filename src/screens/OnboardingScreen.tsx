import { zodResolver } from "@hookform/resolvers/zod";
import { QueryClient, QueryClientContext, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MutableRefObject, useContext, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { z } from "zod";

import { authClient } from "@/auth/authClient";
import { AmbientGlow } from "@/components/AmbientGlow";
import { AppText } from "@/components/AppText";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Reveal } from "@/components/motion";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { colors, dataColors, layout, motion, radius, spacing } from "@/config/theme";
import {
  GoalConfirmationRequiredError,
  ProfileConfirmationRequiredError,
  profileRepository
} from "@/repositories/profileRepository";
import {
  centimetersFromFeetAndInches,
  feetAndInchesFromCentimeters,
  kilogramsFromPounds
} from "@/services/goalPresentation";
import { useAppStore } from "@/store/useAppStore";
import {
  captureUserSessionEpoch,
  isUserSessionEpochCurrent
} from "@/store/useOfflineStore";
import {
  CalculatedGoal,
  GoalActivityLevel,
  GoalInput,
  GoalType,
  GoalWarning,
  MeasurementSystem,
  ProfileInput,
  UserProfile
} from "@/types/domain";

const schema = z
  .object({
    displayName: z.string().trim().min(1, "Enter your name."),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD."),
    biologicalSex: z.enum(["female", "male", "unspecified"]),
    measurementSystem: z.enum(["metric", "imperial"]),
    heightCm: z.coerce.number().positive(),
    heightFeet: z.coerce.number().min(2).max(8),
    heightInches: z.coerce.number().min(0).max(11.99),
    countryCode: z.string().trim().length(2, "Use a two-letter country code."),
    currentWeight: z.coerce.number().positive(),
    targetWeight: z.coerce.number().positive(),
    weeklyRate: z.coerce.number().min(0).max(5),
    manualCalories: z.coerce.number().positive().optional(),
    proteinPercent: z.coerce.number().min(0).max(100),
    carbohydratePercent: z.coerce.number().min(0).max(100),
    fatPercent: z.coerce.number().min(0).max(100)
  })
  .refine(
    (value) => value.proteinPercent + value.carbohydratePercent + value.fatPercent === 100,
    { path: ["proteinPercent"], message: "Macro percentages must total 100%." }
  )
  .refine((value) => value.biologicalSex !== "unspecified" || value.manualCalories !== undefined, {
    path: ["manualCalories"],
    message: "Enter a manual calorie target when sex is unspecified."
  });

type FormValues = z.infer<typeof schema>;
type Step = "personal" | "goal" | "activity" | "profileSafety" | "review" | "safety";
type SessionOwner = { userId: string; epoch: number };

const activityOptions: { value: GoalActivityLevel; label: string }[] = [
  { value: "sedentary", label: "Sedentary" },
  { value: "lightly_active", label: "Lightly active" },
  { value: "moderately_active", label: "Moderately active" },
  { value: "very_active", label: "Very active" },
  { value: "extremely_active", label: "Extremely active" }
];

export function OnboardingScreen() {
  const parentQueryClient = useContext(QueryClientContext);
  const [fallbackQueryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } }));
  const fallbackLiveUserId = useRef<string>();
  if (parentQueryClient) return <AuthenticatedOnboardingContent />;
  return (
    <QueryClientProvider client={fallbackQueryClient}>
      <OnboardingContent serverEnabled={false} userId={undefined} liveUserId={fallbackLiveUserId} />
    </QueryClientProvider>
  );
}

function AuthenticatedOnboardingContent() {
  const session = authClient.useSession();
  const userId = session.data?.user.id;
  const liveUserId = useRef(userId);
  liveUserId.current = userId;
  return <OnboardingContent key={userId ?? "signed-out"} serverEnabled userId={userId} liveUserId={liveUserId} />;
}

function OnboardingContent({
  serverEnabled,
  userId,
  liveUserId
}: {
  serverEnabled: boolean;
  userId: string | undefined;
  liveUserId: MutableRefObject<string | undefined>;
}) {
  const queryClient = useQueryClient();
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const [step, setStep] = useState<Step>("personal");
  const [goalType, setGoalType] = useState<GoalType>("lose");
  const [activityLevel, setActivityLevel] = useState<GoalActivityLevel>("moderately_active");
  const [plannedExercise, setPlannedExercise] = useState(false);
  const [calculation, setCalculation] = useState<CalculatedGoal>();
  const [profileWarnings, setProfileWarnings] = useState<GoalWarning[]>([]);
  const [savedProfile, setSavedProfile] = useState<UserProfile>();
  const loadedProfileUserId = useRef<string>();

  const profileQuery = useQuery({
    queryKey: ["profile", userId],
    queryFn: profileRepository.get,
    enabled: serverEnabled && Boolean(userId),
    retry: false
  });
  const goalQuery = useQuery({
    queryKey: ["goal", userId],
    queryFn: profileRepository.getGoal,
    enabled: serverEnabled && Boolean(userId && profileQuery.data),
    retry: false
  });

  const { control, getValues, handleSubmit, formState, reset, trigger, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: "",
      dateOfBirth: "1990-01-01",
      biologicalSex: "unspecified",
      measurementSystem: "metric",
      heightCm: 175,
      heightFeet: 5,
      heightInches: 9,
      countryCode: "PH",
      currentWeight: 75,
      targetWeight: 70,
      weeklyRate: 0.5,
      manualCalories: 2200,
      proteinPercent: 30,
      carbohydratePercent: 40,
      fatPercent: 30
    }
  });

  const measurementSystem = watch("measurementSystem");
  const biologicalSex = watch("biologicalSex");

  useEffect(() => {
    if (!profileQuery.data || !userId || loadedProfileUserId.current === userId) return;
    loadedProfileUserId.current = userId;
    const height = feetAndInchesFromCentimeters(Number(profileQuery.data.heightCm));
    reset({
      ...getValues(),
      displayName: profileQuery.data.displayName,
      dateOfBirth: profileQuery.data.dateOfBirth,
      biologicalSex: profileQuery.data.biologicalSex,
      measurementSystem: profileQuery.data.measurementSystem,
      heightCm: Number(profileQuery.data.heightCm),
      heightFeet: height.feet,
      heightInches: height.inches,
      countryCode: profileQuery.data.countryCode
    });
  }, [getValues, profileQuery.data, reset, userId]);

  useEffect(() => {
    if (profileQuery.data && goalQuery.data && userId) {
      completeOnboarding(profileQuery.data, goalQuery.data, userId);
    }
  }, [completeOnboarding, goalQuery.data, profileQuery.data, userId]);

  const reviewMutation = useMutation({
    mutationFn: async ({ values, confirmedWarnings = [], owner }: { values: FormValues; confirmedWarnings?: GoalWarning[]; owner: SessionOwner }) => {
      if (!isSessionOwnerCurrent(owner, liveUserId)) return undefined;
      const profile = await profileRepository.update(profileFromForm(values), confirmedWarnings);
      if (!isSessionOwnerCurrent(owner, liveUserId)) return undefined;
      const goal = goalFromForm(values, goalType, activityLevel, plannedExercise);
      const calculated = await profileRepository.calculateGoal(goal);
      if (!isSessionOwnerCurrent(owner, liveUserId)) return undefined;
      return { profile, calculated };
    },
    onSuccess: (result, { owner }) => {
      if (!result || !isSessionOwnerCurrent(owner, liveUserId)) return;
      const { profile, calculated } = result;
      setProfileWarnings([]);
      setSavedProfile(profile);
      setCalculation(calculated);
      queryClient.setQueryData(["profile", owner.userId], profile);
      setStep("review");
    },
    onError: (error, { owner }) => {
      if (!isSessionOwnerCurrent(owner, liveUserId)) return;
      if (error instanceof ProfileConfirmationRequiredError) {
        setProfileWarnings(error.warnings);
        setStep("profileSafety");
      }
    }
  });

  const saveMutation = useMutation({
    mutationFn: async ({ confirmed, owner }: { confirmed: boolean; owner: SessionOwner }) => {
      if (!isSessionOwnerCurrent(owner, liveUserId)) return undefined;
      if (!calculation || !savedProfile) throw new Error("Calculate the goal before saving.");
      const values = schema.parse(getValues());
      const goal = goalFromForm(values, goalType, activityLevel, plannedExercise);
      const result = await profileRepository.saveGoal(goal, calculation, confirmed ? calculation.warnings : []);
      return isSessionOwnerCurrent(owner, liveUserId) ? result : undefined;
    },
    onSuccess: (result, { owner }) => {
      if (!result || !savedProfile || !isSessionOwnerCurrent(owner, liveUserId)) return;
      queryClient.setQueryData(["goal", owner.userId], result.goal);
      completeOnboarding(savedProfile, result.goal, owner.userId);
    },
    onError: (error, { owner }) => {
      if (!isSessionOwnerCurrent(owner, liveUserId)) return;
      if (error instanceof GoalConfirmationRequiredError) setStep("safety");
    }
  });

  function mutateReview(values: FormValues, confirmedWarnings: GoalWarning[] = []) {
    const owner = captureSessionOwner(userId);
    if (owner) reviewMutation.mutate({ values, confirmedWarnings, owner });
  }

  function mutateSave(confirmed: boolean) {
    const owner = captureSessionOwner(userId);
    if (owner) saveMutation.mutate({ confirmed, owner });
  }

  if (profileQuery.isError || goalQuery.isError) {
    return (
      <StatusCard
        title="We could not load your profile"
        message="Check your connection, then try again."
        actionLabel="Try again"
        onAction={() => {
          void profileQuery.refetch();
          void goalQuery.refetch();
        }}
      />
    );
  }

  const busy = reviewMutation.isPending || saveMutation.isPending;
  const error = reviewMutation.error ?? saveMutation.error;
  const profileLookupPending = serverEnabled && profileQuery.isPending;

  return (
    <Screen contentStyle={styles.screen} maxWidth={layout.maxFormWidth} backdrop={<AmbientGlow />}>
      <Reveal index={0} style={styles.hero}>
        <BrandMark />
        <StepProgress step={stepNumber(step)} total={5} />
        <AppText variant="small" weight="600" color={colors.muted}>Step {stepNumber(step)} of 5 · {stepTitle(step)}</AppText>
      </Reveal>

      {serverEnabled && (profileQuery.isPending || (profileQuery.data && goalQuery.isPending)) ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={colors.primary} />
          <AppText variant="small" color={colors.muted}>Loading any saved profile…</AppText>
        </View>
      ) : null}

      <Reveal key={step} index={1}>
        {step === "personal" ? (
          <Card style={styles.card}>
            <AppText variant="h3" weight="800">Personal details</AppText>
            <Field control={control} name="displayName" label="Name" error={formState.errors.displayName?.message} />
            <Field control={control} name="dateOfBirth" label="Date of birth (YYYY-MM-DD)" error={formState.errors.dateOfBirth?.message} />
            <Controller
              control={control}
              name="biologicalSex"
              render={({ field }) => (
                <ChoiceRow
                  label="Biological sex"
                  value={field.value}
                  choices={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }, { value: "unspecified", label: "Prefer not to say" }]}
                  onChange={field.onChange}
                />
              )}
            />
            <Controller
              control={control}
              name="measurementSystem"
              render={({ field }) => (
                <ChoiceRow
                  label="Units"
                  value={field.value}
                  choices={[{ value: "metric", label: "Metric" }, { value: "imperial", label: "Imperial" }]}
                  onChange={(value) => field.onChange(value as MeasurementSystem)}
                />
              )}
            />
            {measurementSystem === "metric" ? (
              <Field control={control} name="heightCm" label="Height (cm)" keyboardType="decimal-pad" />
            ) : (
              <View style={styles.row}>
                <Field control={control} name="heightFeet" label="Height (ft)" keyboardType="number-pad" containerStyle={styles.rowField} />
                <Field control={control} name="heightInches" label="Inches" keyboardType="decimal-pad" containerStyle={styles.rowField} />
              </View>
            )}
            <Field control={control} name="countryCode" label="Country code" autoCapitalize="characters" error={formState.errors.countryCode?.message} />
            <Button
              label="Start tracking"
              disabled={profileLookupPending}
              onPress={() => void trigger(["displayName", "dateOfBirth", "biologicalSex", "measurementSystem", "heightCm", "heightFeet", "heightInches", "countryCode"]).then((valid) => valid && setStep("goal"))}
            />
          </Card>
        ) : null}

        {step === "goal" ? (
          <Card style={styles.card}>
            <AppText variant="h3" weight="800">Your goal</AppText>
            <ChoiceRow label="Direction" value={goalType} choices={[{ value: "lose", label: "Lose" }, { value: "maintain", label: "Maintain" }, { value: "gain", label: "Gain" }]} onChange={(value) => setGoalType(value as GoalType)} />
            <Field control={control} name="currentWeight" label={`Current weight (${measurementSystem === "metric" ? "kg" : "lb"})`} keyboardType="decimal-pad" />
            <Field control={control} name="targetWeight" label={`Target weight (${measurementSystem === "metric" ? "kg" : "lb"})`} keyboardType="decimal-pad" />
            <Field control={control} name="weeklyRate" label={`Weekly change (${measurementSystem === "metric" ? "kg" : "lb"})`} keyboardType="decimal-pad" />
            {biologicalSex === "unspecified" ? (
              <Field control={control} name="manualCalories" label="Manual calories per day" keyboardType="number-pad" error={formState.errors.manualCalories?.message} />
            ) : null}
            <View style={styles.sectionLabel}>
              <AppText variant="small" weight="700">Macro split</AppText>
              <AppText variant="tiny" color={colors.muted}>Percent of daily calories · must total 100</AppText>
            </View>
            <View style={styles.row}>
              <Field control={control} name="proteinPercent" label="Protein %" keyboardType="number-pad" containerStyle={styles.rowField} />
              <Field control={control} name="carbohydratePercent" label="Carbs %" keyboardType="number-pad" containerStyle={styles.rowField} />
              <Field control={control} name="fatPercent" label="Fat %" keyboardType="number-pad" containerStyle={styles.rowField} />
            </View>
            {formState.errors.proteinPercent?.message ? (
              <AppText variant="tiny" color={colors.danger}>{formState.errors.proteinPercent.message}</AppText>
            ) : null}
            <View style={styles.actions}>
              <Button label="Back" variant="secondary" onPress={() => setStep("personal")} style={styles.action} />
              <Button label="Continue" onPress={() => void trigger(["currentWeight", "targetWeight", "weeklyRate", "manualCalories", "proteinPercent", "carbohydratePercent", "fatPercent"]).then((valid) => valid && setStep("activity"))} style={styles.action} />
            </View>
          </Card>
        ) : null}

        {step === "activity" ? (
          <Card style={styles.card}>
            <AppText variant="h3" weight="800">Activity</AppText>
            <ChoiceRow label="Usual activity" value={activityLevel} choices={activityOptions} onChange={(value) => setActivityLevel(value as GoalActivityLevel)} />
            <ChoiceRow label="Is planned exercise already included?" value={plannedExercise ? "yes" : "no"} choices={[{ value: "no", label: "No" }, { value: "yes", label: "Yes" }]} onChange={(value) => setPlannedExercise(value === "yes")} />
            <View style={styles.actions}>
              <Button label="Back" variant="secondary" onPress={() => setStep("goal")} style={styles.action} />
              <Button label="Calculate target" disabled={busy} onPress={handleSubmit((values) => mutateReview(values))} style={styles.action} />
            </View>
          </Card>
        ) : null}

        {step === "profileSafety" ? (
          <Card style={styles.warningCard}>
            <AppText variant="h3" weight="800" color={colors.danger}>Confirm profile safety warning</AppText>
            <WarningList warnings={profileWarnings} />
            <AppText color={colors.muted}>Your profile change would recalculate an existing goal. Confirm before applying both changes.</AppText>
            <View style={styles.actions}>
              <Button label="Change profile" variant="secondary" onPress={() => setStep("personal")} style={styles.action} />
              <Button
                label="I understand, update profile"
                disabled={busy}
                onPress={() => mutateReview(schema.parse(getValues()), profileWarnings)}
                style={styles.action}
              />
            </View>
          </Card>
        ) : null}

        {step === "review" && calculation ? (
          <Card style={styles.card}>
            <AppText variant="h3" weight="800">Review your estimate</AppText>
            <View style={styles.targetHero}>
              <AppText variant="small" weight="600" color={colors.muted}>Daily calorie target</AppText>
              <View style={styles.targetValue}>
                <AppText variant="display" weight="800" color={colors.primary}>{formatKcal(calculation.calorieTargetKcal)}</AppText>
                <AppText weight="600" color={colors.muted}>kcal / day</AppText>
              </View>
            </View>
            <View style={styles.ladder}>
              <LadderRow label="Resting burn (BMR)" value={`${formatKcal(calculation.bmrKcal)} kcal`} />
              <LadderRow label="Activity multiplier" value={`× ${Number(calculation.activityMultiplier)}`} />
              <LadderRow label="Daily burn (TDEE)" value={`${formatKcal(calculation.tdeeKcal)} kcal`} />
              <LadderRow label="Goal adjustment" value={`${Number(calculation.calorieAdjustmentKcal) > 0 ? "+" : Number(calculation.calorieAdjustmentKcal) < 0 ? "−" : ""}${formatKcal(String(Math.abs(Number(calculation.calorieAdjustmentKcal))))} kcal`} last />
            </View>
            <View style={styles.macroTargets}>
              <MacroTarget label="Protein" grams={calculation.proteinTargetG} color={dataColors.protein} />
              <MacroTarget label="Carbs" grams={calculation.carbohydrateTargetG} color={dataColors.carbs} />
              <MacroTarget label="Fat" grams={calculation.fatTargetG} color={dataColors.fat} />
            </View>
            <AppText variant="tiny" color={colors.muted}>This is an estimate calculated with the Mifflin-St Jeor equation.</AppText>
            {calculation.warnings.length ? <WarningList warnings={calculation.warnings} /> : null}
            <View style={styles.actions}>
              <Button label="Back" variant="secondary" onPress={() => setStep("activity")} style={styles.action} />
              <Button label="Save goal" disabled={busy} onPress={() => mutateSave(false)} style={styles.action} />
            </View>
          </Card>
        ) : null}

        {step === "safety" && calculation ? (
          <Card style={styles.warningCard}>
            <AppText variant="h3" weight="800" color={colors.danger}>Confirm safety warning</AppText>
            <WarningList warnings={calculation.warnings} />
            <AppText color={colors.muted}>This is a second confirmation. Save only if you understand these warnings.</AppText>
            <View style={styles.actions}>
              <Button label="Change goal" variant="secondary" onPress={() => setStep("goal")} style={styles.action} />
              <Button label="I understand, save" disabled={busy} onPress={() => mutateSave(true)} style={styles.action} />
            </View>
          </Card>
        ) : null}

      </Reveal>

      {error && !(error instanceof GoalConfirmationRequiredError) && !(error instanceof ProfileConfirmationRequiredError) ? (
        <AppText color={colors.danger}>{error instanceof Error ? error.message : "Could not save your goal."}</AppText>
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

function profileFromForm(values: FormValues): ProfileInput {
  const heightCm = values.measurementSystem === "imperial"
    ? centimetersFromFeetAndInches(values.heightFeet, values.heightInches)
    : values.heightCm;
  return {
    displayName: values.displayName.trim(),
    dateOfBirth: values.dateOfBirth,
    biologicalSex: values.biologicalSex,
    heightCm,
    countryCode: values.countryCode.trim().toUpperCase(),
    timezone: deviceTimezone(),
    languageCode: "en",
    measurementSystem: values.measurementSystem
  };
}

function goalFromForm(values: FormValues, goalType: GoalType, activityLevel: GoalActivityLevel, plannedExerciseInActivity: boolean): GoalInput {
  const weight = (value: number) => values.measurementSystem === "imperial" ? kilogramsFromPounds(value) : value;
  return {
    goalType,
    startingWeightKg: weight(values.currentWeight),
    currentWeightKg: weight(values.currentWeight),
    targetWeightKg: weight(values.targetWeight),
    weeklyRateKg: goalType === "maintain" ? 0 : weight(values.weeklyRate) * (goalType === "lose" ? -1 : 1),
    activityLevel,
    plannedExerciseInActivity,
    targetMode: "percentage",
    macros: { protein: values.proteinPercent, carbohydrate: values.carbohydratePercent, fat: values.fatPercent },
    ...(values.biologicalSex === "unspecified" && values.manualCalories ? { manualCalorieTargetKcal: values.manualCalories } : {})
  };
}

function deviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function stepNumber(step: Step): number {
  return ({ personal: 1, goal: 2, activity: 3, profileSafety: 4, review: 4, safety: 5 })[step];
}

function stepTitle(step: Step): string {
  return ({ personal: "Personal details", goal: "Goal", activity: "Activity", profileSafety: "Profile safety confirmation", review: "Review", safety: "Safety confirmation" })[step];
}

function WarningList({ warnings }: { warnings: GoalWarning[] }) {
  return (
    <View style={styles.warningList}>
      {warnings.includes("LOW_CALORIE_TARGET") ? <AppText color={colors.danger}>Below 1,200 kcal/day. Consider speaking with a qualified clinician.</AppText> : null}
      {warnings.includes("EXTREME_RATE") ? <AppText color={colors.danger}>Faster than 1 kg/week. This may be unsafe or hard to sustain.</AppText> : null}
    </View>
  );
}

function ChoiceRow({ label, value, choices, onChange }: { label: string; value: string; choices: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <View style={styles.choiceWrap}>
      <AppText variant="small" color={colors.muted} weight="600">{label}</AppText>
      <View style={styles.choiceRow}>
        {choices.map((choice) => {
          const selected = value === choice.value;
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(choice.value)}
              style={({ pressed }) => [styles.choice, selected ? styles.choiceActive : null, { opacity: pressed ? 0.8 : 1 }]}
            >
              <AppText variant="small" weight="700" color={selected ? colors.primary : colors.muted}>{choice.label}</AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Five segments; the current one springs open to full width. */
function StepProgress({ step, total }: { step: number; total: number }) {
  return (
    <View style={styles.progress} accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: step }}>
      {Array.from({ length: total }, (_, index) => (
        <ProgressSegment key={index} filled={index < step} />
      ))}
    </View>
  );
}

function ProgressSegment({ filled }: { filled: boolean }) {
  const fill = useSharedValue(filled ? 1 : 0);
  useEffect(() => {
    fill.value = withSpring(filled ? 1 : 0, motion.settle);
  }, [fill, filled]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  return (
    <View style={styles.progressSegment}>
      <Animated.View style={[styles.progressFill, style]} />
    </View>
  );
}

function LadderRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.ladderRow, last ? null : styles.ladderDivider]}>
      <AppText color={colors.muted}>{label}</AppText>
      <AppText weight="700">{value}</AppText>
    </View>
  );
}

function MacroTarget({ label, grams, color }: { label: string; grams: string; color: string }) {
  return (
    <View style={styles.macroTarget}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <AppText variant="h3" weight="800">{Math.round(Number(grams))} g</AppText>
      <AppText variant="tiny" color={colors.muted}>{label}</AppText>
    </View>
  );
}

function formatKcal(value: string) {
  return Math.round(Number(value)).toLocaleString();
}

function Field({ control, name, label, error, ...props }: { control: ReturnType<typeof useForm<FormValues>>["control"]; name: keyof FormValues; label: string; error?: string; keyboardType?: "number-pad" | "decimal-pad"; autoCapitalize?: "characters"; containerStyle?: StyleProp<ViewStyle> }) {
  return (
    <Controller control={control} name={name} render={({ field, fieldState }) => (
      <TextField {...props} label={label} value={String(field.value ?? "")} onChangeText={field.onChange} error={error ?? fieldState.error?.message} />
    )} />
  );
}

function StatusCard({ title, message, loading, actionLabel, onAction }: { title: string; message?: string; loading?: boolean; actionLabel?: string; onAction?: () => void }) {
  return (
    <Screen contentStyle={styles.status}>
      <Card style={styles.card}>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}
        <AppText variant="h3" weight="800">{title}</AppText>
        {message ? <AppText color={colors.muted}>{message}</AppText> : null}
        {actionLabel && onAction ? <Button label={actionLabel} onPress={onAction} /> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { gap: spacing.lg },
  hero: { gap: spacing.md, paddingTop: spacing.md },
  card: { gap: spacing.lg },
  warningCard: { gap: spacing.lg, borderColor: colors.danger },
  warningList: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.dangerSoft },
  row: { flexDirection: "row", gap: spacing.md },
  rowField: { flex: 1 },
  sectionLabel: { gap: 2 },
  actions: { flexDirection: "row", gap: spacing.md },
  action: { flex: 1 },
  choiceWrap: { gap: spacing.sm },
  choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  choice: { minHeight: 40, paddingHorizontal: spacing.lg - 2, borderRadius: radius.pill, alignItems: "center", justifyContent: "center", backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  choiceActive: { backgroundColor: colors.primarySoft, borderColor: colors.primaryLine },
  progress: { flexDirection: "row", gap: 6 },
  progressSegment: { flex: 1, height: 4, borderRadius: radius.pill, overflow: "hidden", backgroundColor: colors.surfaceRaised },
  progressFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.primary },
  targetHero: { gap: 2 },
  targetValue: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  ladder: { borderRadius: radius.md, paddingHorizontal: spacing.md, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  ladderRow: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md },
  ladderDivider: { borderBottomWidth: 1, borderBottomColor: colors.border },
  macroTargets: { flexDirection: "row", gap: spacing.sm },
  macroTarget: { flex: 1, gap: 2, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.surfaceRaised },
  macroDot: { width: 8, height: 8, borderRadius: 4, marginBottom: spacing.xs },
  status: { justifyContent: "center" },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm }
});
