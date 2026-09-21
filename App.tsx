import "react-native-gesture-handler";

import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts
} from "@expo-google-fonts/inter";
import { DefaultTheme, NavigationContainer, Theme } from "@react-navigation/native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { PropsWithChildren, useMemo } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AuthGate } from "@/auth/AuthGate";
import { colors } from "@/config/theme";
import { AppNavigator } from "@/navigation/AppNavigator";
import { useAppStore } from "@/store/useAppStore";
import { useOfflineStore } from "@/store/useOfflineStore";

/** Keeps navigator backgrounds on-palette during screen transitions. */
const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.backgroundElevated,
    text: colors.ink,
    border: colors.border,
    notification: colors.accent
  }
};

export default function App() {
  const queryClient = useMemo(() => new QueryClient(), []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <NavigationContainer theme={navigationTheme} documentTitle={{ formatter: () => "biteIQ" }}>
          <StatusBar style="dark" backgroundColor={colors.background} />
          <FontGate>
            <AppReadyGate>
              <AuthGate>
                <AppNavigator />
              </AuthGate>
            </AppReadyGate>
          </FontGate>
        </NavigationContainer>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}

/**
 * Fonts ship in the bundle, so this resolves almost immediately. A load
 * failure falls through to system fonts rather than blocking the app.
 */
function FontGate({ children }: PropsWithChildren) {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold
  });
  if (fontsLoaded || fontError) return <>{children}</>;
  return <View style={styles.splash} />;
}

export function AppReadyGate({ children }: PropsWithChildren) {
  // Both stores use AsyncStorage. Subscribing to both prevents a cold-start
  // diary query from racing ahead of its cached day and queued creates.
  const hasAppHydrated = useAppStore((state) => state.hasHydrated);
  const hasOfflineHydrated = useOfflineStore((state) => state.hasHydrated);
  if (hasAppHydrated && hasOfflineHydrated) return <>{children}</>;
  return (
    <View style={styles.splash} accessibilityLabel="Loading saved data">
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background
  }
});
