import { Ionicons } from "@expo/vector-icons";
import { StyleProp, StyleSheet, ViewStyle } from "react-native";

import { AppText } from "@/components/AppText";
import { PressableScale } from "@/components/motion";
import { colors, radius, spacing } from "@/config/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger";

type Props = {
  label: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: Variant;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, icon, variant = "primary", disabled, style }: Props) {
  const palette = disabled ? disabledPalette(variant) : palettes[variant];
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, { backgroundColor: palette.background, borderColor: palette.border }, style]}
    >
      {icon ? <Ionicons name={icon} size={18} color={palette.text} /> : null}
      <AppText color={palette.text} weight="700">
        {label}
      </AppText>
    </PressableScale>
  );
}

const palettes: Record<Variant, { background: string; border: string; text: string }> = {
  primary: { background: colors.primary, border: colors.primary, text: colors.onPrimary },
  secondary: { background: colors.surface, border: colors.borderStrong, text: colors.ink },
  ghost: { background: "transparent", border: "transparent", text: colors.primary },
  danger: { background: colors.danger, border: colors.danger, text: colors.onDanger }
};

/** Disabled reads as "not yet", never as a faded brand color that looks broken. */
function disabledPalette(variant: Variant) {
  if (variant === "ghost") return { background: "transparent", border: "transparent", text: colors.subtle };
  return { background: colors.surfaceRaised, border: colors.surfaceRaised, text: colors.subtle };
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.xl,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: spacing.sm
  }
});
