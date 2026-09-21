import { StyleSheet } from "react-native";

import { AppText } from "@/components/AppText";
import { colors } from "@/config/theme";

type Props = {
  size?: "sm" | "lg";
};

/** The biteIQ wordmark: lowercase, heavy, brand blue. */
export function BrandMark({ size = "sm" }: Props) {
  const large = size === "lg";
  return (
    <AppText
      accessibilityRole="header"
      variant={large ? "title" : "h2"}
      weight="800"
      color={colors.primary}
      style={large ? styles.large : styles.small}
    >
      biteIQ
    </AppText>
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 22,
    letterSpacing: -0.6
  },
  large: {
    letterSpacing: -1.1
  }
});
