import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, ViewStyle } from "react-native";

import { colors, radius, spacing } from "@/config/theme";
import { AppText } from "@/components/AppText";

type Props = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  style?: ViewStyle;
};

export function Button({ label, onPress, icon, variant = "primary", disabled, style }: Props) {
  const palette = getPalette(variant);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.background, borderColor: palette.border, opacity: disabled ? 0.5 : pressed ? 0.82 : 1 },
        style
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={palette.text} /> : null}
      <AppText color={palette.text} weight="700">
        {label}
      </AppText>
    </Pressable>
  );
}

function getPalette(variant: Props["variant"]) {
  if (variant === "secondary") {
    return { background: colors.surface, border: colors.border, text: colors.ink };
  }
  if (variant === "ghost") {
    return { background: "transparent", border: "transparent", text: colors.primary };
  }
  return { background: colors.primary, border: colors.primary, text: "#FFFFFF" };
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm
  }
});
