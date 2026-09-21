import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { authClient } from "@/auth/authClient";
import { clearUserSessionData } from "@/auth/sessionCleanup";
import { AppText } from "@/components/AppText";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { DEVELOPMENT_PREVIEW, featureFlags } from "@/config/features";
import { colors, radius, spacing } from "@/config/theme";
import { todayKey } from "@/services/dates";
import { useAppStore } from "@/store/useAppStore";

type Row = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
  tint?: string;
};

export function MoreScreen({ navigation }: { navigation: any }) {
  const queryClient = useQueryClient();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string>();
  const user = useAppStore((state) => state.user);
  const serverStateUserId = useAppStore((state) => state.serverStateUserId);
  const goal = useAppStore((state) => state.goal);
  const providerConfig = useAppStore((state) => state.providerConfig);
  const selectedDate = useAppStore((state) => state.selectedDate);
  const capturePreviewEnabled =
    featureFlags.mealPhoto.enabled ||
    featureFlags.barcode.enabled ||
    featureFlags.label.enabled ||
    featureFlags.voice.enabled ||
    featureFlags.naturalLanguageAi.enabled;

  const sections: { title: string; rows: Row[] }[] = [
    {
      title: "Tracking",
      rows: [
        {
          icon: "flag" as const,
          title: "Goals",
          detail: `${Math.round(goal.calories)} cal • ${round1(goal.proteinGrams)}p / ${round1(goal.carbGrams)}c / ${round1(goal.fatGrams)}f`,
          onPress: () => navigation.navigate("Goals")
        },
        {
          icon: "pie-chart" as const,
          title: "Nutrition",
          detail: "Daily nutrients, macro split, and 7-day calories",
          onPress: () => navigation.navigate("Nutrition", { date: selectedDate || todayKey() })
        },
        ...(featureFlags.exercise.enabled
          ? [{
              icon: "barbell" as const,
              title: "Exercise",
              detail: DEVELOPMENT_PREVIEW,
              onPress: () => navigation.navigate("Exercise", { date: selectedDate || todayKey() })
            }]
          : [])
      ]
    },
    {
      title: "AI",
      rows: [
        ...(featureFlags.naturalLanguageAi.enabled
          ? [
              {
                icon: "sparkles" as const,
                title: "Assistant",
                detail: DEVELOPMENT_PREVIEW,
                onPress: () => navigation.navigate("Assistant"),
                tint: colors.gold
              }
            ]
          : []),
        ...(capturePreviewEnabled
          ? [
              {
                icon: "camera" as const,
                title: "AI capture",
                detail: DEVELOPMENT_PREVIEW,
                onPress: () => navigation.navigate("AddMeal"),
                tint: colors.gold
              }
            ]
          : []),
        ...(featureFlags.aiProviderConfig.enabled
          ? [{
              icon: "settings" as const,
              title: "AI provider",
              detail: `${DEVELOPMENT_PREVIEW} • ${providerConfig.label} • ${providerConfig.modelName}`,
              onPress: () => navigation.navigate("Settings"),
              tint: colors.gold
            }]
          : [])
      ]
    }
  ].filter((section) => section.rows.length > 0);

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);
    setSignOutError(undefined);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setSignOutError("Could not sign out. Check your connection and try again.");
        return;
      }
      const userId = serverStateUserId ?? user.id;
      clearUserSessionData(queryClient, userId);
    } catch {
      setSignOutError("Could not sign out. Check your connection and try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <Screen contentStyle={styles.screen}>
      <View style={styles.profile}>
        <View style={styles.avatar}>
          <AppText variant="h2" weight="800" color={colors.primary}>
            {user.name.slice(0, 1).toUpperCase()}
          </AppText>
        </View>
        <View style={styles.profileCopy}>
          <AppText variant="h1" weight="800">
            {user.name}
          </AppText>
          <AppText variant="small" color={colors.muted}>
            {user.activityLevel} activity
          </AppText>
        </View>
      </View>

      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <AppText variant="small" weight="700" color={colors.subtle} style={styles.sectionLabel}>
            {section.title}
          </AppText>
          <Card style={styles.card}>
            {section.rows.map((row, index) => (
              <Pressable
                key={row.title}
                accessibilityRole="button"
                onPress={row.onPress}
                style={({ pressed }) => [styles.row, index > 0 ? styles.rowDivider : null, { opacity: pressed ? 0.7 : 1 }]}
              >
                <View style={[styles.icon, { backgroundColor: `${row.tint || colors.primary}1F` }]}>
                  <Ionicons name={row.icon} size={20} color={row.tint || colors.primary} />
                </View>
                <View style={styles.rowCopy}>
                  <AppText weight="700">{row.title}</AppText>
                  <AppText variant="small" color={colors.muted} numberOfLines={1}>
                    {row.detail}
                  </AppText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.subtle} />
              </Pressable>
            ))}
          </Card>
        </View>
      ))}

      <View style={styles.section}>
        <AppText variant="small" weight="700" color={colors.subtle} style={styles.sectionLabel}>
          Account
        </AppText>
        <Card style={styles.card}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            disabled={isSigningOut}
            onPress={() => void handleSignOut()}
            style={({ pressed }) => [styles.row, { opacity: pressed || isSigningOut ? 0.7 : 1 }]}
          >
            <View style={[styles.icon, { backgroundColor: colors.dangerSoft }]}>
              <Ionicons name="log-out" size={20} color={colors.danger} />
            </View>
            <View style={styles.rowCopy}>
              <AppText weight="700" color={colors.danger}>
                {isSigningOut ? "Signing out…" : "Sign out"}
              </AppText>
              <AppText variant="small" color={colors.muted}>
                Server diary data stays in your private account
              </AppText>
            </View>
          </Pressable>
        </Card>
        {signOutError ? <AppText accessibilityRole="alert" color={colors.danger}>{signOutError}</AppText> : null}
      </View>
    </Screen>
  );
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.lg
  },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: radius.lg + 2,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryDark,
    borderWidth: 1,
    borderColor: colors.primaryLine
  },
  sectionLabel: {
    paddingHorizontal: spacing.xs
  },
  profileCopy: {
    flex: 1,
    gap: 2
  },
  section: {
    gap: spacing.sm
  },
  card: {
    padding: 0,
    overflow: "hidden"
  },
  row: {
    minHeight: 68,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center"
  },
  rowCopy: {
    flex: 1,
    gap: 2
  }
});
