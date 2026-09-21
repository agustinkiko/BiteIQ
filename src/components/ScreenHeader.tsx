import { Ionicons } from "@expo/vector-icons";
import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { PressableScale } from "@/components/motion";
import { colors, spacing } from "@/config/theme";

type Props = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
};

/** "← Title" — a plain back arrow beside a bold title, as in the design. */
export function ScreenHeader({ title, subtitle, onBack, right }: Props) {
  return (
    <View style={styles.row}>
      {onBack ? (
        <PressableScale accessibilityRole="button" accessibilityLabel="Back" hitSlop={12} onPress={onBack} style={styles.back} pressedScale={0.85}>
          <Ionicons name="arrow-back" size={24} color={colors.ink} />
        </PressableScale>
      ) : null}
      <View style={styles.copy}>
        <AppText variant="h2" weight="700" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" color={colors.muted} numberOfLines={1}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  back: {
    width: 32,
    height: 40,
    alignItems: "flex-start",
    justifyContent: "center"
  },
  copy: {
    flex: 1
  }
});
