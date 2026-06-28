import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { z } from "zod";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { defaultGoal, defaultUser } from "@/config/defaults";
import { colors, spacing } from "@/config/theme";
import { useAppStore } from "@/store/useAppStore";

const schema = z.object({
  name: z.string().min(1),
  calories: z.coerce.number().min(1000).max(6000),
  proteinGrams: z.coerce.number().min(20).max(400),
  carbGrams: z.coerce.number().min(20).max(700),
  fatGrams: z.coerce.number().min(10).max(250)
});

type FormValues = z.infer<typeof schema>;

export function OnboardingScreen() {
  const completeOnboarding = useAppStore((state) => state.completeOnboarding);
  const { control, handleSubmit, formState } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaultUser.name,
      calories: defaultGoal.calories,
      proteinGrams: defaultGoal.proteinGrams,
      carbGrams: defaultGoal.carbGrams,
      fatGrams: defaultGoal.fatGrams
    }
  });

  const submit = handleSubmit((values) => {
    completeOnboarding(
      { ...defaultUser, name: values.name },
      {
        calories: values.calories,
        proteinGrams: values.proteinGrams,
        carbGrams: values.carbGrams,
        fatGrams: values.fatGrams
      }
    );
  });

  return (
    <Screen>
      <View style={styles.hero}>
        <AppText variant="title" weight="800">
          MacroMind
        </AppText>
        <AppText color={colors.muted}>
          AI-first food logging with a clean macro dashboard.
        </AppText>
      </View>

      <Card style={styles.card}>
        <Controller
          control={control}
          name="name"
          render={({ field }) => (
            <TextField label="Name" value={field.value} onChangeText={field.onChange} error={formState.errors.name?.message} />
          )}
        />
        <View style={styles.grid}>
          <Controller
            control={control}
            name="calories"
            render={({ field }) => (
              <TextField label="Calories" keyboardType="number-pad" value={String(field.value)} onChangeText={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="proteinGrams"
            render={({ field }) => (
              <TextField label="Protein" keyboardType="number-pad" value={String(field.value)} onChangeText={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="carbGrams"
            render={({ field }) => (
              <TextField label="Carbs" keyboardType="number-pad" value={String(field.value)} onChangeText={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="fatGrams"
            render={({ field }) => (
              <TextField label="Fat" keyboardType="number-pad" value={String(field.value)} onChangeText={field.onChange} />
            )}
          />
        </View>
      </Card>

      <Button label="Start tracking" icon="sparkles" onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: {
    gap: spacing.sm,
    paddingTop: spacing.xxl
  },
  card: {
    gap: spacing.lg
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  }
});
