import { Ionicons } from "@expo/vector-icons";
import { useMutation } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { colors, radius, spacing } from "@/config/theme";
import { useTodayLog } from "@/hooks/useDayLog";
import { createModelProvider } from "@/services/ai/providerRegistry";
import { buildMealDraft } from "@/services/mealPipeline";
import { useAppStore } from "@/store/useAppStore";
import { CaptureInput } from "@/types/ai";
import { ChatMessage } from "@/types/domain";

export function AssistantScreen({ navigation }: any) {
  const [message, setMessage] = useState("");
  const messages = useAppStore((state) => state.chatMessages);
  const addChatMessage = useAppStore((state) => state.addChatMessage);
  const saveDraft = useAppStore((state) => state.saveDraft);
  const providerConfig = useAppStore((state) => state.providerConfig);
  const user = useAppStore((state) => state.user);
  const goal = useAppStore((state) => state.goal);
  const { log, totals } = useTodayLog();

  const chatMutation = useMutation({
    mutationFn: async (content: string) =>
      createModelProvider(providerConfig).chat({
        message: content,
        context: { user, goal, todayMeals: log.meals, providerConfig }
      }),
    onSuccess: (result) => {
      addChatMessage(makeMessage("assistant", result.data.message));
    },
    onError: (error) => {
      addChatMessage(makeMessage("assistant", error instanceof Error ? error.message : "I could not reach the selected AI provider."));
    }
  });

  const draftMutation = useMutation({
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
      addChatMessage(makeMessage("assistant", `I drafted "${draft.title}" for AI review. Confirm the foods and portions before saving.`));
      navigation.navigate("AIReview", { draftId: draft.draftId });
    },
    onError: (error) => {
      Alert.alert("Meal analysis failed", error instanceof Error ? error.message : "Please try again.");
    }
  });

  function send(content = message) {
    if (!content.trim()) return;
    addChatMessage(makeMessage("user", content));
    setMessage("");
    chatMutation.mutate(content);
  }

  function draftFromMessage() {
    if (!message.trim()) {
      Alert.alert("Describe the meal", "Type what you ate so the assistant can create an AI review draft.");
      return;
    }
    const content = message;
    addChatMessage(makeMessage("user", `Log food: ${content}`));
    setMessage("");
    draftMutation.mutate({ mode: "text", text: content });
  }

  async function uploadPhoto() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Photo access needed", "Allow photo library access to upload a meal image.");
      return;
    }

    const image = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.75,
      allowsEditing: false
    });
    if (image.canceled) return;

    addChatMessage(makeMessage("user", "Analyze this uploaded meal photo."));
    draftMutation.mutate({
      mode: "photo",
      imageUri: image.assets?.[0]?.uri,
      text: "Uploaded meal photo"
    });
  }

  async function capturePhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera permission needed", "Enable camera access to capture a meal photo.");
      return;
    }

    const image = await ImagePicker.launchCameraAsync({ quality: 0.75, allowsEditing: false });
    if (image.canceled) return;

    addChatMessage(makeMessage("user", "Analyze this captured meal photo."));
    draftMutation.mutate({
      mode: "photo",
      imageUri: image.assets?.[0]?.uri,
      text: "Captured meal photo"
    });
  }

  const busy = chatMutation.isPending || draftMutation.isPending;

  return (
    <Screen scroll={false} contentStyle={styles.screen}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
          <Ionicons name="chevron-back" size={26} color={colors.ink} />
        </Pressable>
        <View style={styles.headerCopy}>
          <AppText variant="h1" weight="800">
            AI Assistant
          </AppText>
          <AppText variant="small" color={colors.muted}>Chat, log food, analyze meals, or upload photos.</AppText>
        </View>
        <View style={styles.providerBadge}>
          <Ionicons name="sparkles" size={16} color={colors.primary} />
          <AppText variant="tiny" color={colors.primary} weight="800">
            {providerConfig.label}
          </AppText>
        </View>
      </View>

      <Card style={styles.contextCard}>
        <View style={styles.contextTop}>
          <View>
            <AppText variant="small" color={colors.muted} weight="800">
              Today
            </AppText>
            <AppText variant="h1" weight="800">
              {Math.round(totals.calories)} / {goal.calories} cal
            </AppText>
          </View>
          {busy ? <ActivityIndicator color={colors.primary} /> : <Ionicons name="pulse" size={28} color={colors.primary} />}
        </View>
        <View style={styles.macroStrip}>
          <MacroPill label="Protein" value={`${Math.round(totals.proteinGrams)}g`} />
          <MacroPill label="Carbs" value={`${Math.round(totals.carbGrams)}g`} />
          <MacroPill label="Fat" value={`${Math.round(totals.fatGrams)}g`} />
        </View>
      </Card>

      <View style={styles.actionGrid}>
        <AssistantAction icon="restaurant" label="Log food" detail="Turn typed food into an AI review draft." onPress={draftFromMessage} disabled={busy} />
        <AssistantAction icon="image" label="Upload photo" detail="Analyze a meal from your library." onPress={uploadPhoto} disabled={busy} />
        <AssistantAction icon="camera" label="Take photo" detail="Capture a meal for portion estimation." onPress={capturePhoto} disabled={busy} />
        <AssistantAction icon="analytics" label="Analyze today" detail="Ask for guidance from saved meals." onPress={() => send("Analyze today's meals and tell me what to focus on next.")} disabled={busy} />
      </View>

      <View style={styles.chips}>
        {["How much protein today?", "Estimate a burrito bowl", "What should I eat tonight?"].map((prompt) => (
          <Button key={prompt} label={prompt} variant="secondary" disabled={busy} onPress={() => send(prompt)} style={styles.chip} />
        ))}
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messages}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}>
            <AppText color={item.role === "user" ? colors.onPrimary : colors.ink}>{item.content}</AppText>
          </View>
        )}
      />

      <Card style={styles.composer}>
        <TextField label="Message or meal description" value={message} onChangeText={setMessage} placeholder="Example: tuna wrap with chips" />
        <View style={styles.composerActions}>
          <Button label="Ask" icon="send" variant="secondary" disabled={busy} onPress={() => send()} style={styles.composerButton} />
          <Button label="Log" icon="restaurant" disabled={busy} onPress={draftFromMessage} style={styles.composerButton} />
        </View>
      </Card>
    </Screen>
  );
}

function MacroPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.macroPill}>
      <AppText variant="tiny" color={colors.muted} weight="800">
        {label}
      </AppText>
      <AppText weight="800">{value}</AppText>
    </View>
  );
}

function AssistantAction({
  icon,
  label,
  detail,
  onPress,
  disabled
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.actionCard, { opacity: disabled ? 0.48 : pressed ? 0.82 : 1 }]}>
      <View style={styles.actionIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <AppText variant="h3" weight="800">
        {label}
      </AppText>
      <AppText variant="small" color={colors.muted}>
        {detail}
      </AppText>
    </Pressable>
  );
}

function makeMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: `${role}-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

const styles = StyleSheet.create({
  screen: {
    gap: spacing.md
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm
  },
  back: {
    width: 32,
    height: 44,
    marginLeft: -spacing.sm,
    alignItems: "center",
    justifyContent: "center"
  },
  headerCopy: {
    flex: 1,
    gap: 2
  },
  providerBadge: {
    maxWidth: 132,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.primaryDark
  },
  contextCard: {
    gap: spacing.md
  },
  contextTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md
  },
  macroStrip: {
    flexDirection: "row",
    gap: spacing.sm
  },
  macroPill: {
    flex: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.surfaceMuted
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.md
  },
  actionCard: {
    flexGrow: 1,
    flexBasis: "47%",
    minHeight: 132,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm
  },
  actionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryDark
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm
  },
  chip: {
    minHeight: 40
  },
  messages: {
    flexGrow: 1,
    gap: spacing.sm,
    paddingVertical: spacing.md
  },
  bubble: {
    maxWidth: "86%",
    borderRadius: radius.md,
    padding: spacing.md
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: colors.primary
  },
  assistantBubble: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border
  },
  composer: {
    gap: spacing.md
  },
  composerActions: {
    flexDirection: "row",
    gap: spacing.md
  },
  composerButton: {
    flex: 1
  }
});
