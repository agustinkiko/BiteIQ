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
import { getFoodByBarcode } from "@/data/foodDatabase";
import { useDayLog } from "@/hooks/useDayLog";
import { formatDiaryDate } from "@/services/dates";
import { lookupBarcode } from "@/services/food/foodSources";
import { buildMealDraft } from "@/services/mealPipeline";
import { useAppStore } from "@/store/useAppStore";
import { CaptureInput } from "@/types/ai";
import { CaptureMode } from "@/types/domain";
import { RootStackParamList } from "@/types/navigation";

type Props = NativeStackScreenProps<RootStackParamList, "AddMeal">;

export function AddMealScreen({ navigation, route }: Props) {
  const [text, setText] = useState("");
  const [barcode, setBarcode] = useState("");
  const user = useAppStore((state) => state.user);
  const goal = useAppStore((state) => state.goal);
  const providerConfig = useAppStore((state) => state.providerConfig);
  const foodSourceConfig = useAppStore((state) => state.foodSourceConfig);
  const saveDraft = useAppStore((state) => state.saveDraft);
  const cacheFood = useAppStore((state) => state.cacheFood);
  const { date, log } = useDayLog(route.params?.date);

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

  /**
   * Barcodes resolve against the food catalogs first — an exact packaged-food
   * match beats an AI estimate. Only unknown codes fall through to the model.
   */
  const barcodeMutation = useMutation({
    mutationFn: async (code: string) => {
      const local = getFoodByBarcode(code);
      if (local) return local;
      return lookupBarcode(code, foodSourceConfig);
    },
    onSuccess: (food, code) => {
      if (food) {
        cacheFood(food);
        navigation.replace("FoodDetail", {
          mode: "add",
          date,
          mealType: route.params?.mealType || "snack",
          foodId: food.id
        });
        return;
      }
      mutation.mutate({ mode: "barcode", text: `Barcode ${code}`, barcode: code, mealType: route.params?.mealType });
    },
    onError: (error) => Alert.alert("Barcode lookup failed", error instanceof Error ? error.message : "Please try again.")
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
      if (!barcode.trim()) {
        Alert.alert("Enter a barcode", "Type the number under the barcode, or use a photo capture instead.");
        return;
      }
      barcodeMutation.mutate(barcode.trim());
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
          AI capture
        </AppText>
        <AppText variant="small" color={colors.muted}>
          {formatDiaryDate(date)}
          {route.params?.mealType ? ` • ${route.params.mealType}` : ""}
        </AppText>
      </View>

      <CaptureOption
        featured
        icon="camera"
        title="Scan a meal"
        detail="Take a photo and let AI identify foods, portions, and macros."
        onPress={() => submitCapture("photo")}
      />

      <CaptureOption
        icon="document-text"
        title="Nutrition label"
        detail="Extract facts from a label photo."
        onPress={() => submitCapture("label")}
      />

      <Card style={styles.textCard}>
        <TextField
          label="Barcode"
          value={barcode}
          onChangeText={setBarcode}
          placeholder="e.g. 737628064502"
          keyboardType="number-pad"
        />
        <AppText variant="tiny" color={colors.muted}>
          Looked up in Open Food Facts and your other enabled catalogs first, then estimated by AI if the code is unknown.
        </AppText>
        <Button label="Look up barcode" icon="barcode" onPress={() => submitCapture("barcode")} />
      </Card>

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

      {mutation.isPending || barcodeMutation.isPending ? (
        <Card style={styles.loading}>
          <ActivityIndicator color={colors.primary} />
          <AppText color={colors.muted}>
            {barcodeMutation.isPending ? "Looking up the barcode..." : "Estimating foods, servings, and macros..."}
          </AppText>
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
