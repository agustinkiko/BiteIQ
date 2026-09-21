import { LocalHttpProvider } from "@/services/ai/providers/localHttpProvider";
import { MockModelProvider } from "@/services/ai/providers/mockProvider";
import { ModelProvider } from "@/services/ai/providers/types";
import { ModelProviderConfig } from "@/types/domain";

export function createModelProvider(config: ModelProviderConfig): ModelProvider {
  if (config.providerType === "mock") {
    return new MockModelProvider(config);
  }
  if (["local-codex", "local-claude", "hosted"].includes(config.providerType)) {
    return new LocalHttpProvider(config);
  }

  throw new Error("Direct AI provider credentials are not supported in the client.");
}
