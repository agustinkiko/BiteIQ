import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { colors, radius, spacing } from "@/config/theme";
import { mealCalories } from "@/services/nutritionMath";
import { Meal } from "@/types/domain";

type Props = {
  meal: Meal;
  onPress: () => void;
};

export function MealCard({ meal, onPress }: Props) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, { opacity: pressed ? 0.8 : 1 }]}>
      <View style={styles.iconWrap}>
        <Ionicons name={iconForCapture(meal.capturedWith)} size={20} color={colors.primary} />
      </View>
      <View style={styles.body}>
        <AppText variant="h3" weight="700">
          {meal.title}
        </AppText>
        <AppText variant="small" color={colors.muted}>
          {meal.mealType} • {meal.entries.length} item{meal.entries.length === 1 ? "" : "s"}
        </AppText>
      </View>
      <AppText variant="h3" weight="800">
        {Math.round(mealCalories(meal))}
      </AppText>
    </Pressable>
  );
}

function iconForCapture(mode: Meal["capturedWith"]): keyof typeof Ionicons.glyphMap {
  if (mode === "photo") return "camera";
  if (mode === "barcode") return "barcode";
  if (mode === "label") return "document-text";
  if (mode === "voice") return "mic";
  return "chatbox-ellipses";
}

const styles = StyleSheet.create({
  card: {
    minHeight: 76,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center"
  },
  body: {
    flex: 1,
    gap: spacing.xs
  }
});
