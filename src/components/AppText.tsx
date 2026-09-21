import { PropsWithChildren } from "react";
import { StyleSheet, Text, TextProps } from "react-native";

import { colors, fonts, typography } from "@/config/theme";

type Variant = keyof typeof typography;

type Props = PropsWithChildren<TextProps & {
  variant?: Variant;
  color?: string;
  weight?: keyof typeof fonts;
}>;

/**
 * Every weight is its own Inter file, so weight selects the family rather
 * than `fontWeight` — setting both makes browsers synthesize a double bold.
 */
export function AppText({ children, variant = "body", color = colors.ink, weight = "400", style, ...rest }: Props) {
  return (
    <Text
      style={[
        styles.base,
        { fontFamily: fonts[weight], fontSize: typography[variant], lineHeight: lineHeights[variant], letterSpacing: tracking[variant], color },
        style
      ]}
      {...rest}
    >
      {children}
    </Text>
  );
}

const lineHeights: Record<Variant, number> = {
  display: 50,
  title: 38,
  h1: 30,
  h2: 25,
  h3: 22,
  body: 22,
  small: 18,
  tiny: 15
};

/** Big type tightens, small type opens up. */
const tracking: Record<Variant, number> = {
  display: -1.3,
  title: -0.8,
  h1: -0.4,
  h2: -0.2,
  h3: -0.1,
  body: 0,
  small: 0,
  tiny: 0.1
};

const styles = StyleSheet.create({
  base: {
    // Numbers line up in every column and don't jitter while counting.
    fontVariant: ["tabular-nums"]
  }
});
