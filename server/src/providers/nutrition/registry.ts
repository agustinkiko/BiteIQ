import { createDevelopmentNutritionProvider } from "./development.js";
import type { NutritionProvider, NutritionProviderRegistry } from "./types.js";
import { createUsdaProvider } from "./usda.js";

export interface NutritionRegistryConfig {
  nodeEnv: string;
  usdaApiKey?: string;
}

export function createNutritionRegistry(config: NutritionRegistryConfig): NutritionProviderRegistry {
  const providers: NutritionProvider[] = [];
  const usdaApiKey = config.usdaApiKey?.trim();
  if (usdaApiKey) providers.push(createUsdaProvider({ apiKey: usdaApiKey }));
  if (config.nodeEnv !== "production") {
    providers.push(createDevelopmentNutritionProvider({ nodeEnv: config.nodeEnv }));
  }
  const providersById = new Map(providers.map((provider) => [provider.id, provider]));
  return {
    get(id) {
      return providersById.get(id);
    },
    list() {
      return [...providers];
    },
  };
}
