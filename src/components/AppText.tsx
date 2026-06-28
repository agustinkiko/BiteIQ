import { PropsWithChildren } from "react";
import { StyleSheet, Text, TextProps } from "react-native";

import { colors, typography } from "@/config/theme";

type Props = PropsWithChildren<TextProps & {
  variant?: "title" | "h1" | "h2" | "h3" | "body" | "small" | "tiny";
  color?: string;
  weight?: "400" | "500" | "600" | "700" | "800";
}>;

export function AppText({ children, variant = "body", color = colors.ink, weight = "400", style, ...rest }: Props) {
  return (
    <Text style={[styles.base, { fontSize: typography[variant], color, fontWeight: weight }, style]} {...rest}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    letterSpacing: 0,
    lineHeight: 22
  }
});
