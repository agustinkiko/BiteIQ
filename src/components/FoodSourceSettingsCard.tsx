import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Switch, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { currentFoodDevelopmentFeatures } from "@/config/defaults";
import { DEVELOPMENT_PREVIEW } from "@/config/features";
import { colors, radius, spacing } from "@/config/theme";
import { remoteSources } from "@/services/food/foodSources";
import { useAppStore } from "@/store/useAppStore";
import { FoodSourceId } from "@/types/domain";

type RemoteId = Exclude<FoodSourceId, "local">;

/**
 * Credential-free client sources only. Provider secrets stay on the server.
 */
export function FoodSourceSettingsCard() {
  const config = useAppStore((state) => state.foodSourceConfig);
  const updateFoodSource = useAppStore((state) => state.updateFoodSource);
  const showBundledExamples = currentFoodDevelopmentFeatures().bundledFoods;

  return (
    <Card style={styles.card}>
      <View>
        <AppText variant="h3" weight="800">
          Food databases
        </AppText>
        <AppText variant="small" color={colors.muted}>
          Canonical food search uses BiteIQ's server database.
        </AppText>
      </View>

      {showBundledExamples ? (
        <View style={styles.builtIn}>
          <Ionicons name="flask-outline" size={20} color={colors.warning} />
          <View style={styles.builtInCopy}>
            <AppText weight="700">Bundled food examples</AppText>
            <AppText variant="small" color={colors.warning}>
              {DEVELOPMENT_PREVIEW}
            </AppText>
          </View>
        </View>
      ) : null}

      {remoteSources.map((source) => {
        const id = source.id as RemoteId;
        const settings = config[id];
        const configured = source.isConfigured(settings);

        return (
          <View key={id} style={styles.source}>
            <View style={styles.sourceHeader}>
              <View style={styles.sourceCopy}>
                <AppText weight="700">{source.label}</AppText>
                <AppText variant="tiny" color={colors.muted}>
                  {source.credentialHint}
                </AppText>
              </View>
              <Switch
                value={settings.enabled}
                onValueChange={(enabled) => updateFoodSource(id, { enabled })}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor="#FFFFFF"
              />
            </View>

            {settings.enabled && !configured ? (
              <View style={styles.warning}>
                <Ionicons name="alert-circle-outline" size={16} color={colors.warning} />
                <AppText variant="tiny" color={colors.warning} style={styles.warningText}>
                  {source.label} is unavailable in this client configuration.
                </AppText>
              </View>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg
  },
  builtIn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  builtInCopy: {
    flex: 1
  },
  source: {
    gap: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  sourceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  sourceCopy: {
    flex: 1,
    gap: 2
  },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.warningSoft
  },
  warningText: {
    flex: 1
  }
});
