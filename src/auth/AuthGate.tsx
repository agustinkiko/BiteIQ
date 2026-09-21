import { useQueryClient } from "@tanstack/react-query";
import { PropsWithChildren, ReactNode, useEffect, useRef } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { authClient } from "@/auth/authClient";
import { clearSignedOutSessionData, clearUserSessionData } from "@/auth/sessionCleanup";
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
  const queryClient = useQueryClient();
  const sessionUserId = session.data?.user.id;
  const previousSessionUserId = useRef<string>();
  const storedUserId = useAppStore((state) => state.serverStateUserId);
  const localProfileExists = useAppStore(
    (state) =>
      Boolean(sessionUserId) &&
      state.hasCompletedOnboarding &&
      state.serverStateUserId === sessionUserId
  );
  const profileExists = hasProfile ?? localProfileExists;

  useEffect(() => {
    if (session.isPending) return;
    if (!sessionUserId) {
      clearSignedOutSessionData(queryClient, storedUserId ?? previousSessionUserId.current);
      previousSessionUserId.current = undefined;
      return;
    }
    if (previousSessionUserId.current && previousSessionUserId.current !== sessionUserId) {
      clearUserSessionData(queryClient, previousSessionUserId.current);
    } else if (storedUserId && storedUserId !== sessionUserId) {
      clearUserSessionData(queryClient, storedUserId);
    }
    previousSessionUserId.current = sessionUserId;
  }, [queryClient, session.isPending, sessionUserId, storedUserId]);

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
