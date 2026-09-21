import { Ionicons } from "@expo/vector-icons";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { authClient } from "@/auth/authClient";
import { AmbientGlow } from "@/components/AmbientGlow";
import { AppText } from "@/components/AppText";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Reveal } from "@/components/motion";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { colors, layout, radius, spacing } from "@/config/theme";

type SignInResult = { error?: unknown | null };
type SignIn = (credentials: { email: string; password: string }) => Promise<SignInResult>;

type Props = {
  signIn?: SignIn;
};

const INVALID_CREDENTIALS = "Email or password is incorrect.";
const CONNECTION_ERROR = "Could not reach BiteIQ. Check your connection and try again.";

function loginError(error: unknown): string {
  const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
  if (status === 401) return INVALID_CREDENTIALS;
  if (status === 429) return "Too many sign-in attempts. Please wait a minute and try again.";
  return CONNECTION_ERROR;
}

export function LoginScreen({ signIn = (credentials) => authClient.signIn.email(credentials) }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const submissionLocked = useRef(false);

  async function submit() {
    if (submissionLocked.current || !email.trim() || !password) return;

    submissionLocked.current = true;
    setIsSubmitting(true);
    setError(undefined);

    try {
      const result = await signIn({ email: email.trim(), password });
      if (result.error) setError(loginError(result.error));
    } catch {
      setError(CONNECTION_ERROR);
    } finally {
      submissionLocked.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <Screen contentStyle={styles.content} maxWidth={layout.maxFormWidth} backdrop={<AmbientGlow height={560} />}>
      <Reveal index={0} style={styles.hero}>
        <BrandMark size="lg" />
        <View style={styles.heading}>
          <AppText variant="title" weight="800">
            Sign in to continue
          </AppText>
          <AppText color={colors.muted}>Use the private account created by your BiteIQ administrator.</AppText>
        </View>
      </Reveal>

      <Reveal index={1}>
        <Card style={styles.form}>
          <TextField
            label="Email"
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            value={email}
            onChangeText={setEmail}
          />
          <TextField
            label="Password"
            placeholder="Password"
            secureTextEntry
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={submit}
            value={password}
            onChangeText={setPassword}
          />
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={18} color={colors.danger} />
              <AppText accessibilityRole="alert" variant="small" color={colors.danger} style={styles.errorText}>
                {error}
              </AppText>
            </View>
          ) : null}
          <Button
            label={isSubmitting ? "Signing in…" : "Sign in"}
            onPress={submit}
            disabled={isSubmitting || !email.trim() || !password}
          />
        </Card>
      </Reveal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: "center",
    gap: spacing.xl
  },
  hero: {
    gap: spacing.xl
  },
  heading: {
    gap: spacing.sm
  },
  form: {
    gap: spacing.lg
  },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSoft
  },
  errorText: {
    flex: 1
  }
});
