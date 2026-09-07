import type {
  CalculableFood,
  FoodServing,
  NutrientValues,
  NutritionBasisUnit,
} from "../../modules/foods/contracts.js";

export type VerificationState =
  | "verified_authoritative"
  | "verified_manufacturer"
  | "community"
  | "user_created"
  | "unverified";

export interface FoodSearchInput {
  query: string;
  limit: number;
}

export interface ProviderMetadata {
  id: string;
  displayName: string;
  attribution: string;
}

export interface ProviderFood extends CalculableFood {
  provider: string;
  externalId: string;
  dataType: string;
  name: string;
  brand: string | null;
  description: string | null;
  category: string | null;
  foodType: string;
  preparationState: string | null;
  ingredientsText: string | null;
  verificationState: VerificationState;
  sourceUpdatedAt: string | null;
  attribution: string;
  basisQuantity: string;
  basisUnit: NutritionBasisUnit;
  calories: string;
  nutrients: NutrientValues;
  servings: FoodServing[];
}

export interface NutritionProvider {
  readonly id: string;
  searchFoods(input: FoodSearchInput): Promise<ProviderFood[]>;
  getFood(externalId: string): Promise<ProviderFood | null>;
  lookupBarcode(barcode: string): Promise<ProviderFood | null>;
  providerMetadata(): ProviderMetadata;
}

export interface NutritionProviderRegistry {
  get(id: string): NutritionProvider | undefined;
  list(): NutritionProvider[];
}
