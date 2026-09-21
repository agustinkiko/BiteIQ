import { PropsWithChildren } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { colors, elevation, radius, spacing } from "@/config/theme";

/** White card with a soft, cool-tinted shadow lifting it off the pale canvas. */
export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...elevation.card
  }
});
