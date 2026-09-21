import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { Segmented } from "@/components/Segmented";
import { TextField } from "@/components/TextField";
import { colors, radius, spacing } from "@/config/theme";
import { useLog } from "@/hooks/useDayLog";
import { formatDiaryDate } from "@/services/dates";
import { exerciseCalories } from "@/services/nutritionMath";
import { useAppStore } from "@/store/useAppStore";
import { ExerciseKind } from "@/types/domain";
import { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "Exercise">;

/** Calories burned per minute, used to prefill the estimate for a preset. */
const presets: Array<{ name: string; kind: ExerciseKind; perMinute: number }> = [
  { name: "Walking, brisk", kind: "cardio", perMinute: 5 },
  { name: "Running", kind: "cardio", perMinute: 11 },
  { name: "Cycling", kind: "cardio", perMinute: 8 },
  { name: "Swimming", kind: "cardio", perMinute: 9 },
  { name: "Weight training", kind: "strength", perMinute: 6 },
  { name: "HIIT", kind: "cardio", perMinute: 12 },
  { name: "Yoga", kind: "strength", perMinute: 3 },
  { name: "Hiking", kind: "cardio", perMinute: 7 }
];

export function ExerciseScreen({ navigation, route }: Props) {
  const { date } = route.params;
  const log = useLog(date);
  const addExercise = useAppStore((state) => state.addExercise);
  const removeExercise = useAppStore((state) => state.removeExercise);
  const setSteps = useAppStore((state) => state.setSteps);

  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState("30");
  const [burned, setBurned] = useState("");
  const [kind, setKind] = useState<ExerciseKind>("cardio");
  const [stepsText, setStepsText] = useState(String(log.steps ?? ""));

  function applyPreset(preset: (typeof presets)[number]) {
    setName(preset.name);
    setKind(preset.kind);
    const parsedMinutes = Number(minutes) || 30;
    setBurned(String(Math.round(preset.perMinute * parsedMinutes)));
  }

  function save() {
    const parsedMinutes = Number(minutes);
    const parsedBurned = Number(burned);

    if (!name.trim()) {
      Alert.alert("Name the exercise", "Pick a preset or type what you did.");
      return;
    }
    if (!Number.isFinite(parsedBurned) || parsedBurned <= 0) {
      Alert.alert("Add calories burned", "Enter an estimate so it can offset your calorie goal.");
      return;
    }

    addExercise(date, {
      name: name.trim(),
      kind,
      minutes: Number.isFinite(parsedMinutes) && parsedMinutes > 0 ? parsedMinutes : 0,
      caloriesBurned: parsedBurned
    });

    setName("");
    setBurned("");
  }

  function saveSteps() {
    const parsed = Number(stepsText);
    setSteps(date, Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0);
  }

  return (
    <Screen contentStyle={styles.screen}>
      <ScreenHeader title="Exercise" subtitle={formatDiaryDate(date)} onBack={() => navigation.goBack()} />

      <Card style={styles.totalCard}>
        <AppText variant="small" color={colors.muted} weight="700">
          Calories burned
        </AppText>
        <AppText variant="title" weight="800">
          {Math.round(exerciseCalories(log))}
        </AppText>
        <AppText variant="small" color={colors.muted}>
          Burned calories are added back to your daily budget.
        </AppText>
      </Card>

      {log.exercises.length ? (
        <Card style={styles.card}>
          <AppText variant="h3" weight="800">
            Logged today
          </AppText>
          {log.exercises.map((entry) => (
            <View key={entry.id} style={styles.entryRow}>
              <Ionicons name={entry.kind === "cardio" ? "walk" : "barbell"} size={20} color={colors.primary} />
              <View style={styles.entryCopy}>
                <AppText weight="700">{entry.name}</AppText>
                <AppText variant="small" color={colors.muted}>
                  {entry.minutes} min • {Math.round(entry.caloriesBurned)} cal
                </AppText>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Remove ${entry.name}`}
                hitSlop={10}
                onPress={() => removeExercise(date, entry.id)}
              >
                <Ionicons name="trash-outline" size={20} color={colors.danger} />
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}

      <Card style={styles.card}>
        <AppText variant="h3" weight="800">
          Add exercise
        </AppText>
        <View style={styles.presetGrid}>
          {presets.map((preset) => (
            <Pressable
              key={preset.name}
              accessibilityRole="button"
              onPress={() => applyPreset(preset)}
              style={({ pressed }) => [styles.preset, name === preset.name ? styles.presetActive : null, { opacity: pressed ? 0.8 : 1 }]}
            >
              <AppText variant="small" weight="700" color={name === preset.name ? colors.onPrimary : colors.ink}>
                {preset.name}
              </AppText>
            </Pressable>
          ))}
        </View>

        <TextField label="Exercise" value={name} onChangeText={setName} placeholder="What did you do?" />
        <View style={styles.inputRow}>
          <View style={styles.inputHalf}>
            <TextField label="Minutes" value={minutes} onChangeText={setMinutes} keyboardType="number-pad" />
          </View>
          <View style={styles.inputHalf}>
            <TextField label="Calories burned" value={burned} onChangeText={setBurned} keyboardType="number-pad" placeholder="0" />
          </View>
        </View>
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "cardio", label: "Cardio" },
            { value: "strength", label: "Strength" }
          ]}
        />
        <Button label="Add exercise" icon="add" onPress={save} />
      </Card>

      <Card style={styles.card}>
        <AppText variant="h3" weight="800">
          Steps
        </AppText>
        <TextField label="Steps today" value={stepsText} onChangeText={setStepsText} keyboardType="number-pad" placeholder="0" />
        <Button label="Save steps" variant="secondary" icon="footsteps" onPress={saveSteps} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md
  },
  totalCard: {
    gap: spacing.xs
  },
  card: {
    gap: spacing.md
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  entryCopy: {
    flex: 1
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  preset: {
    minHeight: 38,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border
  },
  presetActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  inputRow: {
    flexDirection: "row",
    gap: spacing.md
  },
  inputHalf: {
    flex: 1
  }
});
