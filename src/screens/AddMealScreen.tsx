import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useMutation } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { CaptureOption } from "@/components/CaptureOption";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { colors, spacing } from "@/config/theme";
import { useTodayLog } from "@/hooks/useTodayLog";
import { buildMealDraft } from "@/services/mealPipeline";
import { useAppStore } from "@/store/useAppStore";
import { CaptureInput } from "@/types/ai";
import { CaptureMode } from "@/types/domain";
import { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "AddMeal">;

export function AddMealScreen({ navigation, route }: Props) {
  const [text, setText] = useState("");
  const user = useAppStore((state) => state.user);
  const goal = useAppStore((state) => state.goal);
  const providerConfig = useAppStore((state) => state.providerConfig);
  const saveDraft = useAppStore((state) => state.saveDraft);
  const { log } = useTodayLog();

  const mutation = useMutation({
    mutationFn: (input: CaptureInput) =>
      buildMealDraft({
        input,
        user,
        goal,
        todayMeals: log.meals,
        providerConfig
      }),
    onSuccess: (draft) => {
      saveDraft(draft);
      navigation.navigate("AIReview", { draftId: draft.draftId });
    },
    onError: (error) => Alert.alert("AI estimate failed", error instanceof Error ? error.message : "Please try again.")
  });

  async function submitCapture(mode: CaptureMode) {
    if (mode === "photo" || mode === "label") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Camera permission needed", "Enable camera access to capture food.");
        return;
      }
      const image = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false });
      if (image.canceled) return;
      mutation.mutate({
        mode,
        imageUri: image.assets?.[0]?.uri,
        text: mode === "label" ? "Nutrition label scan" : "Meal photo",
        mealType: route.params?.mealType
      });
      return;
    }

    if (mode === "barcode") {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert("Camera permission needed", "Enable camera access to scan barcodes.");
        return;
      }
      mutation.mutate({
        mode,
        text: "Barcode scan demo",
        barcode: "012345678905",
        mealType: route.params?.mealType
      });
      return;
    }

    if ((mode === "text" || mode === "voice") && !text.trim()) {
      Alert.alert("Add a description", "Type or dictate what you ate so the AI can estimate it.");
      return;
    }

    mutation.mutate({
      mode,
      text,
      mealType: route.params?.mealType
    });
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Button label="Back" variant="ghost" icon="chevron-back" onPress={() => navigation.goBack()} />
        <AppText variant="h1" weight="800">
          Add meal
        </AppText>
      </View>

      <CaptureOption
        featured
        icon="camera"
        title="Scan a meal"
        detail="Take a photo and let AI identify foods, portions, and macros."
        onPress={() => submitCapture("photo")}
      />

      <View style={styles.options}>
        <CaptureOption icon="barcode" title="Barcode" detail="Use packaged food data when available." onPress={() => submitCapture("barcode")} />
        <CaptureOption icon="document-text" title="Nutrition label" detail="Extract facts from a label photo." onPress={() => submitCapture("label")} />
      </View>

      <Card style={styles.textCard}>
        <TextField
          label="Describe it"
          value={text}
          onChangeText={setText}
          placeholder="Example: chicken rice bowl with vegetables"
          multiline
          style={styles.textArea}
        />
        <View style={styles.textActions}>
          <Button label="Ask AI" icon="sparkles" onPress={() => submitCapture("text")} style={styles.actionButton} />
          <Button label="Voice" icon="mic" variant="secondary" onPress={() => submitCapture("voice")} style={styles.actionButton} />
        </View>
      </Card>

      {mutation.isPending ? (
        <Card style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <AppText color={colors.muted}>Estimating foods, servings, and macros...</AppText>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: spacing.sm
  },
  options: {
    gap: spacing.md
  },
  textCard: {
    gap: spacing.lg
  },
  textArea: {
    minHeight: 88,
    textAlignVertical: "top",
    paddingTop: spacing.md
  },
  textActions: {
    flexDirection: "row",
    gap: spacing.md
  },
  actionButton: {
    flex: 1
  },
  loading: {
    alignItems: "center",
    gap: spacing.md
  }
});
