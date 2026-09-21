import { useState } from "react";
import { Platform, StyleProp, StyleSheet, TextInput, TextInputProps, TextStyle, View, ViewStyle } from "react-native";

import { AppText } from "@/components/AppText";
import { colors, fonts, radius, spacing } from "@/config/theme";

type Props = TextInputProps & {
  /** Omit for unlabelled inputs, e.g. a stepper's numeric field. */
  label?: string;
  error?: string;
  /** Style for the label + input wrapper, e.g. `flex: 1` inside a row. */
  containerStyle?: StyleProp<ViewStyle>;
};

export function TextField({ label, error, style, containerStyle, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.wrap, containerStyle]}>
      {label ? (
        <AppText variant="small" color={colors.muted} weight="600">
          {label}
        </AppText>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.subtle}
        style={[styles.input, noBrowserOutline, focused ? styles.focused : null, error ? styles.invalid : null, style]}
        selectionColor={colors.primary}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...rest}
      />
      {error ? (
        <AppText variant="tiny" color={colors.danger}>
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

/**
 * The browser's own focus ring doubles up with the border highlight below,
 * which already marks focus. `outlineStyle` is web-only and untyped in RN 0.74.
 */
export const noBrowserOutline = (Platform.OS === "web" ? { outlineStyle: "none" } : null) as TextStyle | null;

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    minWidth: 0
  },
  input: {
    minHeight: 52,
    width: "100%",
    minWidth: 0,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg - 2,
    color: colors.ink,
    fontFamily: fonts["500"],
    fontSize: 16
  },
  focused: {
    borderColor: colors.primary
  },
  invalid: {
    borderColor: colors.danger
  }
});
