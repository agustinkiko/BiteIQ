import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { colors, radius, spacing } from "@/config/theme";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
  featured?: boolean;
};

export function CaptureOption({ icon, title, detail, onPress, featured }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        featured ? styles.featured : null,
        { opacity: pressed ? 0.84 : 1 }
      ]}
    >
      <View style={[styles.icon, featured ? styles.featuredIcon : null]}>
        <Ionicons name={icon} size={24} color={featured ? "#FFFFFF" : colors.primary} />
      </View>
      <View style={styles.copy}>
        <AppText variant="h3" weight="800" color={featured ? "#FFFFFF" : colors.ink}>
          {title}
        </AppText>
        <AppText variant="small" color={featured ? "#DCEDEA" : colors.muted}>
          {detail}
        </AppText>
      </View>
      <Ionicons name="chevron-forward" size={18} color={featured ? "#FFFFFF" : colors.subtle} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 84,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  featured: {
    backgroundColor: colors.primary,
    borderColor: colors.primary
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  featuredIcon: {
    backgroundColor: "rgba(255,255,255,0.18)"
  },
  copy: {
    flex: 1,
    gap: spacing.xs
  }
});
