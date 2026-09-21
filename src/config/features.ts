export const DEVELOPMENT_PREVIEW = "Development preview" as const;

export type DeferredFeature =
  | "mealPhoto"
  | "barcode"
  | "label"
  | "voice"
  | "naturalLanguageAi"
  | "quickAdd"
  | "fasting"
  | "subscriptions"
  | "planning"
  | "water"
  | "exercise"
  | "weightProgress"
  | "aiProviderConfig"
  | "weeklyAnalytics"
  | "localFoodHistory";

export type FeatureGate = {
  enabled: boolean;
  label?: typeof DEVELOPMENT_PREVIEW;
};

export type FeatureFlags = Record<DeferredFeature, FeatureGate>;

const deferredFeatures: DeferredFeature[] = [
  "mealPhoto",
  "barcode",
  "label",
  "voice",
  "naturalLanguageAi",
  "quickAdd",
  "fasting",
  "subscriptions",
  "planning",
  "water",
  "exercise",
  "weightProgress",
  "aiProviderConfig",
  "weeklyAnalytics",
  "localFoodHistory"
];

export function createFeatureFlags(environment: string | undefined, previews = false): FeatureFlags {
  const development = environment === "development" && previews;
  return Object.fromEntries(
    deferredFeatures.map((feature) => [
      feature,
      development
        ? { enabled: true, label: DEVELOPMENT_PREVIEW }
        : { enabled: false }
    ])
  ) as FeatureFlags;
}

export const featureFlags = createFeatureFlags(
  process.env.NODE_ENV,
  process.env.EXPO_PUBLIC_ENABLE_PREVIEWS === "true"
);
