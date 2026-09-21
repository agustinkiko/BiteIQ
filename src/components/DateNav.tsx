import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { PressableScale } from "@/components/motion";
import { colors, spacing } from "@/config/theme";
import { formatDiaryDate, isToday, todayKey } from "@/services/dates";
import { useAppStore } from "@/store/useAppStore";

/**
 * The diary date stepper: "‹  Today  ›". It writes straight to the store so
 * every day-scoped screen stays on the same date without prop drilling.
 */
export function DateNav({ compact }: { compact?: boolean }) {
  const selectedDate = useAppStore((state) => state.selectedDate);
  const shiftSelectedDate = useAppStore((state) => state.shiftSelectedDate);
  const setSelectedDate = useAppStore((state) => state.setSelectedDate);
  const today = isToday(selectedDate);

  return (
    <View style={[styles.row, compact ? styles.compact : null]}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel="Previous day"
        hitSlop={12}
        onPress={() => shiftSelectedDate(-1)}
        style={styles.arrow}
        pressedScale={0.85}
      >
        <Ionicons name="chevron-back" size={20} color={colors.subtle} />
      </PressableScale>

      <Pressable accessibilityRole="button" onPress={() => setSelectedDate(todayKey())} style={styles.label}>
        <AppText variant="h3" weight="600">
          {formatDiaryDate(selectedDate)}
        </AppText>
        {!today ? (
          <AppText variant="tiny" color={colors.primary} weight="600">
            Tap for today
          </AppText>
        ) : null}
      </Pressable>

      <PressableScale accessibilityRole="button" accessibilityLabel="Next day" hitSlop={12} onPress={() => shiftSelectedDate(1)} style={styles.arrow} pressedScale={0.85}>
        <Ionicons name="chevron-forward" size={20} color={colors.subtle} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between"
  },
  compact: {
    minHeight: 40
  },
  arrow: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center"
  },
  label: {
    flex: 1,
    alignItems: "center"
  }
});
