import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { PressableScale } from "@/components/motion";
import { colors, radius, spacing } from "@/config/theme";
import { fromDateKey, isToday, shiftDateKey } from "@/services/dates";
import { useAppStore } from "@/store/useAppStore";

const letters = ["M", "T", "W", "T", "F", "S", "S"];

/**
 * Monday-to-Sunday strip for the selected date's week. Tapping a day selects
 * it; the chevrons step a whole week.
 */
export function WeekStrip() {
  const selectedDate = useAppStore((state) => state.selectedDate);
  const setSelectedDate = useAppStore((state) => state.setSelectedDate);
  const mondayOffset = (fromDateKey(selectedDate).getDay() + 6) % 7;
  const monday = shiftDateKey(selectedDate, -mondayOffset);
  const days = letters.map((letter, index) => {
    const key = shiftDateKey(monday, index);
    return { key, letter, day: fromDateKey(key).getDate() };
  });

  return (
    <View style={styles.row}>
      <PressableScale accessibilityRole="button" accessibilityLabel="Previous week" hitSlop={8} onPress={() => setSelectedDate(shiftDateKey(selectedDate, -7))} style={styles.arrow} pressedScale={0.85}>
        <Ionicons name="chevron-back" size={16} color={colors.subtle} />
      </PressableScale>
      {days.map((day) => {
        const selected = day.key === selectedDate;
        return (
          <Pressable
            key={day.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={fromDateKey(day.key).toDateString()}
            onPress={() => setSelectedDate(day.key)}
            style={[styles.day, selected ? styles.daySelected : null]}
          >
            <AppText variant="tiny" weight="600" color={selected ? colors.onPrimary : colors.subtle}>
              {day.letter}
            </AppText>
            <AppText variant="small" weight="700" color={selected ? colors.onPrimary : isToday(day.key) ? colors.primary : colors.ink}>
              {day.day}
            </AppText>
          </Pressable>
        );
      })}
      <PressableScale accessibilityRole="button" accessibilityLabel="Next week" hitSlop={8} onPress={() => setSelectedDate(shiftDateKey(selectedDate, 7))} style={styles.arrow} pressedScale={0.85}>
        <Ionicons name="chevron-forward" size={16} color={colors.subtle} />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2
  },
  arrow: {
    width: 24,
    height: 44,
    alignItems: "center",
    justifyContent: "center"
  },
  day: {
    flex: 1,
    minHeight: 50,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: spacing.xs
  },
  daySelected: {
    backgroundColor: colors.primary
  }
});
