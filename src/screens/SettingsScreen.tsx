import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { z } from "zod";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { FoodSourceSettingsCard } from "@/components/FoodSourceSettingsCard";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { TextField } from "@/components/TextField";
import { providerPresets } from "@/config/defaults";
import { colors, spacing } from "@/config/theme";
import { createModelProvider } from "@/services/ai/providerRegistry";
import { useAppStore } from "@/store/useAppStore";
import { ModelProviderConfig, ProviderType } from "@/types/domain";

const providerTypes: ProviderType[] = ["mock", "local-codex", "local-claude", "hosted"];

const schema = z.object({
  label: z.string().min(1),
  providerType: z.enum(["mock", "local-codex", "local-claude", "hosted"]),
  baseUrl: z.string().min(1),
  modelName: z.string().min(1),
  timeoutMs: z.coerce.number().min(1000).max(120000)
});

type FormValues = z.infer<typeof schema>;

export function SettingsScreen({ navigation }: any) {
  const providerConfig = useAppStore((state) => state.providerConfig);
  const upsertProviderConfig = useAppStore((state) => state.upsertProviderConfig);
  const { control, handleSubmit, reset, setValue, watch } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: formValuesFromConfig(providerConfig)
  });
  const selectedType = watch("providerType");

  const testMutation = useMutation({
    mutationFn: async (config: ModelProviderConfig) =>
      createModelProvider(config).chat({
        message: "Connection test. Reply with one short sentence confirming BiteIQ can use this provider."
      })
  });

  function applyPreset(config: ModelProviderConfig) {
    upsertProviderConfig(config);
    reset(formValuesFromConfig(config));
  }

  const submit = handleSubmit((values) => {
    upsertProviderConfig(toProviderConfig(providerConfig, values));
    Alert.alert("Provider saved", "BiteIQ will use this AI provider for chat, meal analysis, and photo review.");
  });

  const testConnection = handleSubmit(async (values) => {
    try {
      const config = toProviderConfig(providerConfig, values);
      const result = await testMutation.mutateAsync(config);
      Alert.alert("Connection works", result.data.message);
    } catch (error) {
      Alert.alert("Connection failed", error instanceof Error ? error.message : "Check the provider URL, model, and API key.");
    }
  });

  return (
    <Screen>
      <ScreenHeader
        title="Data sources"
        subtitle="Where food data comes from, and which AI provider handles capture and chat"
        onBack={() => navigation.goBack()}
      />

      <FoodSourceSettingsCard />

      <Card style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <AppText variant="h3" weight="800">
              AI provider
            </AppText>
            <AppText variant="small" color={colors.muted}>
              Used by Assistant, meal drafts, label scans, and photo analysis.
            </AppText>
          </View>
          {testMutation.isPending ? <ActivityIndicator color={colors.primary} /> : null}
        </View>
        <View style={styles.presets}>
          {providerPresets.map((preset) => (
            <Button
              key={preset.id}
              label={preset.label}
              variant={preset.id === providerConfig.id ? "primary" : "secondary"}
              onPress={() => applyPreset(preset)}
              style={styles.presetButton}
            />
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <AppText variant="h3" weight="800">
          Connection
        </AppText>
        <View style={styles.typeGrid}>
          {providerTypes.map((type) => (
            <Button
              key={type}
              label={providerTypeLabel(type)}
              variant={type === selectedType ? "primary" : "secondary"}
              onPress={() => {
                setValue("providerType", type);
                const preset = providerPresets.find((item) => item.providerType === type);
                if (preset) {
                  reset(formValuesFromConfig(preset));
                }
              }}
              style={styles.typeButton}
            />
          ))}
        </View>
        <Controller control={control} name="label" render={({ field }) => <TextField label="Label" value={field.value} onChangeText={field.onChange} />} />
        <Controller control={control} name="baseUrl" render={({ field }) => <TextField label="API base URL" value={field.value} onChangeText={field.onChange} autoCapitalize="none" />} />
        <Controller control={control} name="modelName" render={({ field }) => <TextField label="Model" value={field.value} onChangeText={field.onChange} autoCapitalize="none" />} />
        <Controller
          control={control}
          name="timeoutMs"
          render={({ field }) => <TextField label="Timeout ms" keyboardType="number-pad" value={String(field.value)} onChangeText={field.onChange} />}
        />
        <AppText variant="tiny" color={colors.muted}>
          Provider credentials are managed by the BiteIQ server.
        </AppText>
      </Card>

      <View style={styles.actions}>
        <Button label="Test connection" icon="flash" variant="secondary" disabled={testMutation.isPending} onPress={testConnection} style={styles.actionButton} />
        <Button label="Save provider" icon="save" onPress={submit} style={styles.actionButton} />
      </View>
    </Screen>
  );
}

function formValuesFromConfig(config: ModelProviderConfig): FormValues {
  return {
    label: config.label,
    providerType: config.providerType,
    baseUrl: config.baseUrl,
    modelName: config.modelName,
    timeoutMs: config.timeoutMs
  };
}

function toProviderConfig(current: ModelProviderConfig, values: FormValues): ModelProviderConfig {
  const preset = providerPresets.find((item) => item.providerType === values.providerType);
  const base = preset || current;
  return {
    id: preset?.id || values.providerType,
    label: values.label,
    providerType: values.providerType,
    baseUrl: values.baseUrl,
    modelName: values.modelName,
    timeoutMs: values.timeoutMs,
    retryPolicy: base.retryPolicy,
    enabledTasks: [...base.enabledTasks]
  };
}

function providerTypeLabel(type: ProviderType) {
  if (type === "local-codex") return "Local Codex";
  if (type === "local-claude") return "Local Claude";
  if (type === "hosted") return "Hosted";
  return "Mock";
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm
  },
  card: {
    gap: spacing.md
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  presetButton: {
    minHeight: 42
  },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  typeButton: {
    minHeight: 42
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md
  },
  actionButton: {
    flex: 1
  }
});
