import { LocalHttpProvider } from "@/services/ai/providers/localHttpProvider";
import { MockModelProvider } from "@/services/ai/providers/mockProvider";
import { ModelProvider } from "@/services/ai/providers/types";
import { ModelProviderConfig } from "@/types/domain";

export function createModelProvider(config: ModelProviderConfig): ModelProvider {
  if (config.providerType === "mock") {
    return new MockModelProvider(config);
  }

  return new LocalHttpProvider(config);
}
