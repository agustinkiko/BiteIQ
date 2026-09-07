import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

import { authClient } from "@/auth/authClient";
import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { colors, spacing } from "@/config/theme";

type SignInResult = { error?: unknown | null };
type SignIn = (credentials: { email: string; password: string }) => Promise<SignInResult>;

type Props = {
  signIn?: SignIn;
};

const INVALID_CREDENTIALS = "Email or password is incorrect.";

export function LoginScreen({ signIn = (credentials) => authClient.signIn.email(credentials) }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const submissionLocked = useRef(false);

  async function submit() {
    if (submissionLocked.current) return;

    submissionLocked.current = true;
    setIsSubmitting(true);
    setError(undefined);

    try {
      const result = await signIn({ email: email.trim(), password });
      if (result.error) setError(INVALID_CREDENTIALS);
    } catch {
      setError(INVALID_CREDENTIALS);
    } finally {
      submissionLocked.current = false;
      setIsSubmitting(false);
    }
  }

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.hero}>
        <AppText variant="title" weight="800">
          biteIQ
        </AppText>
        <AppText variant="h2" weight="700">
          Sign in to continue
        </AppText>
        <AppText color={colors.muted}>Use the private account created by your BiteIQ administrator.</AppText>
      </View>

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
          value={password}
          onChangeText={setPassword}
        />
        {error ? <AppText color={colors.danger}>{error}</AppText> : null}
        <Button
          label={isSubmitting ? "Signing in…" : "Sign in"}
          onPress={submit}
          disabled={isSubmitting || !email.trim() || !password}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    justifyContent: "center"
  },
  hero: {
    gap: spacing.sm
  },
  form: {
    gap: spacing.lg
  }
});
