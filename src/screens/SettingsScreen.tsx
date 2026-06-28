import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { z } from "zod";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { providerPresets } from "@/config/defaults";
import { colors, spacing } from "@/config/theme";
import { useAppStore } from "@/store/useAppStore";
import { ModelProviderConfig, ProviderType } from "@/types/domain";

const schema = z.object({
  label: z.string().min(1),
  providerType: z.enum(["mock", "local-codex", "local-claude", "hosted"]),
  baseUrl: z.string().min(1),
  modelName: z.string().min(1),
  apiKey: z.string().optional(),
  timeoutMs: z.coerce.number().min(1000).max(120000)
});

type FormValues = z.infer<typeof schema>;

export function SettingsScreen() {
  const providerConfig = useAppStore((state) => state.providerConfig);
  const upsertProviderConfig = useAppStore((state) => state.upsertProviderConfig);
  const { control, handleSubmit, reset } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      label: providerConfig.label,
      providerType: providerConfig.providerType,
      baseUrl: providerConfig.baseUrl,
      modelName: providerConfig.modelName,
      apiKey: providerConfig.apiKey || "",
      timeoutMs: providerConfig.timeoutMs
    }
  });

  function applyPreset(config: ModelProviderConfig) {
    upsertProviderConfig(config);
    reset({
      label: config.label,
      providerType: config.providerType,
      baseUrl: config.baseUrl,
      modelName: config.modelName,
      apiKey: config.apiKey || "",
      timeoutMs: config.timeoutMs
    });
  }

  const submit = handleSubmit((values) => {
    upsertProviderConfig({
      ...providerConfig,
      ...values,
      providerType: values.providerType as ProviderType
    });
  });

  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="title" weight="800">Settings</AppText>
        <AppText color={colors.muted}>Switch between mock AI, local Codex, local Claude, or a future hosted provider.</AppText>
      </View>

      <Card style={styles.card}>
        <AppText variant="h3" weight="800">Provider presets</AppText>
        <View style={styles.presets}>
          {providerPresets.map((preset) => (
            <Button key={preset.id} label={preset.label} variant={preset.id === providerConfig.id ? "primary" : "secondary"} onPress={() => applyPreset(preset)} style={styles.presetButton} />
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <Controller control={control} name="label" render={({ field }) => <TextField label="Label" value={field.value} onChangeText={field.onChange} />} />
        <Controller control={control} name="providerType" render={({ field }) => <TextField label="Provider type" value={field.value} onChangeText={field.onChange} />} />
        <Controller control={control} name="baseUrl" render={({ field }) => <TextField label="Base URL" value={field.value} onChangeText={field.onChange} autoCapitalize="none" />} />
        <Controller control={control} name="modelName" render={({ field }) => <TextField label="Model" value={field.value} onChangeText={field.onChange} autoCapitalize="none" />} />
        <Controller control={control} name="apiKey" render={({ field }) => <TextField label="API key" value={field.value} onChangeText={field.onChange} autoCapitalize="none" secureTextEntry />} />
        <Controller control={control} name="timeoutMs" render={({ field }) => <TextField label="Timeout ms" keyboardType="number-pad" value={String(field.value)} onChangeText={field.onChange} />} />
      </Card>

      <Button label="Save provider" icon="save" onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm
  },
  card: {
    gap: spacing.md
  },
  presets: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  presetButton: {
    minHeight: 42
  }
});
