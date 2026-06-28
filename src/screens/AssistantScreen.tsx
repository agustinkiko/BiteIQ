import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, View } from "react-native";

import { AppText } from "@/components/AppText";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Screen } from "@/components/Screen";
import { TextField } from "@/components/TextField";
import { colors, radius, spacing } from "@/config/theme";
import { createModelProvider } from "@/services/ai/providerRegistry";
import { useAppStore } from "@/store/useAppStore";
import { ChatMessage } from "@/types/domain";

export function AssistantScreen() {
  const [message, setMessage] = useState("");
  const messages = useAppStore((state) => state.chatMessages);
  const addChatMessage = useAppStore((state) => state.addChatMessage);
  const providerConfig = useAppStore((state) => state.providerConfig);

  const mutation = useMutation({
    mutationFn: async (content: string) => createModelProvider(providerConfig).chat({ message: content }),
    onSuccess: (result) => {
      addChatMessage(makeMessage("assistant", result.data.message));
    }
  });

  function send(content = message) {
    if (!content.trim()) return;
    addChatMessage(makeMessage("user", content));
    setMessage("");
    mutation.mutate(content);
  }

  return (
    <Screen scroll={false}>
      <View style={styles.header}>
        <AppText variant="title" weight="800">Assistant</AppText>
        <AppText color={colors.muted}>Ask for macro math, meal ideas, or estimates.</AppText>
      </View>

      <View style={styles.chips}>
        {["How much protein today?", "What should I eat tonight?", "Estimate a burrito bowl"].map((prompt) => (
          <Button key={prompt} label={prompt} variant="secondary" onPress={() => send(prompt)} style={styles.chip} />
        ))}
      </View>

      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messages}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.role === "user" ? styles.userBubble : styles.assistantBubble]}>
            <AppText color={item.role === "user" ? "#FFFFFF" : colors.ink}>{item.content}</AppText>
          </View>
        )}
      />

      {mutation.isPending ? <ActivityIndicator color={colors.primary} /> : null}

      <Card style={styles.composer}>
        <TextField label="Message" value={message} onChangeText={setMessage} placeholder="Ask about your food..." />
        <Button label="Send" icon="send" onPress={() => send()} />
      </Card>
    </Screen>
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
  header: {
    gap: spacing.sm
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
  }
});
