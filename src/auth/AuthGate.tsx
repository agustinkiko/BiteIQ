import { PropsWithChildren, ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { authClient } from "@/auth/authClient";
import { colors } from "@/config/theme";
import { LoginScreen } from "@/screens/LoginScreen";
import { OnboardingScreen } from "@/screens/OnboardingScreen";
import { useAppStore } from "@/store/useAppStore";

export type AuthGateSessionState = {
  data: { user: { id: string } } | null;
  isPending: boolean;
};

type Props = PropsWithChildren<{
  useSession?: () => AuthGateSessionState;
  hasProfile?: boolean;
  loadingFallback?: ReactNode;
  signedOutFallback?: ReactNode;
  profileSetupFallback?: ReactNode;
}>;

function useLiveSession(): AuthGateSessionState {
  const session = authClient.useSession();
  return {
    data: session.data ? { user: { id: session.data.user.id } } : null,
    isPending: session.isPending
  };
}

export function AuthGate({
  children,
  useSession = useLiveSession,
  hasProfile,
  loadingFallback = <LoadingSession />,
  signedOutFallback = <LoginScreen />,
  profileSetupFallback = <OnboardingScreen />
}: Props) {
  const session = useSession();
  const localProfileExists = useAppStore((state) => state.hasCompletedOnboarding);
  const profileExists = hasProfile ?? localProfileExists;

  if (session.isPending) return <>{loadingFallback}</>;
  if (!session.data) return <>{signedOutFallback}</>;
  if (!profileExists) return <>{profileSetupFallback}</>;
  return <>{children}</>;
}

function LoadingSession() {
  return (
    <View style={styles.loading} accessibilityLabel="Checking session">
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background
  }
});
