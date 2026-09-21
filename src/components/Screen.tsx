import { PropsWithChildren, ReactNode } from "react";
import { ScrollView, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, layout, spacing } from "@/config/theme";

type Props = PropsWithChildren<{
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  /** Column width on tablets and desktop. Phones always use the full width. */
  maxWidth?: number;
  /** Decorative layer painted behind the content, e.g. an ambient glow. */
  backdrop?: ReactNode;
}>;

export function Screen({ children, scroll = true, contentStyle, maxWidth = layout.maxContentWidth, backdrop }: Props) {
  const column = [styles.content, { maxWidth }, contentStyle];

  return (
    <SafeAreaView style={styles.safe}>
      {backdrop}
      {scroll ? (
        <ScrollView
          style={styles.viewport}
          contentContainerStyle={column}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={column}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.background
  },
  viewport: {
    flex: 1,
    minHeight: 0
  },
  content: {
    flexGrow: 1,
    width: "100%",
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl + spacing.lg
  }
});
