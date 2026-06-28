import { StyleSheet, TextInput, TextInputProps, View } from "react-native";

import { AppText } from "@/components/AppText";
import { colors, radius, spacing } from "@/config/theme";

type Props = TextInputProps & {
  label: string;
  error?: string;
};

export function TextField({ label, error, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <AppText variant="small" color={colors.muted} weight="700">
        {label}
      </AppText>
      <TextInput
        placeholderTextColor={colors.subtle}
        style={[styles.input, style]}
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

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm
  },
  input: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    color: colors.ink,
    fontSize: 15
  }
});
